import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import { PrismaPg } from '@prisma/adapter-pg';
import IORedis from 'ioredis';
import { PrismaClient } from '../generated/prisma';

export type FailoverMode = 'primary' | 'local';

// How many consecutive failed/succeeded health checks flip the mode.
// Deliberately requires several in a row in both directions — a single
// blip (one dropped connection, one slow response) must never trigger a
// failover, and recovery is held to the same bar so the app doesn't
// flap back and forth if primary is only intermittently reachable.
const FAILURE_THRESHOLD = 3;
const RECOVERY_THRESHOLD = 3;
const CHECK_INTERVAL_MS = 5_000;

// A thrown value isn't guaranteed to be an Error (a library can reject
// with a plain string, or something odd) — this must never itself throw
// while building a log message about a connection failure.
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Health-checks Supabase Postgres and Upstash Redis independently and
// holds the current failover mode for each. Deliberately owns its own
// minimal, dedicated connections for pinging rather than depending on
// PrismaService/RedisService — those services depend on *this* service
// (to know which underlying client to route to), so the dependency can
// only go one way. Emits plain Node EventEmitter events; PrismaService,
// RedisService, and queue.module.ts's BullMQ connections all subscribe
// to react to a mode change. See docs/DISASTER_RECOVERY.md for the full
// design and its accepted tradeoffs.
@Injectable()
export class FailoverService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FailoverService.name);

  private postgresMode: FailoverMode = 'primary';
  private redisMode: FailoverMode = 'primary';
  private postgresFailureCount = 0;
  private postgresSuccessCount = 0;
  private redisFailureCount = 0;
  private redisSuccessCount = 0;

  private pingClient: PrismaClient | null = null;
  private postgresTimer: NodeJS.Timeout | null = null;
  private redisTimer: NodeJS.Timeout | null = null;
  // Reentrancy guards — a check that takes longer than CHECK_INTERVAL_MS
  // (a slow/hanging network call, not just a fast failure) would
  // otherwise overlap with the next tick and double-count toward the
  // failure/success thresholds from two concurrent runs racing the same
  // counters.
  private postgresCheckInFlight = false;
  private redisCheckInFlight = false;

  getPostgresMode(): FailoverMode {
    return this.postgresMode;
  }

  getRedisMode(): FailoverMode {
    return this.redisMode;
  }

  onModuleInit() {
    // max: 1 — this connection only ever runs `SELECT 1`, never
    // application queries, so it doesn't need a real pool.
    this.pingClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
    });
    this.postgresTimer = setInterval(
      () => void this.checkPostgres(),
      CHECK_INTERVAL_MS,
    );
    this.redisTimer = setInterval(() => void this.checkRedis(), CHECK_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.postgresTimer) clearInterval(this.postgresTimer);
    if (this.redisTimer) clearInterval(this.redisTimer);
    await this.pingClient?.$disconnect();
  }

  private async checkPostgres() {
    if (this.postgresCheckInFlight) return;
    this.postgresCheckInFlight = true;
    try {
      await this.pingClient!.$queryRaw`SELECT 1`;
      this.postgresFailureCount = 0;
      if (this.postgresMode === 'local') {
        this.postgresSuccessCount++;
        if (this.postgresSuccessCount >= RECOVERY_THRESHOLD) {
          this.postgresMode = 'primary';
          this.postgresSuccessCount = 0;
          this.logger.warn(
            'Postgres primary reachable again — failing back from local standby',
          );
          this.emit('postgres:recovered');
        }
      }
    } catch (err) {
      this.postgresSuccessCount = 0;
      if (this.postgresMode === 'primary') {
        this.postgresFailureCount++;
        if (this.postgresFailureCount >= FAILURE_THRESHOLD) {
          this.postgresMode = 'local';
          this.postgresFailureCount = 0;
          this.logger.error(
            `Postgres primary unreachable after ${FAILURE_THRESHOLD} checks — failing over to local standby: ${errorMessage(err)}`,
          );
          this.emit('postgres:failover');
        }
      }
    } finally {
      this.postgresCheckInFlight = false;
    }
  }

  private async checkRedis() {
    if (this.redisCheckInFlight) return;
    this.redisCheckInFlight = true;
    // A fresh, short-lived connection per check rather than a persistent
    // ping connection — simpler and avoids reasoning about reconnecting
    // a connection that's already in a broken state after a failure.
    const client = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    // Without this, ioredis prints "[ioredis] Unhandled error event: ..."
    // straight to the real console on every failed check — bypassing
    // BetterstackLogger entirely. The catch block below already does the
    // real handling (failure counting, mode flip, logging); this only
    // gives ioredis's own EventEmitter somewhere to send the event.
    client.on('error', () => {});
    try {
      await client.connect();
      await client.ping();
      this.redisFailureCount = 0;
      if (this.redisMode === 'local') {
        this.redisSuccessCount++;
        if (this.redisSuccessCount >= RECOVERY_THRESHOLD) {
          this.redisMode = 'primary';
          this.redisSuccessCount = 0;
          this.logger.warn(
            'Redis primary reachable again — failing back from local standby',
          );
          this.emit('redis:recovered');
        }
      }
    } catch (err) {
      this.redisSuccessCount = 0;
      if (this.redisMode === 'primary') {
        this.redisFailureCount++;
        if (this.redisFailureCount >= FAILURE_THRESHOLD) {
          this.redisMode = 'local';
          this.redisFailureCount = 0;
          this.logger.error(
            `Redis primary unreachable after ${FAILURE_THRESHOLD} checks — failing over to local standby: ${errorMessage(err)}`,
          );
          this.emit('redis:failover');
        }
      }
    } finally {
      client.disconnect();
      this.redisCheckInFlight = false;
    }
  }
}
