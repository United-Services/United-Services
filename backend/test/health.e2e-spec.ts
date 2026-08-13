import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

// Real integration test: boots the actual AppModule (all real providers —
// Prisma, Redis, S3, Clerk guard, etc. — no mocks) against a real Postgres
// (see .github/workflows/ci.yml's postgres service container) and exercises
// GET /api/v1/health end-to-end, which itself round-trips a raw SQL query.
// This is the one thing a pure unit test can never catch: that the whole
// dependency graph actually wires up and the app can talk to a live DB.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports ok after a real DB round-trip', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(typeof res.body.timestamp).toBe('string');
      });
  });

  it('a protected route without a session token is rejected, not silently allowed', () => {
    return request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
  });
});
