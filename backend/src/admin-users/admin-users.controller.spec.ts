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
      user: { update: jest.fn().mockResolvedValue({ id: 'client-1', disabledAt: new Date() }) },
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
});
