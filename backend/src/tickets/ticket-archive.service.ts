import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { TicketStatus } from '../generated/prisma';

// Safety-net sweep pacing — see archiveAllResolved(). Deliberately much
// smaller than AuditLogArchiveService's batch (500): tickets are a
// human-triggered event stream (one resolve = one job, immediately), not
// a bulk age-based sweep, so this only ever has real work to do when the
// immediate per-ticket job failed or a retroactive backlog exists.
export const SWEEP_BATCH_SIZE = 100;
export const SWEEP_BATCH_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Archives a resolved ticket and deletes its S3 screenshot — see
// TicketArchiveWorker (the BullMQ processor that calls this) and
// docs/BUSINESS_RULES.md rule 20. Unlike AuditLogArchiveService, this is
// event-driven (one call per ticket the moment it's resolved) rather
// than an age-based sweep, and it deletes the S3 object rather than
// just moving a DB row — the whole point is reclaiming screenshot
// storage, not just keeping the hot table small.
@Injectable()
export class TicketArchiveService {
  private readonly logger = new Logger(TicketArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  // Idempotent and safe to retry at any point — see the class comment.
  // Returns true if this call actually archived the ticket, false if
  // there was nothing to do (already archived, doesn't exist, or not
  // actually resolved — the last case is defensive; the only caller,
  // TicketsController.updateStatus, already enforces resolved is
  // terminal before this ever runs).
  async archiveTicket(ticketId: string): Promise<boolean> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    // Already archived (and thus deleted) by an earlier attempt, or
    // never existed — either way, nothing left to do.
    if (!ticket) return false;
    if (ticket.status !== TicketStatus.resolved) return false;

    // Idempotent via upsert on the unique originalTicketId — a retry
    // after a crash between this and the S3 delete below just no-ops
    // here and proceeds to retry the S3 delete, never creating a
    // duplicate archive row.
    await this.prisma.ticketArchive.upsert({
      where: { originalTicketId: ticket.id },
      create: {
        originalTicketId: ticket.id,
        name: ticket.name,
        email: ticket.email,
        company: ticket.company,
        type: ticket.type,
        details: ticket.details,
        screenshotS3Key: ticket.screenshotS3Key,
        createdAt: ticket.createdAt,
        contactedAt: ticket.contactedAt,
        resolvedAt: ticket.resolvedAt ?? new Date(),
      },
      update: {},
    });

    if (ticket.screenshotS3Key) {
      // Deliberately not caught here — a failure must propagate so
      // BullMQ retries the whole job rather than silently deleting the
      // Ticket row below while the screenshot (and the storage it's
      // costing) lives on forever, orphaned and unreachable from
      // anywhere once the row is gone.
      await this.s3.deleteObject(ticket.screenshotS3Key);
      await this.prisma.ticketArchive.update({
        where: { originalTicketId: ticket.id },
        data: { screenshotDeletedAt: new Date() },
      });
    }

    // Last step, deliberately — everything above is safely re-runnable,
    // so only delete the live row once the archive is fully in place
    // (including the screenshot deletion, if there was one).
    await this.prisma.ticket.delete({ where: { id: ticket.id } });
    return true;
  }

  // Safety net: any ticket that's resolved but still in the live table
  // — the immediate per-resolve job failed after exhausting retries, a
  // retroactive backlog from before this feature existed, or a
  // vanishingly unlikely lost-job case — gets swept up here instead of
  // lingering unarchived forever. Batched/paced the same way as every
  // other bulk operation in this codebase.
  async archiveAllResolved(): Promise<number> {
    let archived = 0;
    for (;;) {
      const batch = await this.prisma.ticket.findMany({
        where: { status: TicketStatus.resolved },
        take: SWEEP_BATCH_SIZE,
      });
      if (batch.length === 0) break;

      for (const ticket of batch) {
        if (await this.archiveTicket(ticket.id)) archived++;
      }

      if (batch.length < SWEEP_BATCH_SIZE) break;
      await sleep(SWEEP_BATCH_DELAY_MS);
    }

    if (archived > 0) {
      this.logger.log(
        `Ticket archive sweep: ${archived} resolved ticket(s) archived`,
      );
    }
    return archived;
  }
}
