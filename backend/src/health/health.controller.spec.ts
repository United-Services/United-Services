import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { FailoverService } from '../failover/failover.service';

describe('HealthController', () => {
  function makeController(overrides: {
    postgres?: string;
    redis?: string;
    queryRaw?: jest.Mock;
  } = {}) {
    const prisma = {
      $queryRaw: overrides.queryRaw ?? jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const failover = {
      getPostgresMode: jest.fn().mockReturnValue(overrides.postgres ?? 'primary'),
      getRedisMode: jest.fn().mockReturnValue(overrides.redis ?? 'primary'),
    } as unknown as FailoverService;
    return { controller: new HealthController(prisma, failover), prisma, failover };
  }

  it('returns ok with both modes reported as primary in the normal case', async () => {
    const { controller } = makeController();
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.failover).toEqual({ postgres: 'primary', redis: 'primary' });
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('still returns ok while Postgres is in local-fallback mode — the query itself goes through the failover proxy', async () => {
    const { controller } = makeController({ postgres: 'local' });
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.failover.postgres).toBe('local');
  });

  it('reports Postgres and Redis modes independently', async () => {
    const { controller } = makeController({ postgres: 'local', redis: 'primary' });
    const result = await controller.check();
    expect(result.failover).toEqual({ postgres: 'local', redis: 'primary' });
  });

  it('propagates a query failure instead of swallowing it (both primary and local are unreachable)', async () => {
    const { controller } = makeController({
      queryRaw: jest.fn().mockRejectedValue(new Error('both down')),
    });
    await expect(controller.check()).rejects.toThrow('both down');
  });
});
