import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaClient } from '../generated/prisma';

const execFileAsync = promisify(execFile);

// Every application model that should exist on the local standby —
// deliberately excludes FailoverWriteLog/FailoverConflict, which are
// local-outbox/primary-side bookkeeping respectively, not data to mirror
// either direction. Client property names (camelCase of the schema.prisma
// model name), matching what PrismaClient exposes.
//
// Order is load-bearing: it's a topological sort of schema.prisma's own
// foreign keys (parents before the children that reference them) — e.g.
// `totpCredential` references both `user` and `kekRegistry`, so both
// have to already exist locally before a totpCredential row can be
// upserted, or the FK constraint rejects it. syncAll() upserts in this
// order, then walks it in reverse for delete-reconciliation (a child row
// referencing a parent has to be deleted before the parent, for the
// same FK reason in the opposite direction).
const MIRRORED_MODELS = [
  'user',
  'kekRegistry',
  'allowedOrigin',
  'analyticsEvent',
  'ticket',
  'ticketArchive',
  'auditLogArchive',
  'contentTranslation',
  'totpCredential',
  'webAuthnCredential',
  'service',
  'appointmentSlot',
  'openPosition',
  'auditLog',
  'serviceFile',
  'serviceRequest',
  'appointment',
  'candidateApplication',
  'fileAccessRequest',
  'candidateDocument',
] as const;

// Every model above is keyed by `id` except KekRegistry, whose @id field
// is `keyId` (see schema.prisma) — upsertModel/deleteStaleLocalRows read
// this to know which field to cursor/order/upsert on instead of assuming
// `id` everywhere.
const PRIMARY_KEY_FIELD: Partial<Record<(typeof MIRRORED_MODELS)[number], string>> = {
  kekRegistry: 'keyId',
};
function primaryKeyField(model: (typeof MIRRORED_MODELS)[number]): string {
  return PRIMARY_KEY_FIELD[model] ?? 'id';
}

// Same reasoning as audit-log-archive.service.ts's constants: batched
// and paced specifically so this never becomes an unthrottled full-table
// dump against Supabase.
export const SYNC_BATCH_SIZE = 500;
export const SYNC_BATCH_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The actual mirror-sync work, run from DbMirrorSyncWorker's BullMQ
// processor — never on a request path. Keeps the local standby's schema
// (via `prisma migrate deploy`) and data in sync with primary, batch by
// batch, so a large table can never be synced in one unthrottled query.
// Deliberately uses its own dedicated local-write connection, entirely
// separate from PrismaService's internal local client (the one used for
// live failover routing) — a write made here is background replication
// housekeeping, not a fallback-mode write, and must never be mistaken
// for one by the write-log extension in prisma.module.ts.
@Injectable()
export class DbMirrorSyncService {
  private readonly logger = new Logger(DbMirrorSyncService.name);
  private localWriter: PrismaClient | null = null;

  constructor(private readonly primaryReader: PrismaService) {}

  private getLocalWriter(): PrismaClient {
    if (!this.localWriter) {
      this.localWriter = new PrismaClient({
        adapter: new PrismaPg({
          connectionString:
            process.env.LOCAL_DATABASE_URL ??
            'postgresql://united_services:united_services_local_standby@localhost:5432/united_services',
        }),
      });
    }
    return this.localWriter;
  }

  // Applies every migration in prisma/migrations/ to the local standby —
  // this is what creates every table and index there, from the exact
  // same history already used for primary, without a second migration
  // system. Same binary path docker-entrypoint.sh itself already uses
  // (present in the production image — `prisma` is a regular dependency,
  // not dev-only). prisma.config.ts's migrate commands read DIRECT_URL,
  // not DATABASE_URL (migrations need a non-pgbouncer connection) — see
  // that file's own comment — so that's the var overridden here.
  async ensureLocalSchema(): Promise<void> {
    const localUrl =
      process.env.LOCAL_DATABASE_URL ??
      'postgresql://united_services:united_services_local_standby@localhost:5432/united_services';
    await execFileAsync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DIRECT_URL: localUrl },
    });
  }

  async syncAll(): Promise<{ model: string; upserted: number; deleted: number }[]> {
    await this.ensureLocalSchema();

    // Phase 1 — upsert every model in MIRRORED_MODELS's own (parent-
    // before-child) order, so a row's foreign keys always already exist
    // locally by the time it's written.
    const upsertResults = new Map<string, { upserted: number; primaryIds: Set<string> }>();
    for (const model of MIRRORED_MODELS) {
      upsertResults.set(model, await this.upsertModel(model));
    }

    // Phase 2 — delete-reconcile in the *reverse* order: a child row has
    // to be gone locally before its parent can be safely deleted, same
    // FK reasoning as phase 1 but pointed the other way.
    const deletedByModel = new Map<string, number>();
    for (const model of [...MIRRORED_MODELS].reverse()) {
      const { primaryIds } = upsertResults.get(model)!;
      deletedByModel.set(
        model,
        await this.deleteStaleLocalRows(
          this.getLocalWriter() as unknown as Record<string, any>,
          model,
          primaryIds,
        ),
      );
    }

    const results = MIRRORED_MODELS.map((model) => ({
      model,
      upserted: upsertResults.get(model)!.upserted,
      deleted: deletedByModel.get(model)!,
    }));
    const totalUpserted = results.reduce((sum, r) => sum + r.upserted, 0);
    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
    if (totalUpserted > 0 || totalDeleted > 0) {
      this.logger.log(
        `Mirror sync complete: ${totalUpserted} row(s) upserted, ${totalDeleted} row(s) deleted across ${MIRRORED_MODELS.length} tables`,
      );
    }
    return results;
  }

  private async upsertModel(
    model: (typeof MIRRORED_MODELS)[number],
  ): Promise<{ upserted: number; primaryIds: Set<string> }> {
    const reader = this.primaryReader as unknown as Record<string, any>;
    const writer = this.getLocalWriter() as unknown as Record<string, any>;
    const pk = primaryKeyField(model);

    const primaryIds = new Set<string>();
    let upserted = 0;
    let cursor: string | null = null;
    for (;;) {
      const batch: Record<string, any>[] = await reader[model].findMany({
        where: cursor ? { [pk]: { gt: cursor } } : undefined,
        orderBy: { [pk]: 'asc' },
        take: SYNC_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      await writer.$transaction(
        batch.map((row) =>
          writer[model].upsert({
            where: { [pk]: row[pk] },
            create: row,
            update: row,
          }),
        ),
      );
      for (const row of batch) primaryIds.add(row[pk]);
      upserted += batch.length;
      cursor = batch[batch.length - 1][pk];

      if (batch.length < SYNC_BATCH_SIZE) break;
      await sleep(SYNC_BATCH_DELAY_MS);
    }

    return { upserted, primaryIds };
  }

  // Removes local rows that no longer exist on primary — without this,
  // the mirror would only ever grow, never reflect a real delete.
  private async deleteStaleLocalRows(
    writer: Record<string, any>,
    model: (typeof MIRRORED_MODELS)[number],
    primaryIds: Set<string>,
  ): Promise<number> {
    const pk = primaryKeyField(model);
    let deleted = 0;
    let cursor: string | null = null;
    for (;;) {
      const batch: Record<string, any>[] = await writer[model].findMany({
        where: cursor ? { [pk]: { gt: cursor } } : undefined,
        orderBy: { [pk]: 'asc' },
        take: SYNC_BATCH_SIZE,
        select: { [pk]: true },
      });
      if (batch.length === 0) break;

      const staleIds = batch
        .map((row) => row[pk])
        .filter((id) => !primaryIds.has(id));
      if (staleIds.length > 0) {
        await writer[model].deleteMany({ where: { [pk]: { in: staleIds } } });
        deleted += staleIds.length;
      }
      cursor = batch[batch.length - 1][pk];

      if (batch.length < SYNC_BATCH_SIZE) break;
      await sleep(SYNC_BATCH_DELAY_MS);
    }
    return deleted;
  }
}
