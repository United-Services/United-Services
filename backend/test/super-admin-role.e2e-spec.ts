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

// Real HTTP, real Prisma, the real @Roles(...ADMIN_ROLES)/@Roles(Role.super_admin)
// decorators on the real controllers — not a mocked Reflector like the
// guard unit tests use. See docs/BUSINESS_RULES.md rule 17.
async function verifiedAdmin(prisma: PrismaService, app: INestApplication, role: Role) {
  const user = await createUser(prisma, { role, mfaEnrolled: true });
  await app.get(MfaService).markSessionVerified(sessionIdFor(user.clerkId));
  return user;
}

describe('super_admin role (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('audit log — super_admin exclusive', () => {
    it('rejects a fully-verified plain admin with 403, not 200', async () => {
      const admin = await verifiedAdmin(prisma, app, Role.admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-log')
        .set(bearerFor(admin.clerkId));

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: admin.id } });
    });

    it('allows a fully-verified super_admin', async () => {
      const superAdmin = await verifiedAdmin(prisma, app, Role.super_admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-log')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(200);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });

    it('still rejects a super_admin who has not completed MFA enrollment — the exclusive route is not a bypass around MFA', async () => {
      const superAdmin = await createUser(prisma, {
        role: Role.super_admin,
        mfaEnrolled: false,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-log')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });

    it('rejects an enrolled super_admin whose current session has not been verified', async () => {
      const superAdmin = await createUser(prisma, {
        role: Role.super_admin,
        mfaEnrolled: true,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-log')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });

    it('rejects an unauthenticated request', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/audit-log');
      expect(res.status).toBe(401);
    });

    it('rejects a plain client account outright', async () => {
      const client = await createUser(prisma, { role: Role.client });

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-log')
        .set(bearerFor(client.clerkId));

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: client.id } });
    });
  });

  describe('tickets — super_admin exclusive (list + status update)', () => {
    it('rejects a fully-verified plain admin listing tickets', async () => {
      const admin = await verifiedAdmin(prisma, app, Role.admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tickets')
        .set(bearerFor(admin.clerkId));

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: admin.id } });
    });

    it('allows a fully-verified super_admin to list tickets', async () => {
      const superAdmin = await verifiedAdmin(prisma, app, Role.super_admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/tickets')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });

    it('rejects a fully-verified plain admin updating a ticket status', async () => {
      const admin = await verifiedAdmin(prisma, app, Role.admin);
      const ticket = await prisma.ticket.create({
        data: {
          name: 'Test Reporter',
          email: 'reporter@example.com',
          type: 'technical',
          details: 'Something is broken',
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${ticket.id}/status`)
        .set(bearerFor(admin.clerkId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ status: 'contacted' });

      expect(res.status).toBe(403);

      await prisma.ticket.delete({ where: { id: ticket.id } });
      await prisma.user.delete({ where: { id: admin.id } });
    });

    it('allows a fully-verified super_admin to update a ticket status', async () => {
      const superAdmin = await verifiedAdmin(prisma, app, Role.super_admin);
      const ticket = await prisma.ticket.create({
        data: {
          name: 'Test Reporter',
          email: 'reporter@example.com',
          type: 'technical',
          details: 'Something is broken',
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tickets/${ticket.id}/status`)
        .set(bearerFor(superAdmin.clerkId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ status: 'contacted' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('contacted');

      await prisma.ticket.delete({ where: { id: ticket.id } });
      await prisma.user.delete({ where: { id: superAdmin.id } });
    });

    it('leaves the public ticket-submission endpoint reachable by anyone, unaffected by the super_admin restriction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tickets')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Anonymous Visitor',
          email: 'visitor@example.com',
          type: 'non_technical',
          details: 'A question about services',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');

      await prisma.ticket.delete({ where: { id: res.body.id } });
    });
  });

  describe('super_admin has every ordinary admin permission too', () => {
    it('reaches the general admin/users route, same as a plain admin would', async () => {
      const superAdmin = await verifiedAdmin(prisma, app, Role.super_admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(200);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });

    it('reaches the admin-only services management route', async () => {
      const superAdmin = await verifiedAdmin(prisma, app, Role.super_admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/analytics/overview')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(200);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });

    it('still lets an unenrolled super_admin reach the MFA enrollment endpoint itself (@MfaExempt)', async () => {
      const superAdmin = await createUser(prisma, {
        role: Role.super_admin,
        mfaEnrolled: false,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/mfa/status')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(200);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });
  });

  describe('GET /me reflects the super_admin role correctly', () => {
    it('returns role: super_admin for a super_admin account', async () => {
      const superAdmin = await verifiedAdmin(prisma, app, Role.super_admin);

      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set(bearerFor(superAdmin.clerkId));

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('super_admin');
      expect(res.body.mfaSessionVerified).toBe(true);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });
  });

  describe('the generic change-password route stays MFA-gated for super_admin too', () => {
    // Mirrors me.controller.ts's own admin case — a stolen super_admin
    // session cookie must not be able to rotate the password with zero
    // fresh MFA proof, same as for a plain admin (this is the exact bug
    // class the admin fix closed; super_admin must not silently reopen it
    // via a `=== Role.admin` check that excludes the new role).
    it('refuses to let an already-onboarded super_admin use the generic change-password endpoint', async () => {
      const superAdmin = await verifiedAdmin(prisma, app, Role.super_admin);

      const res = await request(app.getHttpServer())
        .post('/api/v1/me/change-password')
        .set(bearerFor(superAdmin.clerkId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ newPassword: 'SomeNewPassword123!' });

      expect(res.status).toBe(403);

      await prisma.user.delete({ where: { id: superAdmin.id } });
    });
  });
});
