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

async function bootstrap() {
  const logger = new BetterstackLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger,
  });

  // Belt-and-braces for anything that escapes both a request's try/catch
  // and the global AllExceptionsFilter (e.g. a rejected promise not tied
  // to any HTTP request, like a fire-and-forget background task). Logged
  // rather than silently dropped, but never crashes the process on its
  // own — losing one background operation shouldn't take the whole API
  // down with it.
  process.on('unhandledRejection', (reason) => {
    logger.error(
      'Unhandled promise rejection',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err.stack);
  });

  configureApp(app);

  await app.listen(process.env.PORT ?? 3002);
}
bootstrap();
