import { AuditLogService } from './audit-log.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AuditLogService', () => {
  function makeService() {
    const prisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    return { service: new AuditLogService(prisma), prisma };
  }

  it('record writes exactly the given fields', async () => {
    const { service, prisma } = makeService();
    await service.record({
      actorUserId: 'u1',
      action: 'user.disabled',
      targetType: 'User',
      targetId: 'u2',
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'u1',
        action: 'user.disabled',
        targetType: 'User',
        targetId: 'u2',
      },
    });
  });

  it('search with no filters returns everything, most recent first, default page size', async () => {
    const { service, prisma } = makeService();
    await service.search({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('search combines actorUserId/action filtered at the DB level with a fuzzy-matched q filtered in-app', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
      { action: 'user.disabled', targetType: 'User', targetId: 'acme-1' },
      {
        action: 'rfq.status_updated',
        targetType: 'ServiceRequest',
        targetId: 'x',
      },
    ]);

    const result = await service.search({
      actorUserId: 'u1',
      action: 'user.disabled',
      q: 'acme',
    });

    const where = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(where.actorUserId).toBe('u1');
    expect(where.action).toBe('user.disabled');
    expect(result.items).toEqual([
      expect.objectContaining({ targetId: 'acme-1' }),
    ]);
  });

  it('search respects a custom skip/take for pagination, applied in-app over the filtered results', async () => {
    const { service, prisma } = makeService();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ targetId: `row-${i}` })),
    );

    const result = await service.search({ skip: 2, take: 2 });

    expect(result.items).toEqual([
      expect.objectContaining({ targetId: 'row-2' }),
      expect.objectContaining({ targetId: 'row-3' }),
    ]);
    expect(result.hasMore).toBe(true);
  });
});
