import { AuditLogController } from './audit-log.controller';
import type { AuditLogService } from '../audit-log/audit-log.service';

describe('AuditLogController', () => {
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
