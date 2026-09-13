import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { FailoverService } from '../failover/failover.service';
import { createFailoverRedisConnection } from '../failover/failover-redis-connection';
import {
  ANALYTICS_WRITE_DLQ,
  ANALYTICS_WRITE_QUEUE_NAME,
  type AnalyticsWriteJobData,
} from '../queue/queue.tokens';
import type { Prisma } from '../generated/prisma';

// Consumes the `analytics-write` queue AnalyticsController.track()
// enqueues onto instead of writing to Postgres inline on every request.
//
// Why this endpoint specifically: it's public, unauthenticated, and
// fires on every page view/CTA click — by far the highest-volume write
// in the app, and the one whose data least needs to be durable the
// instant the HTTP response goes out (an admin dashboard chart reading
// it a few seconds late is a non-issue; a lost service request or RFQ
// would not be). That combination — high volume, low per-write
// criticality — is exactly what makes it safe to buffer in Redis rather
// than hold open a Supabase pooler connection per request.
//
// `concurrency` and `limiter` together are the actual protection for
// the shared pooler: no matter how bursty incoming traffic gets (a
// traffic spike, a bot crawl, a retry storm), at most `concurrency`
// analyticsEvent.create() calls are ever in flight at once, and the
// queue never asks Postgres for more than `limiter.max` writes per
// `limiter.duration` — everything past that just waits in Redis, which
// costs nothing towards Supabase's connection/pooler limits.
@Injectable()
export class AnalyticsWriteWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsWriteWorker.name);
  private worker: Worker<AnalyticsWriteJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly failover: FailoverService,
    @Inject(ANALYTICS_WRITE_DLQ)
    private readonly dlq: Queue<AnalyticsWriteJobData>,
  ) {}

  onModuleInit() {
    const connection = createFailoverRedisConnection(this.failover, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<AnalyticsWriteJobData>(
      ANALYTICS_WRITE_QUEUE_NAME,
      async (job: Job<AnalyticsWriteJobData>) => {
        await this.prisma.analyticsEvent.create({
          data: {
            eventType: job.data.eventType,
            metadata: job.data.metadata as Prisma.InputJsonValue,
            country: job.data.country,
          },
        });
      },
      {
        connection,
        concurrency: 5,
        // Hard ceiling independent of concurrency/VU count on the caller
        // side — see class comment. 20/s is comfortably above this app's
        // real traffic (the /analytics/track route itself is already
        // throttled to 30 req/min *per IP*) while still bounding worst
        // case Supabase load to a small, predictable number.
        limiter: { max: 20, duration: 1000 },
      },
    );

    // Same DLQ-on-exhaustion pattern as TranslationWorker — a permanently
    // failed analytics write is not worth paging anyone over, but it
    // shouldn't just silently vanish into BullMQ's internal failed set
    // either.
    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!exhausted) return;

      this.logger.error(
        `Analytics write job permanently failed after ${job.attemptsMade} attempts, moving to DLQ: ${job.name} — ${error.message}`,
      );
      this.dlq
        .add(job.name, job.data, { removeOnComplete: { age: 604_800 } })
        .catch((dlqError: Error) => {
          this.logger.error(
            `Failed to write to analytics-write DLQ for ${job.name}: ${dlqError.message}`,
          );
        });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
