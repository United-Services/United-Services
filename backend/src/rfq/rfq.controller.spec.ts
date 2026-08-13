import { RfqController } from './rfq.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

describe('RfqController', () => {
  const client = { id: 'client-1' } as User;
  const admin = { id: 'admin-1' } as User;

  function makeController() {
    const prisma = {
      serviceRequest: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
    return { controller: new RfqController(prisma, auditLog), prisma, auditLog };
  }

  it('scopes a new RFQ to the submitting client', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.create as jest.Mock).mockResolvedValue({ id: 'rfq-1' });

    await controller.create(client, { serviceId: 'svc-1', projectDetails: 'A pipeline project' });

    expect(prisma.serviceRequest.create).toHaveBeenCalledWith({
      data: { clientId: client.id, serviceId: 'svc-1', projectDetails: 'A pipeline project' },
    });
  });

  it('scopes "mine" to only the calling client\'s requests', async () => {
    const { controller, prisma } = makeController();
    await controller.mine(client);
    expect((prisma.serviceRequest.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ clientId: client.id });
  });

  it('records an audit entry with the new status when an admin updates one', async () => {
    const { controller, prisma, auditLog } = makeController();
    (prisma.serviceRequest.update as jest.Mock).mockResolvedValue({ id: 'rfq-1', status: 'quoted' });

    await controller.updateStatus(admin, 'rfq-1', { status: 'quoted' } as any);

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rfq.status_updated', targetId: 'rfq-1', metadata: { status: 'quoted' } }),
    );
  });

  it('list applies a search filter across client and project fields when q is given', async () => {
    const { controller, prisma } = makeController();
    await controller.list('acme');
    const where = (prisma.serviceRequest.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.length).toBeGreaterThan(0);
  });

  it('list returns everything (no filter) when q is omitted', async () => {
    const { controller, prisma } = makeController();
    await controller.list();
    const where = (prisma.serviceRequest.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({});
  });
});
