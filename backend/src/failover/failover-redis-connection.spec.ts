import IORedis from 'ioredis';
import { createFailoverRedisConnection } from './failover-redis-connection';
import type { FailoverService } from './failover.service';

function makeFailover(mode: 'primary' | 'local' = 'primary') {
  return { getRedisMode: jest.fn().mockReturnValue(mode) } as unknown as FailoverService;
}

// lazyConnect + no retry: these tests only need to inspect the returned
// Proxy's shape/prototype, never a live command — real IORedis (not
// mocked here, deliberately, since the bug this guards against is
// specifically about the *real* ioredis prototype chain) would otherwise
// spend the whole test retrying a real TCP connect against
// redis://localhost:6379 with nothing listening.
const NO_CONNECT_OPTIONS = { lazyConnect: true, retryStrategy: () => null };

describe('createFailoverRedisConnection', () => {
  // Regression test: a real bug found live — @nest-lab/throttler-storage-
  // redis's constructor branches on `client instanceof Redis` to decide
  // whether to use the client it was given or construct its own new one
  // from what it assumes are connection options. Without a
  // `getPrototypeOf` trap, the Proxy this function returns fails that
  // check (its target is a bare `{}`), causing that library to silently
  // build a broken fallback client instead — which is exactly what broke
  // every request in production before this was added.
  it('passes an instanceof IORedis check, so consumers that branch on it use this connection rather than constructing their own', () => {
    const connection = createFailoverRedisConnection(makeFailover(), NO_CONNECT_OPTIONS);
    expect(connection instanceof IORedis).toBe(true);
  });

  it('still forwards ordinary property/method access after the getPrototypeOf trap is added', () => {
    const connection = createFailoverRedisConnection(makeFailover(), NO_CONNECT_OPTIONS);
    expect(typeof connection.get).toBe('function');
    expect(typeof connection.status).toBe('string');
  });
});
