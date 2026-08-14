import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap';
import { createUser } from './utils/seed';
import { bearerFor } from './utils/clerk-mock';
import type { PrismaService } from '../src/prisma/prisma.service';

jest.mock('@clerk/backend', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock() factories are hoisted above imports, so this can't be an imported binding
  require('./utils/clerk-mock').mockClerkBackend(),
);

// A cross-site HTML <form method="POST"> can carry a victim's session
// cookie automatically but cannot set a custom header — so
// CsrfHeaderGuard requiring X-Requested-With on every state-changing
// request is what actually stops that forgery, not the cookie/bearer auth
// itself (a valid Authorization header is present in every case below;
// only the CSRF header varies). This drives real HTTP requests through
// the real guard chain rather than constructing the guard in isolation,
// so it also proves CsrfHeaderGuard is actually wired into the app, not
// just correct as a standalone class.
describe('CsrfHeaderGuard — state-changing requests require X-Requested-With (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an authenticated PATCH with no CSRF header — the classic forged cross-site form vector', async () => {
    const client = await createUser(prisma);

    const res = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set(bearerFor(client.clerkId))
      // Deliberately no X-Requested-With — this is what a plain HTML
      // <form method="POST"> submitted from an attacker's page would
      // look like: it carries auth (a real cookie in production; here a
      // real bearer token) but cannot add custom headers.
      .send({ companyName: 'Forged Co' });

    expect(res.status).toBe(403);

    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(unchanged.companyName).not.toBe('Forged Co');

    await prisma.user.delete({ where: { id: client.id } });
  });

  it('allows the identical request through once the CSRF header is present', async () => {
    const client = await createUser(prisma);

    const res = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set(bearerFor(client.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ companyName: 'Legit Co' });

    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(updated.companyName).toBe('Legit Co');

    await prisma.user.delete({ where: { id: client.id } });
  });

  it('never blocks a GET regardless of the header — only state-changing methods need it', async () => {
    const client = await createUser(prisma);

    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set(bearerFor(client.clerkId));

    expect(res.status).toBe(200);

    await prisma.user.delete({ where: { id: client.id } });
  });
});
