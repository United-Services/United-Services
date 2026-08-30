import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const RECONCILE_BATCH_SIZE = 100;
export const RECONCILE_BATCH_DELAY_MS = 250;

// The only models with a same-target uniqueness invariant a concurrent
// primary-side write could actually violate — see
// docs/BUSINESS_RULES.md rule 4 (AppointmentSlot.isBooked). Every other
// mirrored model replays as a plain last-write-wins upsert; these two
// get a conflict recorded instead of a silent overwrite/no-op whenever a
// replay doesn't apply as originally intended.
const CONFLICT_SENSITIVE_TABLES = new Set(['appointmentSlot', 'appointment']);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Replays FailoverWriteLog entries (writes made against the local
// standby while Postgres was in fallback mode) against primary now that
// it has recovered — called from FailoverReconciliationWorker's BullMQ
// processor, triggered by FailoverService's `postgres:recovered` event,
// never inline in a request. See docs/DISASTER_RECOVERY.md for the full
// design and its accepted tradeoffs.
@Injectable()
export class FailoverReconciliationService {
  private readonly logger = new Logger(FailoverReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reconcileAll(): Promise<{ replayed: number; conflicts: number }> {
    let replayed = 0;
    let conflicts = 0;
    for (;;) {
      const entries = await this.prisma.failoverWriteLog.findMany({
        where: { reconciledAt: null },
        orderBy: { writtenAt: 'asc' },
        take: RECONCILE_BATCH_SIZE,
      });
      if (entries.length === 0) break;

      for (const entry of entries) {
        const wasConflict = await this.replayEntry(entry);
        if (wasConflict) conflicts++;
        replayed++;
      }

      if (entries.length < RECONCILE_BATCH_SIZE) break;
      await sleep(RECONCILE_BATCH_DELAY_MS);
    }

    if (replayed > 0) {
      this.logger.log(
        `Reconciliation complete: ${replayed} write(s) replayed against primary, ${conflicts} conflict(s) flagged for review`,
      );
    }
    return { replayed, conflicts };
  }

  // Returns true if this entry produced a conflict (for a
  // CONFLICT_SENSITIVE_TABLES model whose replay didn't apply as
  // originally intended), false otherwise. Always marks the entry
  // reconciled — a flagged conflict is still "handled" in the sense that
  // it won't be replayed again; a human resolves it from FailoverConflict.
  private async replayEntry(entry: {
    id: string;
    tableName: string;
    operation: string;
    primaryKey: string;
    payload: unknown;
  }): Promise<boolean> {
    const client = this.prisma as unknown as Record<string, any>;
    const model = client[entry.tableName];
    let conflict = false;

    if (!model || typeof model[entry.operation] !== 'function') {
      this.logger.error(
        `Cannot replay FailoverWriteLog entry ${entry.id}: unknown model/operation ${entry.tableName}.${entry.operation}`,
      );
    } else {
      try {
        const result = await model[entry.operation](entry.payload);
        // A conditional updateMany/deleteMany that matched zero rows
        // means primary's row no longer satisfied the same `where` this
        // write originally depended on — e.g. AppointmentSlot.book()'s
        // `isBooked: false` guard — which is exactly the case where
        // silently treating this as "done" would hide a real conflict.
        const noopUpdate =
          entry.operation.endsWith('Many') &&
          typeof result === 'object' &&
          result !== null &&
          'count' in result &&
          (result as { count: number }).count === 0;
        if (noopUpdate && CONFLICT_SENSITIVE_TABLES.has(entry.tableName)) {
          await this.recordConflict(entry, model);
          conflict = true;
        }
      } catch (err) {
        if (CONFLICT_SENSITIVE_TABLES.has(entry.tableName)) {
          await this.recordConflict(entry, model);
          conflict = true;
        } else {
          this.logger.warn(
            `Reconciliation replay no-op for ${entry.tableName}.${entry.operation} (${entry.primaryKey}): ${(err as Error).message}`,
          );
        }
      }
    }

    await this.prisma.failoverWriteLog.update({
      where: { id: entry.id },
      data: { reconciledAt: new Date() },
    });
    return conflict;
  }

  private async recordConflict(
    entry: { tableName: string; primaryKey: string; payload: unknown },
    model: Record<string, any>,
  ) {
    const primaryPayload =
      entry.primaryKey !== 'n/a'
        ? await model.findUnique({ where: { id: entry.primaryKey } })
        : null;
    await this.prisma.failoverConflict.create({
      data: {
        tableName: entry.tableName,
        primaryKeyId: entry.primaryKey,
        localPayload: entry.payload as object,
        primaryPayload: (primaryPayload ?? { note: 'not found on primary' }) as object,
      },
    });
    this.logger.error(
      `Failover conflict recorded for ${entry.tableName} (${entry.primaryKey}) — a fallback-mode write could not be safely replayed against primary; needs manual review in FailoverConflict.`,
    );
  }
}
