import {
  AuditLogArchiveService,
  ARCHIVE_BATCH_SIZE,
  AUDIT_LOG_RETENTION_DAYS,
} from './audit-log-archive.service';
import type { PrismaService } from '../prisma/prisma.service';

function row(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    actorUserId: 'actor-1',
    action: 'user.disabled',
    targetType: 'User',
    targetId: 'target-1',
    metadata: { note: 'test' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuditLogArchiveService', () => {
  function makeService() {
    const prisma = {
      auditLog: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      auditLogArchive: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    return { service: new AuditLogArchiveService(prisma), prisma };
  }

  afterEach(() => jest.clearAllMocks());

  it('does nothing and returns 0 when there are no expired rows', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

    const total = await service.archiveExpiredLogs();

    expect(total).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('queries with createdAt < cutoff, ~90 days before now, oldest first', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    const before = Date.now();

    await service.archiveExpiredLogs();

    const call = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
    expect(call.take).toBe(ARCHIVE_BATCH_SIZE);
    const cutoff: Date = call.where.createdAt.lt;
    const expectedMs = AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    // Allow slack for test execution time between `before` and the call.
    expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(expectedMs - 5000);
    expect(before - cutoff.getTime()).toBeLessThanOrEqual(expectedMs + 5000);
  });

  it('moves one under-batch-size page in a single transaction: createMany then deleteMany', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValueOnce([
      row('log-1'),
      row('log-2'),
    ]);

    const total = await service.archiveExpiredLogs();

    expect(total).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.auditLogArchive.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ originalId: 'log-1', action: 'user.disabled' }),
        expect.objectContaining({ originalId: 'log-2', action: 'user.disabled' }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['log-1', 'log-2'] } },
    });
  });

  it('loops across multiple full batches until a short final page ends it', async () => {
    const { service, prisma } = makeService();
    const fullBatch = Array.from({ length: ARCHIVE_BATCH_SIZE }, (_, i) =>
      row(`log-${i}`),
    );
    const shortBatch = [row('log-last')];
    (prisma.auditLog.findMany as jest.Mock)
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce(shortBatch);

    const total = await service.archiveExpiredLogs();

    expect(total).toBe(ARCHIVE_BATCH_SIZE + 1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('stops after an exact-batch-size final page instead of looping forever (queries once more, finds nothing)', async () => {
    const { service, prisma } = makeService();
    const fullBatch = Array.from({ length: ARCHIVE_BATCH_SIZE }, (_, i) =>
      row(`log-${i}`),
    );
    (prisma.auditLog.findMany as jest.Mock)
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([]);

    const total = await service.archiveExpiredLogs();

    expect(total).toBe(ARCHIVE_BATCH_SIZE);
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(2);
  });

  it('preserves a null actorUserId (system-generated rows) rather than coercing it', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValueOnce([
      row('log-system', { actorUserId: null }),
    ]);

    await service.archiveExpiredLogs();

    expect(prisma.auditLogArchive.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ actorUserId: null })],
      }),
    );
  });

  it('preserves a null metadata value as undefined (matching AuditLogService.record\'s own optional field)', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValueOnce([
      row('log-no-meta', { metadata: null }),
    ]);

    await service.archiveExpiredLogs();

    const data = (prisma.auditLogArchive.createMany as jest.Mock).mock
      .calls[0][0].data;
    expect(data[0].metadata).toBeUndefined();
  });

  it('propagates a transaction failure instead of silently swallowing it (so BullMQ retries the job)', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValueOnce([row('log-1')]);
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Error('connection reset'),
    );

    await expect(service.archiveExpiredLogs()).rejects.toThrow(
      'connection reset',
    );
  });
});
