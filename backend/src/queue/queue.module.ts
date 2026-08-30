import { Global, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FailoverService } from '../failover/failover.service';
import { createFailoverRedisConnection } from '../failover/failover-redis-connection';
import {
  AUDIT_ARCHIVE_DLQ,
  AUDIT_ARCHIVE_DLQ_NAME,
  AUDIT_ARCHIVE_QUEUE,
  AUDIT_ARCHIVE_QUEUE_NAME,
  DB_MIRROR_SYNC_DLQ,
  DB_MIRROR_SYNC_DLQ_NAME,
  DB_MIRROR_SYNC_QUEUE,
  DB_MIRROR_SYNC_QUEUE_NAME,
  FAILOVER_RECONCILE_DLQ,
  FAILOVER_RECONCILE_DLQ_NAME,
  FAILOVER_RECONCILE_QUEUE,
  FAILOVER_RECONCILE_QUEUE_NAME,
  TRANSLATION_DLQ,
  TRANSLATION_DLQ_NAME,
  TRANSLATION_QUEUE,
  TRANSLATION_QUEUE_NAME,
} from './queue.tokens';

// BullMQ needs its own dedicated connection per Queue, not the shared
// RedisService instance every other module injects — a Queue/Worker uses
// blocking Redis commands (BRPOPLPUSH etc.) that would otherwise
// interfere with RedisService's own non-blocking usage (caching,
// throttler storage) on the same connection. `maxRetriesPerRequest: null`
// is BullMQ's own documented requirement for this connection: without it,
// a command that's still retrying when Redis briefly drops can throw
// instead of BullMQ's own retry/backoff logic getting the chance to
// handle it. createFailoverRedisConnection (not a plain `new IORedis`)
// is what makes every one of these queues transparently follow
// FailoverService's Redis mode — see that function's own comment.
function createBullConnection(failover: FailoverService) {
  return createFailoverRedisConnection(failover, { maxRetriesPerRequest: null });
}

// @Global so any module can inject TRANSLATION_QUEUE without adding
// QueueModule to its own `imports` — same convention as RedisModule.
// Deliberately no `imports: [FailoverModule]` here even though every
// factory below injects FailoverService — FailoverModule is itself
// @Global, so its exports are already visible without an explicit
// import edge, and FailoverModule's own providers (DbMirrorSyncWorker
// etc.) inject tokens exported from *this* module — an explicit edge in
// both directions would be a real circular module dependency, not just
// a redundant one.
@Global()
@Module({
  providers: [
    {
      provide: TRANSLATION_QUEUE,
      useFactory: (failover: FailoverService) =>
        new Queue(TRANSLATION_QUEUE_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
    {
      provide: TRANSLATION_DLQ,
      useFactory: (failover: FailoverService) =>
        new Queue(TRANSLATION_DLQ_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
    {
      provide: AUDIT_ARCHIVE_QUEUE,
      useFactory: (failover: FailoverService) =>
        new Queue(AUDIT_ARCHIVE_QUEUE_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
    {
      provide: AUDIT_ARCHIVE_DLQ,
      useFactory: (failover: FailoverService) =>
        new Queue(AUDIT_ARCHIVE_DLQ_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
    {
      provide: DB_MIRROR_SYNC_QUEUE,
      useFactory: (failover: FailoverService) =>
        new Queue(DB_MIRROR_SYNC_QUEUE_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
    {
      provide: DB_MIRROR_SYNC_DLQ,
      useFactory: (failover: FailoverService) =>
        new Queue(DB_MIRROR_SYNC_DLQ_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
    {
      provide: FAILOVER_RECONCILE_QUEUE,
      useFactory: (failover: FailoverService) =>
        new Queue(FAILOVER_RECONCILE_QUEUE_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
    {
      provide: FAILOVER_RECONCILE_DLQ,
      useFactory: (failover: FailoverService) =>
        new Queue(FAILOVER_RECONCILE_DLQ_NAME, {
          connection: createBullConnection(failover),
        }),
      inject: [FailoverService],
    },
  ],
  exports: [
    TRANSLATION_QUEUE,
    TRANSLATION_DLQ,
    AUDIT_ARCHIVE_QUEUE,
    AUDIT_ARCHIVE_DLQ,
    DB_MIRROR_SYNC_QUEUE,
    DB_MIRROR_SYNC_DLQ,
    FAILOVER_RECONCILE_QUEUE,
    FAILOVER_RECONCILE_DLQ,
  ],
})
export class QueueModule {}
