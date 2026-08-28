import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Replaces the old CORS_ORIGINS env var as the source of truth for which
// origins app.enableCors() allows (see configure-app.ts) — adding a new
// frontend/staging domain used to mean editing SSM and redeploying; now
// it's a row in the AllowedOrigin table, added directly in the database
// (deliberately no admin-dashboard UI or API for this — CORS is
// security-sensitive enough that it stays a DB-only, no-web-surface
// change, unlike everything else admins manage through the dashboard).
//
// Deliberately NOT the Redis cache-aside pattern used by
// services.controller.ts/positions.controller.ts (redis.get/set per
// request, DB on a cache miss). Those cache the response of an
// occasional public GET endpoint — a Redis round-trip per request is
// fine there. This is consulted on every single incoming request across
// the entire app (app.enableCors()'s origin callback), so it needs to be
// a synchronous, in-memory array check on the hot path, not I/O of any
// kind. Freshness comes from a lazy, self-throttling background refresh
// instead: the in-memory set is used as-is on every check, and refreshed
// from the DB at most once per REFRESH_INTERVAL_MS (a concurrent burst
// of requests during a stale window all await the same in-flight
// refresh, never fire N parallel ones) — so a row added directly in the
// database takes effect within REFRESH_INTERVAL_MS, no redeploy or
// restart needed.
@Injectable()
export class AllowedOriginsService implements OnModuleInit {
  private readonly logger = new Logger(AllowedOriginsService.name);
  private static readonly REFRESH_INTERVAL_MS = 30_000;

  private origins = new Set<string>();
  private lastRefreshedAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.refresh();
    } catch (err) {
      // Never block app startup on this — see refresh()'s own comment on
      // why a DB read failing here still leaves CORS in a safe state
      // (empty origins now, but a later request-time refresh attempt can
      // still recover once the DB is reachable again).
      this.logger.error(`Initial allowed-origins load failed: ${err}`);
    }
  }

  // Bootstraps AllowedOrigin from the legacy CORS_ORIGINS env var exactly
  // once, only if the table is genuinely empty — a fresh deploy of this
  // feature must not suddenly block every origin CORS_ORIGINS used to
  // allow. Once any row exists (including a deliberately-emptied table,
  // which is a valid choice), the DB alone is the source of truth and
  // this never runs again.
  private async seedFromEnvIfEmpty(): Promise<void> {
    const count = await this.prisma.allowedOrigin.count();
    if (count > 0) return;
    const legacy = (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (legacy.length === 0) return;
    await this.prisma.allowedOrigin.createMany({
      data: legacy.map((origin) => ({ origin })),
      skipDuplicates: true,
    });
    this.logger.log(
      `Seeded ${legacy.length} allowed origin(s) from CORS_ORIGINS (legacy env var, table was empty).`,
    );
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      await this.seedFromEnvIfEmpty();
      const rows = await this.prisma.allowedOrigin.findMany({
        select: { origin: true },
      });
      this.origins = new Set(rows.map((r) => r.origin));
      this.lastRefreshedAt = Date.now();
    })();
    try {
      await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  private async ensureFresh(): Promise<void> {
    if (
      Date.now() - this.lastRefreshedAt <
      AllowedOriginsService.REFRESH_INTERVAL_MS
    ) {
      return;
    }
    try {
      await this.refresh();
    } catch (err) {
      // A DB blip here must degrade to "serve the last-known-good set a
      // little longer," never a 500 on every cross-origin request —
      // lastRefreshedAt intentionally isn't bumped on failure, so the
      // very next request retries rather than waiting out the full
      // interval again.
      this.logger.warn(`Allowed-origins refresh failed, using stale set: ${err}`);
    }
  }

  // Called on the hot path (CORS origin check) — see the class comment
  // for why this stays a synchronous set lookup after one lazy await,
  // rather than reading Redis or the DB directly here.
  async isAllowed(origin: string): Promise<boolean> {
    await this.ensureFresh();
    return this.origins.has(origin);
  }
}
