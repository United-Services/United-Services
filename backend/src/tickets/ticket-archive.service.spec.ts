import {
  TicketArchiveService,
  SWEEP_BATCH_SIZE,
} from './ticket-archive.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';

function ticket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ticket-1',
    name: 'Jane',
    email: 'jane@example.com',
    company: 'Acme',
    type: 'technical',
    details: 'It broke',
    status: 'resolved',
    screenshotS3Key: 'tickets/ticket-1/shot.jpg',
    createdAt: new Date('2026-01-01'),
    contactedAt: new Date('2026-01-02'),
    resolvedAt: new Date('2026-01-03'),
    ...overrides,
  };
}

describe('TicketArchiveService', () => {
  function makeService() {
    const prisma = {
      ticket: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      ticketArchive: {
        upsert: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PrismaService;
    const s3 = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as S3Service;
    return { service: new TicketArchiveService(prisma, s3), prisma, s3 };
  }

  afterEach(() => jest.clearAllMocks());

  describe('archiveTicket', () => {
    it('returns false and does nothing when the ticket no longer exists (already archived)', async () => {
      const { service, prisma, s3 } = makeService();
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.archiveTicket('gone');

      expect(result).toBe(false);
      expect(prisma.ticketArchive.upsert).not.toHaveBeenCalled();
      expect(s3.deleteObject).not.toHaveBeenCalled();
    });

    // Defensive — the only real caller (TicketsController) already
    // enforces resolved-is-terminal before this ever runs, but this
    // service must never archive a non-resolved ticket on its own.
    it('returns false and does nothing for a ticket that is not resolved', async () => {
      const { service, prisma, s3 } = makeService();
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(
        ticket({ status: 'unresolved' }),
      );

      const result = await service.archiveTicket('ticket-1');

      expect(result).toBe(false);
      expect(prisma.ticketArchive.upsert).not.toHaveBeenCalled();
      expect(prisma.ticket.delete).not.toHaveBeenCalled();
      expect(s3.deleteObject).not.toHaveBeenCalled();
    });

    it('creates the archive row, deletes the S3 screenshot, marks screenshotDeletedAt, then deletes the live row — in that order', async () => {
      const { service, prisma, s3 } = makeService();
      const t = ticket();
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(t);
      const callOrder: string[] = [];
      (prisma.ticketArchive.upsert as jest.Mock).mockImplementation(() => {
        callOrder.push('archive-upsert');
      });
      (s3.deleteObject as jest.Mock).mockImplementation(() => {
        callOrder.push('s3-delete');
      });
      (prisma.ticketArchive.update as jest.Mock).mockImplementation(() => {
        callOrder.push('screenshot-deleted-at');
      });
      (prisma.ticket.delete as jest.Mock).mockImplementation(() => {
        callOrder.push('ticket-delete');
      });

      const result = await service.archiveTicket('ticket-1');

      expect(result).toBe(true);
      expect(prisma.ticketArchive.upsert).toHaveBeenCalledWith({
        where: { originalTicketId: 'ticket-1' },
        create: expect.objectContaining({
          originalTicketId: 'ticket-1',
          name: t.name,
          email: t.email,
          screenshotS3Key: t.screenshotS3Key,
          resolvedAt: t.resolvedAt,
        }),
        update: {},
      });
      expect(s3.deleteObject).toHaveBeenCalledWith(t.screenshotS3Key);
      expect(prisma.ticketArchive.update).toHaveBeenCalledWith({
        where: { originalTicketId: 'ticket-1' },
        data: { screenshotDeletedAt: expect.any(Date) },
      });
      expect(prisma.ticket.delete).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
      });
      expect(callOrder).toEqual([
        'archive-upsert',
        's3-delete',
        'screenshot-deleted-at',
        'ticket-delete',
      ]);
    });

    it('skips S3 deletion and the screenshotDeletedAt update for a ticket with no screenshot', async () => {
      const { service, prisma, s3 } = makeService();
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(
        ticket({ screenshotS3Key: null }),
      );

      const result = await service.archiveTicket('ticket-1');

      expect(result).toBe(true);
      expect(s3.deleteObject).not.toHaveBeenCalled();
      expect(prisma.ticketArchive.update).not.toHaveBeenCalled();
      expect(prisma.ticket.delete).toHaveBeenCalled();
    });

    // The core safety property: if S3 deletion fails, the live Ticket
    // row must NOT be deleted (that would orphan the S3 object forever,
    // with nothing left pointing at it to retry) — the error must
    // propagate so BullMQ retries the whole job.
    it('propagates an S3 deletion failure and never deletes the Ticket row when it fails', async () => {
      const { service, prisma, s3 } = makeService();
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValue(ticket());
      (s3.deleteObject as jest.Mock).mockRejectedValue(
        new Error('S3 network blip'),
      );

      await expect(service.archiveTicket('ticket-1')).rejects.toThrow(
        'S3 network blip',
      );
      expect(prisma.ticket.delete).not.toHaveBeenCalled();
    });

    // Idempotency: a retry after a crash between the archive upsert and
    // the S3 delete must not create a duplicate archive row or fail —
    // upsert's `update: {}` branch handles the "already created" case
    // as a no-op, and the retry just re-attempts the S3 delete + row
    // delete that didn't complete last time.
    it('is safe to call twice in a row for the same ticket (idempotent retry)', async () => {
      const { service, prisma } = makeService();
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValueOnce(ticket());
      await service.archiveTicket('ticket-1');

      // Second call: the live row is now gone (already deleted last
      // time), simulating a retry that arrives after the first run
      // actually completed.
      (prisma.ticket.findUnique as jest.Mock).mockResolvedValueOnce(null);
      const secondResult = await service.archiveTicket('ticket-1');

      expect(secondResult).toBe(false);
      expect(prisma.ticketArchive.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('archiveAllResolved', () => {
    it('does nothing when there are no resolved tickets in the live table', async () => {
      const { service, prisma } = makeService();
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);

      const count = await service.archiveAllResolved();

      expect(count).toBe(0);
      expect(prisma.ticket.delete).not.toHaveBeenCalled();
    });

    it('archives every resolved ticket found in a single under-batch-size page', async () => {
      const { service, prisma } = makeService();
      (prisma.ticket.findMany as jest.Mock)
        .mockResolvedValueOnce([
          ticket({ id: 't-a' }),
          ticket({ id: 't-b' }),
        ])
        .mockImplementation(() => Promise.resolve([]));
      (prisma.ticket.findUnique as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(ticket({ id: where.id })),
      );

      const count = await service.archiveAllResolved();

      expect(count).toBe(2);
      expect(prisma.ticket.delete).toHaveBeenCalledTimes(2);
    });

    it('queries only for resolved tickets', async () => {
      const { service, prisma } = makeService();
      (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);

      await service.archiveAllResolved();

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'resolved' } }),
      );
    });

    it('loops across multiple full batches until a short final page ends it', async () => {
      const { service, prisma } = makeService();
      const fullBatch = Array.from({ length: SWEEP_BATCH_SIZE }, (_, i) =>
        ticket({ id: `t-${i}` }),
      );
      (prisma.ticket.findMany as jest.Mock)
        .mockResolvedValueOnce(fullBatch)
        .mockResolvedValueOnce([ticket({ id: 't-last' })])
        .mockResolvedValue([]);
      (prisma.ticket.findUnique as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(ticket({ id: where.id })),
      );

      const count = await service.archiveAllResolved();

      expect(prisma.ticket.findMany).toHaveBeenCalledTimes(2);
      expect(count).toBe(SWEEP_BATCH_SIZE + 1);
    });
  });
});
