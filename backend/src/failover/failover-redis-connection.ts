import IORedis, { type RedisOptions } from 'ioredis';
import { FailoverService } from './failover.service';

// Builds a Proxy that behaves like a single ioredis connection but
// forwards every command to whichever of two real, always-connected
// connections (primary = REDIS_URL, local = LOCAL_REDIS_URL)
// FailoverService currently reports as active. This is what makes
// Redis failover transparent to every consumer — RedisService,
// BullMQ's Queue/Worker connections (queue.module.ts,
// translation.worker.ts, audit-log-archive.worker.ts) — without any of
// them needing to explicitly close/reopen a connection on a mode
// change: the *next* command after a failover simply routes to the
// other already-open connection. A BullMQ blocking call already in
// flight on the old connection at the moment of failover just errors
// out (BullMQ's own retry/backoff already handles that), it doesn't
// hang forever.
export function createFailoverRedisConnection(
  failover: FailoverService,
  options: RedisOptions = {},
): IORedis {
  const primary = new IORedis(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
    options,
  );
  const local = new IORedis(
    process.env.LOCAL_REDIS_URL ?? 'redis://localhost:6379',
    options,
  );

  return new Proxy(
    {},
    {
      get(_target, prop, _receiver) {
        const active = failover.getRedisMode() === 'local' ? local : primary;
        const value = Reflect.get(active, prop, active);
        return typeof value === 'function' ? value.bind(active) : value;
      },
      // Without this, `proxy instanceof IORedis` is false (the Proxy's
      // target is a bare `{}`) — some consumers (e.g.
      // @nest-lab/throttler-storage-redis's ThrottlerStorageRedisService)
      // branch on exactly that check to decide "is this an existing
      // client, or connection options I should construct a new client
      // from" and, seeing false, silently build their own broken
      // fallback client instead of using the one actually passed in.
      // Both `primary`/`local` are real IORedis instances, so their
      // shared prototype is the correct, stable answer regardless of
      // which is currently active.
      getPrototypeOf() {
        return IORedis.prototype;
      },
    },
  ) as unknown as IORedis;
}
