import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { FailoverReconciliationService } from './failover-reconciliation.service';
import { FailoverService } from './failover.service';
import { createFailoverRedisConnection } from './failover-redis-connection';
import {
  FAILOVER_RECONCILE_DLQ,
  FAILOVER_RECONCILE_QUEUE,
  FAILOVER_RECONCILE_QUEUE_NAME,
  type FailoverReconcileJobData,
} from '../queue/queue.tokens';

// Enqueues a reconciliation job the moment FailoverService reports
// Postgres has recovered — not on a schedule, since there's nothing to
// reconcile until an actual failover happened. Same BullMQ
// attempts/backoff/DLQ shape as every other worker in this codebase, so
// a reconciliation run that fails (e.g. primary drops again mid-replay)
// retries automatically instead of silently leaving FailoverWriteLog
// entries unreconciled forever.
@Injectable()
export class FailoverReconciliationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FailoverReconciliationWorker.name);
  private worker: Worker<FailoverReconcileJobData> | null = null;
  private readonly onRecovered = () => {
    this.queue
      .add(
        'reconcile',
        {},
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86_400 },
        },
      )
      .catch((err: Error) => {
        this.logger.error(
          `Failed to enqueue reconciliation job after Postgres recovery: ${err.message}`,
        );
      });
  };

  constructor(
    private readonly reconciliationService: FailoverReconciliationService,
    private readonly failover: FailoverService,
    @Inject(FAILOVER_RECONCILE_QUEUE)
    private readonly queue: Queue<FailoverReconcileJobData>,
    @Inject(FAILOVER_RECONCILE_DLQ)
    private readonly dlq: Queue<FailoverReconcileJobData>,
  ) {}

  onModuleInit() {
    this.failover.on('postgres:recovered', this.onRecovered);

    const connection = createFailoverRedisConnection(this.failover, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<FailoverReconcileJobData>(
      FAILOVER_RECONCILE_QUEUE_NAME,
      async () => {
        await this.reconciliationService.reconcileAll();
      },
      {
        connection,
        // One reconciliation run at a time — replaying entries out of
        // order across two concurrent runs would defeat the point of
        // ordering by writtenAt in the first place.
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job: Job<FailoverReconcileJobData> | undefined, error: Error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!exhausted) return;

      this.logger.error(
        `Reconciliation job permanently failed after ${job.attemptsMade} attempts, moving to DLQ: ${error.message}`,
      );
      this.dlq
        .add(job.name, job.data, { removeOnComplete: { age: 604_800 } })
        .catch((dlqError: Error) => {
          this.logger.error(
            `Failed to write to reconciliation DLQ: ${dlqError.message}`,
          );
        });
    });
  }

  async onModuleDestroy() {
    this.failover.off('postgres:recovered', this.onRecovered);
    await this.worker?.close();
  }
}
