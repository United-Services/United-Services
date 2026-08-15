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
