import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MetricsService } from './metrics.service';
import {
  ANALYTICS_WRITE_QUEUE,
  AUDIT_ARCHIVE_QUEUE,
  DB_MIRROR_SYNC_QUEUE,
  FAILOVER_RECONCILE_QUEUE,
  KEK_ROTATION_QUEUE,
  TICKET_ARCHIVE_QUEUE,
  TRANSLATION_QUEUE,
} from '../queue/queue.tokens';

const POLL_INTERVAL_MS = 10_000;

// Polls every standing BullMQ queue's job counts on a fixed interval and
// republishes them as the bullmq_queue_depth gauge — a queue's own depth
// isn't something a Queue instance pushes anywhere on its own, so
// something has to periodically ask.
//
// Why this matters for the traffic/threshold question this whole module
// exists to answer: a growing `waiting` count on analytics-write
// specifically means AnalyticsWriteWorker's own rate limiter (20
// jobs/sec, see that worker's class comment) is the bottleneck, not
// Supabase or host hardware — exactly the distinction the Grafana
// dashboard's "what's actually under load" panel needs to draw. A hardware
// alert firing at the same time as a queue backlog growing is a much
// stronger, more specific signal than either alone.
@Injectable()
export class QueueMetricsPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsPoller.name);
  private timer: NodeJS.Timeout | null = null;

  private readonly queues: Array<[string, Queue]>;

  constructor(
    private readonly metrics: MetricsService,
    @Inject(ANALYTICS_WRITE_QUEUE) analyticsWrite: Queue,
    @Inject(TRANSLATION_QUEUE) translation: Queue,
    @Inject(AUDIT_ARCHIVE_QUEUE) auditArchive: Queue,
    @Inject(DB_MIRROR_SYNC_QUEUE) dbMirrorSync: Queue,
    @Inject(FAILOVER_RECONCILE_QUEUE) failoverReconcile: Queue,
    @Inject(KEK_ROTATION_QUEUE) kekRotation: Queue,
    @Inject(TICKET_ARCHIVE_QUEUE) ticketArchive: Queue,
  ) {
    this.queues = [
      ['analytics-write', analyticsWrite],
      ['translations', translation],
      ['audit-log-archive', auditArchive],
      ['db-mirror-sync', dbMirrorSync],
      ['failover-reconcile', failoverReconcile],
      ['kek-rotation', kekRotation],
      ['ticket-archive', ticketArchive],
    ];
  }

  onModuleInit() {
    // Fire once immediately (so /metrics has real numbers right after
    // boot, not zeros for the first 10s) then on the interval.
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    // unref: this poller must never be the reason the process stays
    // alive during a graceful shutdown that's otherwise complete.
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    await Promise.all(
      this.queues.map(async ([name, queue]) => {
        try {
          const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'delayed',
            'failed',
          );
          for (const [state, count] of Object.entries(counts)) {
            this.metrics.queueDepth.set({ queue: name, state }, count);
          }
        } catch (err) {
          // A Redis blip here must not crash the poller's own interval
          // loop (an uncaught rejection inside a setInterval callback is
          // silently swallowed by Node anyway, but this makes the
          // failure visible in Betterstack instead of the gauge just
          // going stale with no explanation).
          this.logger.warn(
            `Failed to poll job counts for queue "${name}": ${err}`,
          );
        }
      }),
    );
  }
}
