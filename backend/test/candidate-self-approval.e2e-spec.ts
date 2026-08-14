import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap';
import { createUser } from './utils/seed';
import { bearerFor } from './utils/clerk-mock';
import { Role, ApplicationStatus } from '../src/generated/prisma';
import type { PrismaService } from '../src/prisma/prisma.service';

jest.mock('@clerk/backend', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock() factories are hoisted above imports, so this can't be an imported binding
  require('./utils/clerk-mock').mockClerkBackend(),
);

// docs/BUSINESS_RULES.md rule 5: "Candidate applications are always
// reviewed by a human Admin before approval or denial. There is no
// auto-approval path." The only endpoint a candidate can reach that
// touches their own application (POST /me/candidate-documents) has a DTO
// with no `status` field — this proves that's actually enforced by the
// real ValidationPipe over real HTTP, not just true by inspection of the
// DTO's field list (which is exactly the kind of claim a controller unit
// test — where `dto` is always constructed pre-validated by the test
// itself — cannot verify, and which the CI-wide bootstrap bug this branch
// also fixes was silently not verifying either, see mass-assignment
// .e2e-spec.ts).
describe('Candidate self-approval is impossible (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a candidate-documents request that smuggles a status field, before it ever reaches the database', async () => {
    const candidate = await createUser(prisma, { role: Role.candidate });
    const application = await prisma.candidateApplication.create({
      data: {
        candidateUserId: candidate.id,
        dateOfBirth: new Date('1995-01-01'),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/me/candidate-documents')
      .set(bearerFor(candidate.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        idPhotoS3Key: `pending/candidates/${candidate.id}/candidate-id-photo-1.jpg`,
        status: 'approved',
      });

    expect(res.status).toBe(400);

    const unchanged = await prisma.candidateApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(unchanged.status).toBe(ApplicationStatus.pending);

    await prisma.candidateApplication.delete({ where: { id: application.id } });
    await prisma.user.delete({ where: { id: candidate.id } });
  });

  it('rejects a candidate from reaching the admin-only decide endpoint at all', async () => {
    const candidate = await createUser(prisma, { role: Role.candidate });
    const application = await prisma.candidateApplication.create({
      data: {
        candidateUserId: candidate.id,
        dateOfBirth: new Date('1995-01-01'),
      },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/candidate-applications/${application.id}/decide`)
      .set(bearerFor(candidate.clerkId))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ approve: true });

    expect(res.status).toBe(403);

    const unchanged = await prisma.candidateApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(unchanged.status).toBe(ApplicationStatus.pending);

    await prisma.candidateApplication.delete({ where: { id: application.id } });
    await prisma.user.delete({ where: { id: candidate.id } });
  });
});
