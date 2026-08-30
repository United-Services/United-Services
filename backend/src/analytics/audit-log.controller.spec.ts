import { AuditLogController } from './audit-log.controller';
import type { AuditLogService } from '../audit-log/audit-log.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma';

describe('AuditLogController', () => {
  // docs/BUSINESS_RULES.md rule 17: this route is exclusively
  // super_admin, never a plain admin — a metadata regression here (e.g.
  // someone "fixing" this back to ADMIN_ROLES thinking it looked like an
  // inconsistency) would silently reopen the exclusivity. See the e2e
  // super-admin-role spec for the real-HTTP version of this same guarantee.
  it('is gated to exactly Role.super_admin, not admin or ADMIN_ROLES', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AuditLogController);
    expect(roles).toEqual([Role.super_admin]);
  });

  it('passes q/actorUserId/action query params straight through to the service', async () => {
    const auditLog = {
      search: jest.fn().mockResolvedValue([]),
    } as unknown as AuditLogService;
    const controller = new AuditLogController(auditLog);

    await controller.search('acme', 'u1', 'user.disabled', 0, 20);

    expect(auditLog.search).toHaveBeenCalledWith({
      q: 'acme',
      actorUserId: 'u1',
      action: 'user.disabled',
      skip: 0,
      take: 20,
    });
  });
});
