import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap';
import { createUser } from './utils/seed';
import { bearerFor } from './utils/clerk-mock';
import { Role } from '../src/generated/prisma';
import type { PrismaService } from '../src/prisma/prisma.service';

// require(), not an imported binding — jest.mock() factories are hoisted
// above the file's imports, so referencing an imported function here
// would throw "Cannot access before initialization".
jest.mock('@clerk/backend', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock() factories are hoisted above imports, so this can't be an imported binding
  require('./utils/clerk-mock').mockClerkBackend(),
);

// docs/BUSINESS_RULES.md rule 4: "A booked appointment slot must disappear
// from availability for everyone else immediately on booking — no
// double-booking." A unit test with a mocked Prisma client can't test this
// at all — the mock just returns whatever the test told it to, regardless
// of how many "concurrent" calls happen, because there's no real database
// transaction/row-lock underneath it. This test fires two real concurrent
// HTTP requests at a real Postgres-backed endpoint and checks the actual
// outcome.
describe('Appointment booking — no double-booking under concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('when two clients race to book the same slot, exactly one succeeds and exactly one appointment row exists', async () => {
    const admin = await createUser(prisma, { role: Role.admin });
    const clientA = await createUser(prisma, { role: Role.client });
    const clientB = await createUser(prisma, { role: Role.client });

    const slot = await prisma.appointmentSlot.create({
      data: {
        date: new Date('2030-06-01'),
        startTime: new Date('2030-06-01T10:00:00Z'),
        endTime: new Date('2030-06-01T10:30:00Z'),
        createdByAdminId: admin.id,
      },
    });

    const bookAs = (clerkId: string) =>
      request(app.getHttpServer())
        .post('/api/v1/appointments/book')
        .set(bearerFor(clerkId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ slotId: slot.id });

    // Fired concurrently, not sequentially — Promise.all, not two awaits
    // in a row, so both requests are genuinely in flight against the DB
    // at the same time.
    const [resA, resB] = await Promise.all([
      bookAs(clientA.clerkId),
      bookAs(clientB.clerkId),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const appointments = await prisma.appointment.findMany({
      where: { slotId: slot.id },
    });
    expect(appointments).toHaveLength(1);

    const finalSlot = await prisma.appointmentSlot.findUniqueOrThrow({
      where: { id: slot.id },
    });
    expect(finalSlot.isBooked).toBe(true);

    // Cleanup — this test file shares a database with every other e2e
    // spec run in the same CI job.
    await prisma.appointment.deleteMany({ where: { slotId: slot.id } });
    await prisma.appointmentSlot.delete({ where: { id: slot.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [admin.id, clientA.id, clientB.id] } },
    });
  });
});
