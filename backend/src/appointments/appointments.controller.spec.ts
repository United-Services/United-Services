import { ConflictException } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma';

// Booking must be race-safe: two clients hitting POST /book for the same
// slot at once should never both succeed. The controller enforces this via
// a single conditional updateMany(isBooked=false -> true) inside a
// transaction (see docs/BUSINESS_RULES.md rule 4) — these tests exercise
// both branches of that guard without needing a real database.
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
    const controller = new AppointmentsController(prisma);

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
    const controller = new AppointmentsController(prisma);

    await expect(controller.book(client, { slotId: 'slot-1' })).rejects.toThrow(
      ConflictException,
    );
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });
});
