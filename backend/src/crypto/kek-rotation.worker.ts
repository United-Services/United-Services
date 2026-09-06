import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { KekRotationService } from './kek-rotation.service';
import { FailoverService } from '../failover/failover.service';
import { createFailoverRedisConnection } from '../failover/failover-redis-connection';
import {
  KEK_ROTATION_DLQ,
  KEK_ROTATION_QUEUE,
  KEK_ROTATION_QUEUE_NAME,
  type KekRotationJobData,
} from '../queue/queue.tokens';

// Stable id → upsertJobScheduler is idempotent across restarts (see
// AuditLogArchiveWorker, whose shape this mirrors exactly).
const JOB_SCHEDULER_ID = 'kek-rotation-daily';
const REPEATABLE_JOB_NAME = 'rotate-kek';
// 03:30 daily — the same off-hours slot as the audit-log archive
// (03:00), offset so the two never run over the top of each other.
const CRON_PATTERN = '30 3 * * *';

// Runs KekRotationService.rotateIfDue() once a day. `concurrency: 1`
// plus a single scheduler id means exactly one replica executes the job
// — the rotation itself is then safe by construction, and the other
// replicas pick up a new key via KekKeyStore's lazy reload.
@Injectable()
export class KekRotationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KekRotationWorker.name);
  private worker: Worker<KekRotationJobData> | null = null;

  constructor(
    private readonly rotation: KekRotationService,
    private readonly failover: FailoverService,
    @Inject(KEK_ROTATION_QUEUE)
    private readonly queue: Queue<KekRotationJobData>,
    @Inject(KEK_ROTATION_DLQ)
    private readonly dlq: Queue<KekRotationJobData>,
  ) {}

  async onModuleInit() {
    await this.registerRepeatableJob();

    const connection = createFailoverRedisConnection(this.failover, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<KekRotationJobData>(
      KEK_ROTATION_QUEUE_NAME,
      async () => {
        await this.rotation.rotateIfDue();
      },
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!exhausted) return;
      this.logger.error(
        `KEK rotation job permanently failed after ${job.attemptsMade} attempts, moving to DLQ: ${error.message}`,
      );
      this.dlq
        .add(job.name, job.data, { removeOnComplete: { age: 604_800 } })
        .catch((dlqError: Error) => {
          this.logger.error(
            `Failed to write to KEK rotation DLQ: ${dlqError.message}`,
          );
        });
    });
  }

  // Caught, never thrown — this runs inside Nest's module init, and an
  // unreachable Redis here must not stop the HTTP server from starting
  // (see AuditLogArchiveWorker.registerRepeatableJob).
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
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 86_400 },
          },
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to register the KEK rotation repeatable job scheduler — continuing boot without it: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
