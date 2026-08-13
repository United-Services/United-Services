import { AuditLogService } from './audit-log.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AuditLogService', () => {
  function makeService() {
    const prisma = { auditLog: { create: jest.fn(), findMany: jest.fn() } } as unknown as PrismaService;
    return { service: new AuditLogService(prisma), prisma };
  }

  it('record writes exactly the given fields', async () => {
    const { service, prisma } = makeService();
    await service.record({ actorUserId: 'u1', action: 'user.disabled', targetType: 'User', targetId: 'u2' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { actorUserId: 'u1', action: 'user.disabled', targetType: 'User', targetId: 'u2' },
    });
  });

  it('search with no filters returns everything, most recent first, default page size', async () => {
    const { service, prisma } = makeService();
    await service.search({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { createdAt: 'desc' }, skip: 0, take: 25 }),
    );
  });

  it('search combines actorUserId, action, and free-text q filters', async () => {
    const { service, prisma } = makeService();
    await service.search({ actorUserId: 'u1', action: 'user.disabled', q: 'acme' });
    const where = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.actorUserId).toBe('u1');
    expect(where.action).toBe('user.disabled');
    expect(where.OR).toBeDefined();
  });

  it('search respects a custom skip/take for pagination', async () => {
    const { service, prisma } = makeService();
    await service.search({ skip: 50, take: 10 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 10 }));
  });
});
