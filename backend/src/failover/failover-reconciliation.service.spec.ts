import {
  FailoverReconciliationService,
  RECONCILE_BATCH_SIZE,
} from './failover-reconciliation.service';
import type { PrismaService } from '../prisma/prisma.service';

function writeLogEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'wl-1',
    tableName: 'user',
    operation: 'update',
    primaryKey: 'user-1',
    payload: { where: { id: 'user-1' }, data: { firstName: 'A' } },
    writtenAt: new Date(),
    reconciledAt: null,
    ...overrides,
  };
}

describe('FailoverReconciliationService', () => {
  function makePrisma() {
    const prisma = {
      failoverWriteLog: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      failoverConflict: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      user: {
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      appointmentSlot: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    return { service: new FailoverReconciliationService(prisma), prisma };
  }

  afterEach(() => jest.clearAllMocks());

  it('does nothing when there are no unreconciled entries', async () => {
    const { service, prisma } = makePrisma();
    (prisma.failoverWriteLog.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.reconcileAll();

    expect(result).toEqual({ replayed: 0, conflicts: 0 });
    expect(prisma.failoverWriteLog.update).not.toHaveBeenCalled();
  });

  it('replays a non-conflict-sensitive entry (e.g. User) via the matching model/operation and marks it reconciled', async () => {
    const { service, prisma } = makePrisma();
    (prisma.failoverWriteLog.findMany as jest.Mock).mockResolvedValueOnce([
      writeLogEntry(),
    ]);

    const result = await service.reconcileAll();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { firstName: 'A' },
    });
    expect(prisma.failoverWriteLog.update).toHaveBeenCalledWith({
      where: { id: 'wl-1' },
      data: { reconciledAt: expect.any(Date) },
    });
    expect(result).toEqual({ replayed: 1, conflicts: 0 });
  });

  it('marks a User replay error as reconciled without recording a conflict (User is not conflict-sensitive)', async () => {
    const { service, prisma } = makePrisma();
    (prisma.user.update as jest.Mock).mockRejectedValue(new Error('not found'));
    (prisma.failoverWriteLog.findMany as jest.Mock).mockResolvedValueOnce([
      writeLogEntry(),
    ]);

    const result = await service.reconcileAll();

    expect(prisma.failoverConflict.create).not.toHaveBeenCalled();
    expect(prisma.failoverWriteLog.update).toHaveBeenCalled();
    expect(result).toEqual({ replayed: 1, conflicts: 0 });
  });

  it('records a FailoverConflict when an AppointmentSlot updateMany replay matches 0 rows (the slot diverged on primary)', async () => {
    const { service, prisma } = makePrisma();
    (prisma.appointmentSlot.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    });
    (prisma.appointmentSlot.findUnique as jest.Mock).mockResolvedValue({
      id: 'slot-1',
      isBooked: true,
    });
    (prisma.failoverWriteLog.findMany as jest.Mock).mockResolvedValueOnce([
      writeLogEntry({
        tableName: 'appointmentSlot',
        operation: 'updateMany',
        primaryKey: 'slot-1',
        payload: {
          where: { id: 'slot-1', isBooked: false },
          data: { isBooked: true },
        },
      }),
    ]);

    const result = await service.reconcileAll();

    expect(prisma.failoverConflict.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableName: 'appointmentSlot',
        primaryKeyId: 'slot-1',
        primaryPayload: { id: 'slot-1', isBooked: true },
      }),
    });
    expect(prisma.failoverWriteLog.update).toHaveBeenCalled();
    expect(result).toEqual({ replayed: 1, conflicts: 1 });
  });

  it('does NOT record a conflict for an AppointmentSlot updateMany replay that matches >0 rows (no divergence)', async () => {
    const { service, prisma } = makePrisma();
    (prisma.appointmentSlot.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.failoverWriteLog.findMany as jest.Mock).mockResolvedValueOnce([
      writeLogEntry({
        tableName: 'appointmentSlot',
        operation: 'updateMany',
        primaryKey: 'slot-1',
        payload: {
          where: { id: 'slot-1', isBooked: false },
          data: { isBooked: true },
        },
      }),
    ]);

    const result = await service.reconcileAll();

    expect(prisma.failoverConflict.create).not.toHaveBeenCalled();
    expect(result).toEqual({ replayed: 1, conflicts: 0 });
  });

  it('logs but does not throw for an entry whose tableName/operation is unknown', async () => {
    const { service, prisma } = makePrisma();
    (prisma.failoverWriteLog.findMany as jest.Mock).mockResolvedValueOnce([
      writeLogEntry({ tableName: 'notAModel', operation: 'update' }),
    ]);

    await expect(service.reconcileAll()).resolves.toEqual({
      replayed: 1,
      conflicts: 0,
    });
    // Still marked reconciled — an unknown-model entry would otherwise
    // loop forever, retried on every future reconciliation run.
    expect(prisma.failoverWriteLog.update).toHaveBeenCalled();
  });

  it('loops across multiple full batches until a short final page ends it', async () => {
    const { service, prisma } = makePrisma();
    const fullBatch = Array.from({ length: RECONCILE_BATCH_SIZE }, (_, i) =>
      writeLogEntry({ id: `wl-${i}`, primaryKey: `user-${i}` }),
    );
    (prisma.failoverWriteLog.findMany as jest.Mock)
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([writeLogEntry({ id: 'wl-last' })]);

    const result = await service.reconcileAll();

    expect(prisma.failoverWriteLog.findMany).toHaveBeenCalledTimes(2);
    expect(result.replayed).toBe(RECONCILE_BATCH_SIZE + 1);
  });
});
