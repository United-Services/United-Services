import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RfqController } from './rfq.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

describe('RfqController', () => {
  const client = { id: 'client-1' } as User;
  const admin = { id: 'admin-1' } as User;

  function makeController() {
    const prisma = {
      serviceRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    return {
      controller: new RfqController(prisma, auditLog),
      prisma,
      auditLog,
    };
  }

  it('scopes a new RFQ to the submitting client', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.create as jest.Mock).mockResolvedValue({
      id: 'rfq-1',
    });

    await controller.create(client, {
      serviceId: 'svc-1',
      projectDetails: 'A pipeline project',
    });

    expect(prisma.serviceRequest.create).toHaveBeenCalledWith({
      data: {
        clientId: client.id,
        serviceId: 'svc-1',
        projectDetails: 'A pipeline project',
      },
    });
  });

  it('scopes "mine" to only the calling client\'s requests', async () => {
    const { controller, prisma } = makeController();
    await controller.mine(client);
    expect(
      (prisma.serviceRequest.findMany as jest.Mock).mock.calls[0][0].where,
    ).toEqual({ clientId: client.id });
  });

  it('records an audit entry with the new status when an admin updates one', async () => {
    const { controller, prisma, auditLog } = makeController();
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue({
      contactedAt: null,
    });
    (prisma.serviceRequest.update as jest.Mock).mockResolvedValue({
      id: 'rfq-1',
      status: 'quoted',
    });

    await controller.updateStatus(admin, 'rfq-1', { status: 'quoted' } as any);

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rfq.status_updated',
        targetId: 'rfq-1',
        metadata: { status: 'quoted' },
      }),
    );
  });

  it('freely moves status between pending and in_review before contact', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue({
      contactedAt: null,
    });
    (prisma.serviceRequest.update as jest.Mock).mockResolvedValue({
      id: 'rfq-1',
      status: 'pending',
    });

    await controller.updateStatus(admin, 'rfq-1', {
      status: 'pending',
    } as any);

    expect(prisma.serviceRequest.update).toHaveBeenCalledWith({
      where: { id: 'rfq-1' },
      data: { status: 'pending' },
    });
  });

  it('rejects any status change once the request is already contacted', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue({
      contactedAt: new Date('2026-01-01'),
    });

    await expect(
      controller.updateStatus(admin, 'rfq-1', { status: 'in_review' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
  });

  it('404s updateStatus for an unknown RFQ id instead of a generic 500', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      controller.updateStatus(admin, 'missing', { status: 'quoted' } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
  });

  it('list fuzzy-matches q across client and project fields, filtering out non-matches', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'rfq-1',
        client: { firstName: 'Ana', lastName: 'Cruz', companyName: 'Acme' },
        projectDetails: 'Pipeline coating',
      },
      {
        id: 'rfq-2',
        client: { firstName: 'Bo', lastName: 'Lee', companyName: 'Globex' },
        projectDetails: 'Cathodic protection',
      },
    ]);

    const result = await controller.list('acme');

    expect(result).toEqual([expect.objectContaining({ id: 'rfq-1' })]);
  });

  it('list returns everything (no filter) when q is omitted', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue([
      { id: 'rfq-1', client: {}, projectDetails: '' },
    ]);
    const result = await controller.list();
    expect(result).toHaveLength(1);
    const where = (prisma.serviceRequest.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(where).toBeUndefined();
  });

  it('marks a not-yet-contacted request as contacted', async () => {
    const { controller, prisma, auditLog } = makeController();
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue({
      contactedAt: null,
    });
    (prisma.serviceRequest.update as jest.Mock).mockImplementation(
      ({ data }) => ({ id: 'rfq-1', ...data }),
    );

    const result = await controller.markContacted(admin, 'rfq-1');

    expect(prisma.serviceRequest.update).toHaveBeenCalledWith({
      where: { id: 'rfq-1' },
      data: { contactedAt: expect.any(Date) },
    });
    expect(result.contactedAt).toBeInstanceOf(Date);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rfq.contacted',
        targetId: 'rfq-1',
      }),
    );
  });

  it('rejects marking an already-contacted request again — contacted is final', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue({
      contactedAt: new Date('2026-01-01'),
    });

    await expect(controller.markContacted(admin, 'rfq-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
  });

  it('404s markContacted for an unknown RFQ id instead of a generic 500', async () => {
    const { controller, prisma } = makeController();
    (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(controller.markContacted(admin, 'missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
  });
});
