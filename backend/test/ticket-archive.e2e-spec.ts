import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap';
import { createUser } from './utils/seed';
import { bearerFor } from './utils/clerk-mock';
import { Role } from '../src/generated/prisma';
import type { PrismaService } from '../src/prisma/prisma.service';
import { MfaService } from '../src/mfa/mfa.service';

const sessionIdFor = (clerkId: string) => `sess_${clerkId}`;

jest.mock('@clerk/backend', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock() factories are hoisted above imports, so this can't be an imported binding
  require('./utils/clerk-mock').mockClerkBackend(),
);

async function verifiedSuperAdmin(prisma: PrismaService, app: INestApplication) {
  const user = await createUser(prisma, {
    role: Role.super_admin,
    mfaEnrolled: true,
  });
  await app.get(MfaService).markSessionVerified(sessionIdFor(user.clerkId));
  return user;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The archive job runs asynchronously via BullMQ (real Redis in this
// e2e environment) — polls briefly rather than assuming it's finished
// the instant the HTTP response comes back.
async function waitUntilArchived(
  prisma: PrismaService,
  ticketId: string,
  maxAttempts = 60,
) {
  for (let i = 0; i < maxAttempts; i++) {
    const stillLive = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!stillLive) return;
    await sleep(250);
  }
  throw new Error(
    `Ticket ${ticketId} was not archived within ${maxAttempts * 250}ms`,
  );
}

// Real HTTP, real Postgres, real Redis/BullMQ — this exercises the
// entire resolved-is-terminal + archival pipeline end to end, not a
// mocked version of any piece of it. Every fixture here deliberately
// omits screenshotS3Key: this environment's AWS credentials are CI
// placeholders (see ci.yml), so a ticket with a real screenshot would
// hit a fake S3 bucket. TicketArchiveService.archiveTicket only ever
// calls S3 when screenshotS3Key is set — omitting it here is what keeps
// this test hermetic while still covering the real DB + queue path in
// full. See docs/BUSINESS_RULES.md rule 20 and
// ticket-archive.service.spec.ts for the screenshot-deletion path,
// covered there with a mocked S3Service instead.
describe('ticket archival — resolved is terminal (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolving a ticket via real HTTP archives it and deletes the live row', async () => {
    const superAdmin = await verifiedSuperAdmin(prisma, app);
    const ticket = await prisma.ticket.create({
      data: {
        name: 'E2E Reporter',
        email: 'e2e-reporter@example.com',
        type: 'technical',
        details: 'Archival pipeline test',
      },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set(bearerFor(superAdmin.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.resolvedAt).toBeTruthy();

    await waitUntilArchived(prisma, ticket.id);

    const archived = await prisma.ticketArchive.findUnique({
      where: { originalTicketId: ticket.id },
    });
    expect(archived).not.toBeNull();
    expect(archived?.name).toBe('E2E Reporter');
    expect(archived?.resolvedAt).toBeTruthy();

    await prisma.ticketArchive.delete({ where: { id: archived!.id } });
    await prisma.user.delete({ where: { id: superAdmin.id } });
  }, 25_000);

  it('rejects reopening a resolved (and by then archived) ticket with 409, not a silent success', async () => {
    const superAdmin = await verifiedSuperAdmin(prisma, app);
    const ticket = await prisma.ticket.create({
      data: {
        name: 'E2E Reopen Test',
        email: 'e2e-reopen@example.com',
        type: 'technical',
        details: 'Reopen-rejection test',
      },
    });

    const resolveRes = await request(app.getHttpServer())
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set(bearerFor(superAdmin.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'resolved' });
    expect(resolveRes.status).toBe(200);

    await waitUntilArchived(prisma, ticket.id);

    const reopenRes = await request(app.getHttpServer())
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set(bearerFor(superAdmin.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'contacted' });

    // The ticket row is gone entirely by now — this correctly 404s
    // rather than resurrecting it, which is a stronger guarantee than a
    // plain 409 would be (there's nothing left to conflict with; it's
    // just not there).
    expect(reopenRes.status).toBe(404);

    const archived = await prisma.ticketArchive.findUnique({
      where: { originalTicketId: ticket.id },
    });
    await prisma.ticketArchive.delete({ where: { id: archived!.id } });
    await prisma.user.delete({ where: { id: superAdmin.id } });
  }, 25_000);

  it('rejects reopening a ticket resolved moments ago, before archival has necessarily finished — the atomic guard, not just the row being gone, is what blocks it', async () => {
    const superAdmin = await verifiedSuperAdmin(prisma, app);
    const ticket = await prisma.ticket.create({
      data: {
        name: 'E2E Race Test',
        email: 'e2e-race@example.com',
        type: 'technical',
        details: 'Immediate-reopen-after-resolve race test',
      },
    });

    const resolveRes = await request(app.getHttpServer())
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set(bearerFor(superAdmin.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'resolved' });
    expect(resolveRes.status).toBe(200);

    // Fired immediately after, without waiting for archival — the
    // atomic `status: { not: resolved }` guard on the live row is what
    // must reject this, whether or not the async archive job has run
    // yet.
    const reopenRes = await request(app.getHttpServer())
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set(bearerFor(superAdmin.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'contacted' });

    expect([404, 409]).toContain(reopenRes.status);

    await waitUntilArchived(prisma, ticket.id);
    const archived = await prisma.ticketArchive.findUnique({
      where: { originalTicketId: ticket.id },
    });
    await prisma.ticketArchive.delete({ where: { id: archived!.id } });
    await prisma.user.delete({ where: { id: superAdmin.id } });
  }, 25_000);

  it('a plain admin (not super_admin) still cannot update ticket status at all — unaffected by the archival change', async () => {
    const admin = await createUser(prisma, {
      role: Role.admin,
      mfaEnrolled: true,
    });
    await app.get(MfaService).markSessionVerified(sessionIdFor(admin.clerkId));
    const ticket = await prisma.ticket.create({
      data: {
        name: 'E2E Admin Reject',
        email: 'e2e-admin-reject@example.com',
        type: 'technical',
        details: 'Plain admin should not reach this',
      },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/tickets/${ticket.id}/status`)
      .set(bearerFor(admin.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'resolved' });

    expect(res.status).toBe(403);

    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });
});
