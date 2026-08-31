import { Logger } from '@nestjs/common';
import IORedis, { type RedisOptions } from 'ioredis';
import { FailoverService } from './failover.service';

const logger = new Logger('FailoverRedisConnection');

// Without an 'error' listener, ioredis prints "[ioredis] Unhandled error
// event: ..." straight to the real console on every connection failure
// (its own safety net around Node's default EventEmitter behavior,
// which would otherwise crash the process on an unheard 'error' event)
// — bypassing BetterstackLogger entirely and violating this codebase's
// "no console, ever" contract (see BetterstackLogger's own doc comment).
// The actual failure handling already happens correctly via the
// promise rejections on individual commands/connect() calls (see
// FailoverService.checkRedis(), and BullMQ's own retry/backoff on a
// failed command) — this listener exists purely to give ioredis
// somewhere to send the event instead of stdout, not to add new logic.
function silenceUnhandledErrorEvent(client: IORedis, role: string): IORedis {
  client.on('error', (err: Error) => {
    logger.debug(`${role} connection error (handled elsewhere): ${err.message}`);
  });
  return client;
}

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
  const primary = silenceUnhandledErrorEvent(
    new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', options),
    'primary',
  );
  const local = silenceUnhandledErrorEvent(
    new IORedis(process.env.LOCAL_REDIS_URL ?? 'redis://localhost:6379', options),
    'local',
  );

  return new Proxy(
    {},
    {
      get(_target, prop, _receiver) {
        const active = failover.getRedisMode() === 'local' ? local : primary;
        // BullMQ registers its Lua-script commands once, lazily, via
        // `client.defineCommand(name, {...})` on whichever concrete
        // client was active at that moment (see bullmq's
        // RedisConnection.loadCommands, which guards on
        // `!this._client[commandName]` — through this Proxy that guard
        // only ever sees whichever client is currently active). Without
        // this special case, a later failover to the other connection
        // would leave it missing every custom command BullMQ needs,
        // producing "client[name] is not a function" instead of a
        // normal, backoff-eligible connection error — this bit a real
        // production incident (Upstash quota exhaustion triggering a
        // fast, unthrottled TypeError retry loop that OOM-crashed the
        // process). Defining the command on both connections up front
        // means either one is ready to serve it regardless of which is
        // active when BullMQ's lazy registration runs.
        if (prop === 'defineCommand') {
          return (name: string, definition: unknown) => {
            (primary.defineCommand as (n: string, d: unknown) => void)(name, definition);
            (local.defineCommand as (n: string, d: unknown) => void)(name, definition);
          };
        }
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
