import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { AuditLogArchiveService } from './audit-log-archive.service';
import { FailoverService } from '../failover/failover.service';
import { createFailoverRedisConnection } from '../failover/failover-redis-connection';
import {
  AUDIT_ARCHIVE_DLQ,
  AUDIT_ARCHIVE_QUEUE,
  AUDIT_ARCHIVE_QUEUE_NAME,
  type AuditArchiveJobData,
} from '../queue/queue.tokens';

// Stable scheduler id — passing the same id to queue.upsertJobScheduler on
// every app start is what makes registration idempotent: BullMQ upserts
// the existing job scheduler's cron pattern instead of stacking up a
// duplicate repeatable job on every deploy/restart.
const JOB_SCHEDULER_ID = 'audit-log-archive-daily';
const REPEATABLE_JOB_NAME = 'archive-audit-logs';
// 03:00 every day — off-hours for this app's traffic pattern, same slot
// geoipupdate already runs in via docker-entrypoint.sh.
const CRON_PATTERN = '0 3 * * *';

// Runs AuditLogArchiveService.archiveExpiredLogs() on a schedule via
// BullMQ's own job-scheduler support (no separate cron dependency needed
// — see docs/BUSINESS_RULES.md rule 18). Failed runs retry with backoff
// (see registerRepeatableJob's attempts/backoff) and, once exhausted,
// move to AUDIT_ARCHIVE_DLQ — identical shape to TranslationWorker's DLQ
// handling, so an operator already familiar with that pattern recognizes
// this one immediately.
@Injectable()
export class AuditLogArchiveWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLogArchiveWorker.name);
  private worker: Worker<AuditArchiveJobData> | null = null;

  constructor(
    private readonly archiveService: AuditLogArchiveService,
    private readonly failover: FailoverService,
    @Inject(AUDIT_ARCHIVE_QUEUE)
    private readonly queue: Queue<AuditArchiveJobData>,
    @Inject(AUDIT_ARCHIVE_DLQ)
    private readonly dlq: Queue<AuditArchiveJobData>,
  ) {}

  async onModuleInit() {
    await this.registerRepeatableJob();

    const connection = createFailoverRedisConnection(this.failover, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<AuditArchiveJobData>(
      AUDIT_ARCHIVE_QUEUE_NAME,
      async () => {
        await this.archiveService.archiveExpiredLogs();
      },
      {
        connection,
        // One archive run at a time — archiveExpiredLogs() already
        // serializes its own batches, and there is only ever one
        // repeatable job in flight anyway; concurrency > 1 here would
        // just mean two runs racing over the same rows for no benefit.
        concurrency: 1,
      },
    );

    // Same dead-letter transfer as TranslationWorker: once every
    // configured retry is exhausted, the failure is surfaced by moving
    // the job onto AUDIT_ARCHIVE_DLQ instead of silently vanishing into
    // BullMQ's internal (temporary) failed set.
    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!exhausted) return;

      this.logger.error(
        `Audit log archive job permanently failed after ${job.attemptsMade} attempts, moving to DLQ: ${error.message}`,
      );
      this.dlq
        .add(job.name, job.data, { removeOnComplete: { age: 604_800 } })
        .catch((dlqError: Error) => {
          this.logger.error(
            `Failed to write to audit log archive DLQ: ${dlqError.message}`,
          );
        });
    });
  }

  // Deliberately caught, not awaited-and-thrown — see
  // DbMirrorSyncWorker.registerRepeatableJob's comment: this runs during
  // Nest's module init phase, which onModuleInit blocks on, so an
  // unhandled rejection here (Redis unreachable) would stall
  // NestFactory.create() forever and take the entire HTTP server down
  // with it, even though no route depends on this queue.
  private async registerRepeatableJob() {
    try {
      await this.queue.upsertJobScheduler(
        JOB_SCHEDULER_ID,
        { pattern: CRON_PATTERN },
        {
          name: REPEATABLE_JOB_NAME,
          data: {},
          opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 86_400 },
          },
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to register the audit-log archive repeatable job scheduler — continuing boot without it: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
