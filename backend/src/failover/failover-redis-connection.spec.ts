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

  // Regression: another real bug found live — a bare `new IORedis(...)`
  // with no 'error' listener makes Node's EventEmitter throw synchronously
  // on an unhandled 'error' event (ioredis's own internal safety net
  // catches this and prints "[ioredis] Unhandled error event: ..."
  // straight to the real console instead of crashing — but that still
  // bypasses BetterstackLogger entirely, violating the "no console, ever"
  // contract). Both underlying connections need their own listener
  // attached at construction time.
  it('attaches an error listener to both underlying connections, so emitting error never throws/crashes', () => {
    const primaryActive = createFailoverRedisConnection(
      makeFailover('primary'),
      NO_CONNECT_OPTIONS,
    );
    const localActive = createFailoverRedisConnection(
      makeFailover('local'),
      NO_CONNECT_OPTIONS,
    );

    expect(() => primaryActive.emit('error', new Error('boom'))).not.toThrow();
    expect(() => localActive.emit('error', new Error('boom'))).not.toThrow();
  });

  // Regression: a real production incident (Upstash Redis monthly request
  // quota exhaustion) exposed that BullMQ's lazy, once-only
  // `client.defineCommand(name, {...})` call (guarded on
  // `!this._client[commandName]`, see RedisConnection.loadCommands in
  // bullmq) only ever reached whichever concrete client was active *at
  // that one moment* — a later failover left the other connection
  // missing the command entirely, producing "client[name] is not a
  // function" (a TypeError, which BullMQ doesn't treat as a
  // backoff-eligible connection error) in an unthrottled retry loop that
  // OOM-crashed the process. defineCommand must reach both connections
  // up front regardless of which is active when it's called.
  it('defines a custom command on both underlying connections, not just whichever is active when defineCommand is called', () => {
    const failoverPrimary = makeFailover('primary');
    const connection = createFailoverRedisConnection(failoverPrimary, NO_CONNECT_OPTIONS);

    connection.defineCommand('echoTest', { numberOfKeys: 0, lua: "return 'ok'" });

    // Switching the reported mode to 'local' after defineCommand was
    // called (while mode was 'primary') simulates the exact failover
    // ordering that broke in production — the command must still be
    // present on whichever connection becomes active afterward.
    (failoverPrimary.getRedisMode as jest.Mock).mockReturnValue('local');
    expect(typeof (connection as unknown as Record<string, unknown>).echoTest).toBe('function');
  });
});
