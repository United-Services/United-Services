import { Global, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  TRANSLATION_DLQ,
  TRANSLATION_DLQ_NAME,
  TRANSLATION_QUEUE,
  TRANSLATION_QUEUE_NAME,
} from './queue.tokens';

// BullMQ needs its own dedicated ioredis connection, not the shared
// RedisService instance every other module injects — a Queue/Worker uses
// blocking Redis commands (BRPOPLPUSH etc.) that would otherwise
// interfere with RedisService's own non-blocking usage (caching,
// throttler storage) on the same connection. `maxRetriesPerRequest: null`
// is BullMQ's own documented requirement for this connection: without it,
// a command that's still retrying when Redis briefly drops can throw
// instead of BullMQ's own retry/backoff logic getting the chance to
// handle it.
function createBullConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

// @Global so any module can inject TRANSLATION_QUEUE without adding
// QueueModule to its own `imports` — same convention as RedisModule.
@Global()
@Module({
  providers: [
    {
      provide: TRANSLATION_QUEUE,
      useFactory: () =>
        new Queue(TRANSLATION_QUEUE_NAME, {
          connection: createBullConnection(),
        }),
    },
    {
      provide: TRANSLATION_DLQ,
      useFactory: () =>
        new Queue(TRANSLATION_DLQ_NAME, { connection: createBullConnection() }),
    },
  ],
  exports: [TRANSLATION_QUEUE, TRANSLATION_DLQ],
})
export class QueueModule {}
