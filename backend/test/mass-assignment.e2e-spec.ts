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

// UpdateProfileDto deliberately has no `role` field, and PATCH /me does
// `data: dto` — spreading the whole (validated) DTO straight into
// Prisma. That's only safe because of the global ValidationPipe's
// `whitelist: true, forbidNonWhitelisted: true` (main.ts) stripping/
// rejecting anything not declared on the DTO class. This test proves
// that config is actually load-bearing by sending a real client-supplied
// `role` field in a real request body through the real pipeline —
// a controller unit test that mocks `dto` as already-validated (as every
// existing me.controller.spec.ts test does, by construction) cannot
// exercise the ValidationPipe at all, so it can't catch a regression
// where forbidNonWhitelisted gets turned off or a DTO grows an unsafe
// field.
describe('Mass assignment — client-supplied privileged fields are rejected, not silently applied (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a PATCH /me body that smuggles a role field, and never applies it', async () => {
    const client = await createUser(prisma, { role: Role.client });

    const res = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set(bearerFor(client.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ companyName: 'Real Co', role: 'admin' });

    // forbidNonWhitelisted makes this a 400, not a 200 that silently
    // drops the extra field — the whole request is rejected.
    expect(res.status).toBe(400);

    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(unchanged.role).toBe(Role.client);
    expect(unchanged.companyName).not.toBe('Real Co');

    await prisma.user.delete({ where: { id: client.id } });
  });

  it('rejects a smuggled mfaEnrolled field the same way', async () => {
    const client = await createUser(prisma, { role: Role.client });

    const res = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set(bearerFor(client.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ companyName: 'Real Co', mfaEnrolled: true });

    expect(res.status).toBe(400);

    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(unchanged.mfaEnrolled).toBe(false);

    await prisma.user.delete({ where: { id: client.id } });
  });

  it('sanity check: a request with only whitelisted fields still succeeds', async () => {
    const client = await createUser(prisma, { role: Role.client });

    const res = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set(bearerFor(client.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ companyName: 'Real Co' });

    expect(res.status).toBe(200);

    await prisma.user.delete({ where: { id: client.id } });
  });
});
