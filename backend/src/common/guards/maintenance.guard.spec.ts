import { ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { MaintenanceGuard, MAINTENANCE_FLAG_KEY } from './maintenance.guard';
import type { RedisService } from '../../redis/redis.service';

function contextFor(method: string) {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

describe('MaintenanceGuard', () => {
  it('lets every request through when the flag is not set', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null) } as unknown as RedisService;
    const guard = new MaintenanceGuard(redis);
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      await expect(guard.canActivate(contextFor(method).context)).resolves.toBe(true);
    }
  });

  it('rejects mutating requests with 503 + Retry-After while the flag is set, but never reads', async () => {
    const redis = { get: jest.fn().mockResolvedValue('1') } as unknown as RedisService;
    const guard = new MaintenanceGuard(redis);

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { context, setHeader } = contextFor(method);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '120');
    }
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      await expect(guard.canActivate(contextFor(method).context)).resolves.toBe(true);
    }
    expect(redis.get).toHaveBeenCalledWith(MAINTENANCE_FLAG_KEY);
  });

  it('never touches Redis for a safe method — it must stay cheap ahead of the auth guard', async () => {
    const redis = { get: jest.fn() } as unknown as RedisService;
    await new MaintenanceGuard(redis).canActivate(contextFor('GET').context);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('fails OPEN when Redis is unreachable — a Redis outage must not become a write outage', async () => {
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    } as unknown as RedisService;
    await expect(
      new MaintenanceGuard(redis).canActivate(contextFor('POST').context),
    ).resolves.toBe(true);
  });
});
