import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Rows this old (or older) are eligible for archival — see
// docs/BUSINESS_RULES.md rule 18.
export const AUDIT_LOG_RETENTION_DAYS = 90;

// Rows moved per transaction. Kept modest (not "delete everything in one
// go") specifically so a large backlog can't lock up AuditLog or hammer
// the DB in one shot — the "don't DDoS the system by our hands" part of
// this feature. AuditLogArchiveWorker also pauses BATCH_DELAY_MS between
// batches for the same reason.
export const ARCHIVE_BATCH_SIZE = 500;
export const BATCH_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Does the actual archive work: move AuditLog rows older than the
// retention window into AuditLogArchive, batch by batch, then delete the
// originals. Called from AuditLogArchiveWorker's BullMQ processor — never
// from a request handler, so this never runs on the request path.
@Injectable()
export class AuditLogArchiveService {
  private readonly logger = new Logger(AuditLogArchiveService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Cutoff computed fresh on every call (not passed in) — see
  // queue.tokens.ts's note on AuditArchiveJobData. Returns the total
  // number of rows archived, across every batch.
  async archiveExpiredLogs(): Promise<number> {
    const cutoff = new Date(
      Date.now() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    let totalArchived = 0;
    for (;;) {
      const archived = await this.archiveOneBatch(cutoff);
      totalArchived += archived;
      if (archived < ARCHIVE_BATCH_SIZE) break;
      await sleep(BATCH_DELAY_MS);
    }

    if (totalArchived > 0) {
      this.logger.log(
        `Archived ${totalArchived} audit log row(s) older than ${cutoff.toISOString()}`,
      );
    }
    return totalArchived;
  }

  // One batch, one transaction. skipDuplicates on the createMany is what
  // makes a retry after a crash between createMany and deleteMany safe —
  // a re-run picks the same still-present AuditLog rows, the createMany
  // silently skips the ones already archived (unique on originalId), and
  // the deleteMany proceeds to actually remove them this time.
  private async archiveOneBatch(cutoff: Date): Promise<number> {
    const batch = await this.prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: ARCHIVE_BATCH_SIZE,
    });
    if (batch.length === 0) return 0;

    await this.prisma.$transaction([
      this.prisma.auditLogArchive.createMany({
        data: batch.map((row) => ({
          originalId: row.id,
          actorUserId: row.actorUserId,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          metadata: row.metadata ?? undefined,
          createdAt: row.createdAt,
        })),
        skipDuplicates: true,
      }),
      this.prisma.auditLog.deleteMany({
        where: { id: { in: batch.map((row) => row.id) } },
      }),
    ]);

    return batch.length;
  }
}
