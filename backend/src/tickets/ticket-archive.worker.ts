import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { TicketArchiveService } from './ticket-archive.service';
import { FailoverService } from '../failover/failover.service';
import { createFailoverRedisConnection } from '../failover/failover-redis-connection';
import {
  TICKET_ARCHIVE_DLQ,
  TICKET_ARCHIVE_QUEUE,
  TICKET_ARCHIVE_QUEUE_NAME,
  type TicketArchiveJobData,
} from '../queue/queue.tokens';

const JOB_SCHEDULER_ID = 'ticket-archive-sweep-10min';
const SWEEP_JOB_NAME = 'sweep-resolved-tickets';
// Same interval as DbMirrorSyncWorker — this is a safety net (see
// TicketArchiveService.archiveAllResolved's comment), not the primary
// mechanism, so it doesn't need to run any more often than that.
const CRON_PATTERN = '*/10 * * * *';

// Processes two kinds of job on one queue: an immediate per-ticket job
// (`{ ticketId }`, enqueued by TicketsController.updateStatus the moment
// a ticket is resolved) and the periodic sweep job (no ticketId) —
// distinguished by whether job.data.ticketId is present. Same
// job-scheduler + DLQ pattern as every other worker in this codebase.
@Injectable()
export class TicketArchiveWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketArchiveWorker.name);
  private worker: Worker<TicketArchiveJobData> | null = null;

  constructor(
    private readonly archiveService: TicketArchiveService,
    private readonly failover: FailoverService,
    @Inject(TICKET_ARCHIVE_QUEUE)
    private readonly queue: Queue<TicketArchiveJobData>,
    @Inject(TICKET_ARCHIVE_DLQ)
    private readonly dlq: Queue<TicketArchiveJobData>,
  ) {}

  async onModuleInit() {
    await this.registerSweepJob();

    const connection = createFailoverRedisConnection(this.failover, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<TicketArchiveJobData>(
      TICKET_ARCHIVE_QUEUE_NAME,
      async (job: Job<TicketArchiveJobData>) => {
        if (job.data.ticketId) {
          await this.archiveService.archiveTicket(job.data.ticketId);
        } else {
          await this.archiveService.archiveAllResolved();
        }
      },
      {
        connection,
        // A handful of per-ticket jobs archiving concurrently is fine —
        // each is scoped to its own ticket id, no shared state to race
        // (unlike AuditLogArchiveWorker/DbMirrorSyncWorker's single
        // global sweep, which stays at 1).
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!exhausted) return;

      this.logger.error(
        `Ticket archive job permanently failed after ${job.attemptsMade} attempts, moving to DLQ: ${job.data.ticketId ?? '(sweep)'} — ${error.message}`,
      );
      this.dlq
        .add(job.name, job.data, { removeOnComplete: { age: 604_800 } })
        .catch((dlqError: Error) => {
          this.logger.error(
            `Failed to write to ticket archive DLQ: ${dlqError.message}`,
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
  private async registerSweepJob() {
    try {
      await this.queue.upsertJobScheduler(
        JOB_SCHEDULER_ID,
        { pattern: CRON_PATTERN },
        {
          name: SWEEP_JOB_NAME,
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
        `Failed to register the ticket-archive sweep job scheduler — continuing boot without it: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
