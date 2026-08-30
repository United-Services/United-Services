import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { DbMirrorSyncService } from './db-mirror-sync.service';
import { FailoverService } from './failover.service';
import { createFailoverRedisConnection } from './failover-redis-connection';
import {
  DB_MIRROR_SYNC_DLQ,
  DB_MIRROR_SYNC_QUEUE,
  DB_MIRROR_SYNC_QUEUE_NAME,
  type DbMirrorSyncJobData,
} from '../queue/queue.tokens';

const JOB_SCHEDULER_ID = 'db-mirror-sync-10min';
const REPEATABLE_JOB_NAME = 'sync-local-standby';
// Every 10 minutes — frequent enough that the local standby is never far
// behind primary, infrequent enough (combined with the batching/pacing
// inside DbMirrorSyncService) to stay a light load on Supabase.
const CRON_PATTERN = '*/10 * * * *';

// Runs DbMirrorSyncService.syncAll() on a schedule, same job-scheduler +
// DLQ pattern as AuditLogArchiveWorker. Only actually syncs while
// Postgres is in `primary` mode — syncing FROM local while the app is
// already running off local (mid-outage) would overwrite the very
// fallback writes FailoverReconciliationWorker needs to replay later.
@Injectable()
export class DbMirrorSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbMirrorSyncWorker.name);
  private worker: Worker<DbMirrorSyncJobData> | null = null;

  constructor(
    private readonly syncService: DbMirrorSyncService,
    private readonly failover: FailoverService,
    @Inject(DB_MIRROR_SYNC_QUEUE)
    private readonly queue: Queue<DbMirrorSyncJobData>,
    @Inject(DB_MIRROR_SYNC_DLQ)
    private readonly dlq: Queue<DbMirrorSyncJobData>,
  ) {}

  async onModuleInit() {
    await this.registerRepeatableJob();

    const connection = createFailoverRedisConnection(this.failover, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<DbMirrorSyncJobData>(
      DB_MIRROR_SYNC_QUEUE_NAME,
      async () => {
        if (this.failover.getPostgresMode() !== 'primary') {
          this.logger.warn(
            'Skipping mirror sync — Postgres is currently in local-fallback mode',
          );
          return;
        }
        await this.syncService.syncAll();
      },
      {
        connection,
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!exhausted) return;

      this.logger.error(
        `DB mirror sync job permanently failed after ${job.attemptsMade} attempts, moving to DLQ: ${error.message}`,
      );
      this.dlq
        .add(job.name, job.data, { removeOnComplete: { age: 604_800 } })
        .catch((dlqError: Error) => {
          this.logger.error(
            `Failed to write to DB mirror sync DLQ: ${dlqError.message}`,
          );
        });
    });
  }

  private async registerRepeatableJob() {
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
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
