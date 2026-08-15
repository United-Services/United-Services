import { ConflictException } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

function makeAuditLog() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;
}

// Booking must be race-safe: two clients hitting POST /book for the same
// slot at once should never both succeed. The controller enforces this via
// a single conditional updateMany(isBooked=false -> true) inside a
// transaction (see docs/BUSINESS_RULES.md rule 4) — these tests exercise
// both branches of that guard without needing a real database.
//
// Mutation-tested: neither test here actually triggers the real race (Node's
// single-threaded execution can't hit that window against a mocked client).
// The "already taken" test alone would pass unchanged even if the atomic
// where-clause guard were silently dropped — it only checks the controller's
// reaction to count:0, not that the guard produces it. The only thing that
// catches a dropped `isBooked: false` condition is the exact-args assertion
// in "books the slot when it is still open" below (asserting the where
// clause shape passed to updateMany). Any future concurrency test in this
// codebase needs the same pattern: assert the exact conditional query shape
// sent to the DB and trust Postgres's atomicity, since a mocked client can't
// reproduce the real race to catch a regression behaviorally.
describe('AppointmentsController.book', () => {
  const client = { id: 'client-1' } as User;

  type Tx = {
    appointmentSlot: { updateMany: jest.Mock };
    appointment: { create: jest.Mock };
  };

  function makePrisma(count: number) {
    const tx: Tx = {
      appointmentSlot: { updateMany: jest.fn().mockResolvedValue({ count }) },
      appointment: {
        create: jest.fn().mockResolvedValue({
          id: 'appt-1',
          slotId: 'slot-1',
          clientId: client.id,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (tx: Tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    return { prisma, tx };
  }

  it('books the slot when it is still open', async () => {
    const { prisma, tx } = makePrisma(1);
    const controller = new AppointmentsController(prisma, makeAuditLog());

    const result = await controller.book(client, { slotId: 'slot-1' });

    expect(tx.appointmentSlot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', isBooked: false },
      data: { isBooked: true },
    });
    expect(tx.appointment.create).toHaveBeenCalledWith({
      data: { slotId: 'slot-1', clientId: client.id },
      include: { slot: true },
    });
    expect(result).toMatchObject({ id: 'appt-1' });
  });

  it('rejects the booking when the slot was already taken (race lost)', async () => {
    const { prisma, tx } = makePrisma(0);
    const controller = new AppointmentsController(prisma, makeAuditLog());

    await expect(controller.book(client, { slotId: 'slot-1' })).rejects.toThrow(
      ConflictException,
    );
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });
});

describe('AppointmentsController.openSlots', () => {
  it('excludes booked and admin-closed slots from the public list', () => {
    const findMany = jest.fn();
    const prisma = {
      appointmentSlot: { findMany },
    } as unknown as PrismaService;
    const controller = new AppointmentsController(prisma, makeAuditLog());

    controller.openSlots();

    const where = findMany.mock.calls[0][0].where;
    expect(where.isBooked).toBe(false);
    expect(where.isClosed).toBe(false);
  });
});

describe('AppointmentsController.allSlots', () => {
  it('excludes slots whose booking is done, but keeps unbooked and cancelled ones', () => {
    const findMany = jest.fn();
    const prisma = {
      appointmentSlot: { findMany },
    } as unknown as PrismaService;
    const controller = new AppointmentsController(prisma, makeAuditLog());

    controller.allSlots();

    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { appointment: null },
      { appointment: { status: { not: 'done' } } },
    ]);
  });
});

describe('AppointmentsController.updateSlot', () => {
  const admin = { id: 'admin-1' } as User;

  it('closes a slot and records an audit entry', async () => {
    const update = jest
      .fn()
      .mockResolvedValue({ id: 'slot-1', isClosed: true });
    const prisma = {
      appointmentSlot: { update },
    } as unknown as PrismaService;
    const auditLog = makeAuditLog();
    const controller = new AppointmentsController(prisma, auditLog);

    await controller.updateSlot(admin, 'slot-1', { isClosed: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'slot-1' },
      data: { isClosed: true },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment_slot.updated',
        targetId: 'slot-1',
      }),
    );
  });

  it('edits the date/time fields when given', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'slot-1' });
    const prisma = {
      appointmentSlot: { update },
    } as unknown as PrismaService;
    const controller = new AppointmentsController(prisma, makeAuditLog());

    await controller.updateSlot(admin, 'slot-1', {
      date: '2026-09-01',
      startTime: '2026-09-01T10:00:00.000Z',
      endTime: '2026-09-01T10:30:00.000Z',
    });

    const data = update.mock.calls[0][0].data;
    expect(data.date).toEqual(new Date('2026-09-01'));
    expect(data.startTime).toEqual(new Date('2026-09-01T10:00:00.000Z'));
    expect(data.endTime).toEqual(new Date('2026-09-01T10:30:00.000Z'));
  });
});

describe('AppointmentsController.updateStatus', () => {
  const admin = { id: 'admin-1' } as User;

  it.each(['done', 'cancelled'] as const)(
    'sets status=%s and records an audit entry',
    async (status) => {
      const update = jest.fn().mockResolvedValue({ id: 'appt-1', status });
      const prisma = { appointment: { update } } as unknown as PrismaService;
      const auditLog = makeAuditLog();
      const controller = new AppointmentsController(prisma, auditLog);

      await controller.updateStatus(admin, 'appt-1', { status });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'appointment.status_updated',
          targetId: 'appt-1',
          metadata: { status },
        }),
      );
    },
  );
});
