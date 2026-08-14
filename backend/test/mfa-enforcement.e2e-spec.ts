import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap';
import { createUser } from './utils/seed';
import { bearerFor } from './utils/clerk-mock';
import { Role } from '../src/generated/prisma';
import type { PrismaService } from '../src/prisma/prisma.service';

jest.mock('@clerk/backend', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock() factories are hoisted above imports, so this can't be an imported binding
  require('./utils/clerk-mock').mockClerkBackend(),
);

// docs/BUSINESS_RULES.md rule 2: "Only Admin accounts require MFA" —
// enforced server-side by MfaEnrolledGuard, not just the frontend's
// /admin-mfa-setup redirect. This drives the exact scenario the guard
// exists for: a real admin account, seeded with mfaEnrolled: false, must
// be rejected by a real admin-only route over real HTTP — while the
// enrollment endpoints themselves stay reachable, since an unenrolled
// admin has to be able to reach them at all to ever enroll.
describe('MfaEnrolledGuard — unenrolled admins are blocked from admin routes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unenrolled admin from an admin-only route with 403, not 200', async () => {
    const admin = await createUser(prisma, {
      role: Role.admin,
      mfaEnrolled: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(bearerFor(admin.clerkId));

    expect(res.status).toBe(403);

    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('still lets an unenrolled admin reach the MFA enrollment endpoint itself (@MfaExempt)', async () => {
    const admin = await createUser(prisma, {
      role: Role.admin,
      mfaEnrolled: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/mfa/status')
      .set(bearerFor(admin.clerkId));

    // Must not be the 403 an unenrolled admin gets everywhere else —
    // this route is how they'd ever complete enrollment in the first
    // place, so it can't be behind the same gate it exists to satisfy.
    expect(res.status).toBe(200);

    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('allows an enrolled admin through to the same admin-only route that rejected the unenrolled one', async () => {
    const admin = await createUser(prisma, {
      role: Role.admin,
      mfaEnrolled: true,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(bearerFor(admin.clerkId));

    expect(res.status).toBe(200);

    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('never gates a non-admin account regardless of mfaEnrolled', async () => {
    const client = await createUser(prisma, {
      role: Role.client,
      mfaEnrolled: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set(bearerFor(client.clerkId));

    expect(res.status).toBe(200);

    await prisma.user.delete({ where: { id: client.id } });
  });
});
