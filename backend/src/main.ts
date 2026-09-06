// Must be the first import: PrismaService reads process.env.DATABASE_URL at
// module-load time (to build its @prisma/adapter-pg adapter), which happens
// as soon as AppModule is imported below — before Nest's ConfigModule has
// had a chance to run. Loading dotenv here first guarantees env vars are
// already in process.env by then.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BetterstackLogger } from './logging/betterstack.logger';
import { configureApp } from './configure-app';

// Outside production (docker-entrypoint.sh is the only place that sets
// NODE_ENV=production), point REDIS_URL itself at the local dev Redis
// instead of the real Upstash endpoint — every consumer that reads
// REDIS_URL (FailoverService's own health-check ping, BullMQ, rate
// limiting, MFA session state, etc.) reads it lazily at call time, so
// this one override keeps the app off Upstash entirely during
// day-to-day local development instead of chipping away at the
// account's monthly request quota on every dev boot. Must happen before
// AppModule is imported below, since dotenv itself has to run first
// (see the comment above) and this has to run before any of that module
// graph starts executing.
if (process.env.NODE_ENV !== 'production') {
  process.env.REDIS_URL = process.env.LOCAL_REDIS_URL ?? 'redis://localhost:6379';
}

// How long a graceful shutdown may take before the process exits
// anyway. Must be shorter than the orchestrator's own kill grace
// (docker's default stop_grace_period is 10s; set it above this if the
// drain genuinely needs longer) — a shutdown hook that hangs is worse
// than none, because it turns a fast redeploy into a stuck one.
const SHUTDOWN_HARD_TIMEOUT_MS = 8_000;

// nginx.conf's `upstream backend { keepalive 64; }` pools idle upstream
// connections for reuse (nginx default idle timeout 60s). Node's own
// default keepAliveTimeout is 5s: it closed an idle socket that nginx
// still believed usable, nginx dispatched the next request onto it as
// the FIN arrived, and — unable to safely retry a non-idempotent
// request — returned a 502. A low-rate, load-correlated 502 stream that
// never reproduces in staging. Both must exceed nginx's idle window,
// and headersTimeout must exceed keepAliveTimeout (Node's own rule).
const KEEP_ALIVE_TIMEOUT_MS = 65_000;
const HEADERS_TIMEOUT_MS = 66_000;

async function bootstrap() {
  const logger = new BetterstackLogger();

  // Registered BEFORE NestFactory.create, so a failure during module
  // init (a bad env value, an unreachable dependency a provider awaits
  // at boot) is logged and surfaced rather than dying as a bare
  // unhandled rejection with no logger attached.
  //
  // unhandledRejection: log and continue — a rejected promise not tied
  // to any request (a fire-and-forget background task) shouldn't take
  // the whole API down.
  process.on('unhandledRejection', (reason) => {
    logger.error(
      'Unhandled promise rejection',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });
  // uncaughtException: log, flush, EXIT. This used to log and carry on.
  // Node's own documentation is explicit that after an uncaught
  // exception the process is in an undefined state — a synchronous
  // throw escaping a timer or emitter callback mid-way through mutating
  // shared state (a BullMQ lock, a half-built response, an open
  // transaction) leaves invariants broken, and continuing to serve
  // traffic from that state produces silently wrong responses. Exiting
  // non-zero lets the orchestrator (docker `restart: unless-stopped`)
  // replace it with a clean process in seconds.
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — exiting for a clean restart', err.stack);
    void logger.flush().finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 2_000).unref();
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger,
  });

  // Without this, SIGTERM killed the process outright: in-flight
  // requests were severed mid-response (clients saw a reset, not a
  // retryable 503), BullMQ workers died without worker.close() so any
  // job being processed sat in the active set until its lock expired,
  // and the pg pools were never drained. Every one of the
  // onModuleDestroy hooks in this codebase (FailoverService, the five
  // BullMQ workers) was dead code in production. This wires SIGTERM/
  // SIGINT → app.close(), which runs them all.
  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      // Backstop for the hooks themselves: if closing hangs (a worker
      // waiting on a job that never finishes, a pool that won't drain),
      // exit anyway so the deploy completes. unref() so this timer
      // never keeps a clean shutdown alive.
      setTimeout(() => {
        logger.error(
          `Graceful shutdown exceeded ${SHUTDOWN_HARD_TIMEOUT_MS}ms after ${signal} — exiting`,
        );
        void logger.flush().finally(() => process.exit(1));
      }, SHUTDOWN_HARD_TIMEOUT_MS).unref();
    });
  }

  configureApp(app);

  const server = app.getHttpServer() as import('node:http').Server;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;

  await app.listen(process.env.PORT ?? 3002);
}

bootstrap().catch((err: unknown) => {
  // Boot failed before the app could serve anything. The console is the
  // only channel guaranteed to exist here — the Betterstack logger may
  // itself be what's misconfigured — and a non-zero exit is what tells
  // the orchestrator this deploy did not come up.
  console.error('Fatal: application failed to start', err);
  process.exit(1);
});
