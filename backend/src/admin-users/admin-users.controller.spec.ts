import { BadRequestException } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { Role, type User } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditLogService } from '../audit-log/audit-log.service';

// An admin locking themselves out (accidentally or via a compromised
// session) would require direct DB access to recover from — this guard is
// the only thing standing between "disable" and that scenario.
describe('AdminUsersController.disable', () => {
  const admin = { id: 'admin-1', role: Role.admin } as User;

  function makeController() {
    const prisma = {
      user: {
        update: jest.fn().mockResolvedValue({ id: 'client-1', disabledAt: new Date() }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
    const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
    return { controller: new AdminUsersController(prisma, auditLog), prisma, auditLog };
  }

  it('refuses to let an admin disable their own account', async () => {
    const { controller, prisma } = makeController();
    await expect(controller.disable(admin, admin.id)).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('disables another account and records an audit entry', async () => {
    const { controller, prisma, auditLog } = makeController();
    await controller.disable(admin, 'client-1');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'client-1' }, data: { disabledAt: expect.any(Date) } });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: admin.id, action: 'user.disabled', targetId: 'client-1' }),
    );
  });

  it('enable clears disabledAt and records an audit entry', async () => {
    const { controller, prisma, auditLog } = makeController();
    (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'client-1', disabledAt: null });

    await controller.enable(admin, 'client-1');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'client-1' }, data: { disabledAt: null } });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: admin.id, action: 'user.enabled', targetId: 'client-1' }),
    );
  });

  it('list filters by role when given', async () => {
    const { controller, prisma } = makeController();
    await controller.list(undefined, Role.client);
    expect((prisma.user.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ role: Role.client });
  });

  it('list combines a role filter with a free-text search across name/email/company', async () => {
    const { controller, prisma } = makeController();
    await controller.list('acme', Role.client);
    const where = (prisma.user.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.role).toBe(Role.client);
    expect(where.OR).toBeDefined();
  });

  it('list never selects a password or credential field', async () => {
    const { controller, prisma } = makeController();
    await controller.list();
    const select = (prisma.user.findMany as jest.Mock).mock.calls[0][0].select;
    expect(Object.keys(select)).not.toContain('password');
  });
});
