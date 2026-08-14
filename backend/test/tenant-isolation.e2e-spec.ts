import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap';
import { createUser } from './utils/seed';
import { bearerFor } from './utils/clerk-mock';
import { Role, FileAccessStatus } from '../src/generated/prisma';
import type { PrismaService } from '../src/prisma/prisma.service';

jest.mock('@clerk/backend', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock() factories are hoisted above imports, so this can't be an imported binding
  require('./utils/clerk-mock').mockClerkBackend(),
);

// docs/BUSINESS_RULES.md rule 3: "A client cannot see another client's
// data." This is only a meaningful test if it's driven by real,
// independently-seeded rows for two different real users and a real
// ownership-scoped query — a mocked-Prisma unit test can't actually prove
// this, because the test author controls both the mock's return value AND
// the assertion, so a controller that dropped its `where: { clientId }`
// filter would still pass (the mock would just keep returning whatever
// the test hard-coded). This seeds two real clients into a real database
// and asserts client B is rejected from client A's data over real HTTP.
describe("Tenant isolation — a client cannot reach another client's file-access request (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects client B's download attempt on client A's approved request, and excludes it from client B's own list", async () => {
    const admin = await createUser(prisma, { role: Role.admin });
    const clientA = await createUser(prisma, { role: Role.client });
    const clientB = await createUser(prisma, { role: Role.client });

    const service = await prisma.service.create({
      data: {
        slug: `svc-${clientA.id}`,
        name: 'Test Service',
        shortDescription: 'x',
        longDescription: 'x',
        iconKey: 'x',
      },
    });
    const serviceFile = await prisma.serviceFile.create({
      data: {
        serviceId: service.id,
        s3Key: `service-specs/${service.id}/spec.pdf`,
        originalFilename: 'spec.pdf',
        uploadedByAdminId: admin.id,
      },
    });
    const requestRow = await prisma.fileAccessRequest.create({
      data: {
        clientId: clientA.id,
        serviceFileId: serviceFile.id,
        status: FileAccessStatus.approved,
        decidedByAdminId: admin.id,
        decidedAt: new Date(),
      },
    });

    // The core IDOR check: client B, authenticated as themself, requests
    // client A's specific request id by substituting it directly.
    const downloadAsB = await request(app.getHttpServer())
      .get(`/api/v1/file-access-requests/${requestRow.id}/download`)
      .set(bearerFor(clientB.clerkId));
    expect(downloadAsB.status).toBe(403);

    // Also confirm the list endpoint is actually scoped, not just the
    // single-resource lookup.
    const mineAsB = await request(app.getHttpServer())
      .get('/api/v1/file-access-requests/mine')
      .set(bearerFor(clientB.clerkId));
    expect(mineAsB.status).toBe(200);
    expect(mineAsB.body).toEqual([]);

    // Sanity check the fixture itself is valid — client A really can
    // download their own approved request, so a 403 above is the
    // isolation check working, not a broken fixture.
    const downloadAsA = await request(app.getHttpServer())
      .get(`/api/v1/file-access-requests/${requestRow.id}/download`)
      .set(bearerFor(clientA.clerkId));
    expect(downloadAsA.status).toBe(200);

    const userIds = [admin.id, clientA.id, clientB.id];
    await prisma.fileAccessRequest.delete({ where: { id: requestRow.id } });
    await prisma.serviceFile.delete({ where: { id: serviceFile.id } });
    await prisma.service.delete({ where: { id: service.id } });
    // The download endpoint writes an AuditLog row (correctly, per
    // BUSINESS_RULES.md rule 8) — it must go before its actor user rows
    // or the FK constraint rejects the user deletes.
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });
});
