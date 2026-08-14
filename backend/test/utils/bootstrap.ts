import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { configureApp } from '../../src/configure-app';

// Boots the REAL AppModule — real Prisma against the real Postgres this
// jest-e2e run is pointed at, real Redis, every real guard
// (CsrfHeaderGuard -> ClerkAuthGuard -> RolesGuard -> MfaEnrolledGuard ->
// ThrottlerGuard), real ValidationPipe, real controllers/services. Nothing
// here is mocked except the one unavoidable external-network boundary:
// @clerk/backend's verifyToken/createClerkClient (see test/utils/clerk.ts)
// — everything on OUR side of that boundary is exercised for real, which
// is the whole point: a unit test's mocked Prisma always returns exactly
// what the test told it to, so it can never catch a controller that
// forgot a `where: { clientId }` filter. This can.
export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  // The exact same setup main.ts's bootstrap() runs in production —
  // critically including the global ValidationPipe. This used to be
  // reimplemented ad hoc here (just setGlobalPrefix), which meant every
  // e2e test ran with NO request validation active at all and could not
  // have caught a real DTO/whitelist regression. See configure-app.ts.
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}
