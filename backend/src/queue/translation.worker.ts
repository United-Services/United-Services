import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { TranslationService } from '../translations/translation.service';
import { FailoverService } from '../failover/failover.service';
import { createFailoverRedisConnection } from '../failover/failover-redis-connection';
import {
  TRANSLATION_DLQ,
  TRANSLATION_QUEUE_NAME,
  type TranslationJobData,
} from './queue.tokens';

// Consumes the `translations` queue TranslationService.triggerAsync/
// triggerServiceAsync enqueue jobs onto. A dedicated Worker connection —
// same reasoning as queue.module.ts's Queue connections — rather than
// sharing RedisService. createFailoverRedisConnection makes this
// transparently follow FailoverService's Redis mode.
@Injectable()
export class TranslationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranslationWorker.name);
  private worker: Worker<TranslationJobData> | null = null;

  constructor(
    private readonly translations: TranslationService,
    private readonly failover: FailoverService,
    @Inject(TRANSLATION_DLQ) private readonly dlq: Queue<TranslationJobData>,
  ) {}

  onModuleInit() {
    const connection = createFailoverRedisConnection(this.failover, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<TranslationJobData>(
      TRANSLATION_QUEUE_NAME,
      async (job: Job<TranslationJobData>) => {
        await this.translations.processQueuedJob(job.data);
      },
      {
        connection,
        // Modest concurrency — this is bounded by the same
        // withinBudget()/self-hosted-LibreTranslate throughput guard
        // TranslationService already enforces per-call; running many of
        // these in parallel wouldn't finish translations any faster once
        // that guard kicks in, just contend for it sooner.
        concurrency: 3,
      },
    );

    // Fires only after a job has exhausted every configured retry
    // (attempts: 3, see TranslationService.enqueue) — this is the actual
    // dead-letter transfer: a permanently-failed translation job's data
    // moves into TRANSLATION_DLQ so it's visible and re-runnable later,
    // instead of just disappearing into BullMQ's internal failed set
    // (which is temporary — see removeOnFail) with nothing surfacing the
    // failure anywhere an operator would think to look.
    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!exhausted) return;

      this.logger.error(
        `Translation job permanently failed after ${job.attemptsMade} attempts, moving to DLQ: ${job.name} — ${error.message}`,
      );
      this.dlq
        .add(job.name, job.data, { removeOnComplete: { age: 604_800 } })
        .catch((dlqError: Error) => {
          this.logger.error(
            `Failed to write to translation DLQ for ${job.name}: ${dlqError.message}`,
          );
        });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
