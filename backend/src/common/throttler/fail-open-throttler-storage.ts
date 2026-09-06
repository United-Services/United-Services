import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

// @nestjs/throttler's root entry doesn't re-export the record interface;
// derive it from the storage contract rather than deep-importing a
// dist path that could move between versions.
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

// Wraps the Redis-backed throttler storage so a storage failure can
// never become a 500 on every route.
//
// ThrottlerGuard is a global APP_GUARD. When its storage's increment()
// rejects — Redis unreachable, Upstash quota exhausted, a TLS blip —
// Nest's guard path propagates that rejection straight into
// AllExceptionsFilter: a 500 on EVERY request, @Public() routes
// included, and an on-call page per distinct route. FailoverService
// needs three consecutive failed 5s checks (~15s) before it flips Redis
// to the local standby, so that is the minimum length of the outage;
// with the standby also down it is total.
//
// Rate limiting is a protection mechanism, not a correctness one.
// Losing it briefly is strictly better than losing the API — and
// nginx's limit_req zone (nginx.conf) remains in front as a second
// layer for that window. So: fail OPEN, log at error so the gap is
// visible in Betterstack, and report zero usage so the guard allows
// the request.
//
// The same pattern ServicesController.safeCacheGet already applies to
// its own Redis reads — it just had never been applied to the guard.
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(FailOpenThrottlerStorage.name);

  constructor(private readonly inner: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.inner.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    } catch (err) {
      this.logger.error(
        `Throttler storage unavailable — failing OPEN and allowing the request: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
