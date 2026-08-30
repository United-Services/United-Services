import { Body, Controller, Get, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GeoService } from '../geo/geo.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../common/constants/admin-roles';
import { extractIp } from '../common/utils/extract-ip';
import { TrackEventDto } from './dto/track-event.dto';
import { Role, FileAccessStatus, type Prisma } from '../generated/prisma';
import {
  AnalyticsEventType,
  AnalyticsEventTypePrefix,
} from './analytics-event-type.enums';

// Both admin-overview endpoints below run 10-11 aggregate/count/groupBy
// queries apiece and are hit on every admin dashboard load — this data
// doesn't need to be real-time, so a short cache turns "every visit
// re-runs 11 queries" into "at most once every 30s across all admins."
const OVERVIEW_CACHE_TTL_SECONDS = 30;
const OVERVIEW_CACHE_KEY = 'analytics:overview';
const GEO_OVERVIEW_CACHE_KEY = 'analytics:geo-overview';

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly geo: GeoService,
  ) {}

  // A Redis outage must degrade the admin dashboard to "slightly
  // slower" (every query re-runs), never "500." Previously an unguarded
  // redis.get/set meant a Redis blip took the whole overview/geo-overview
  // endpoint down even though Postgres was fine.
  private async safeCacheGet(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${err}`);
      return null;
    }
  }

  private async safeCacheSet(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${err}`);
    }
  }

  // Fire-and-forget from the frontend. Tighter rate limit than the global
  // default since this is public and unauthenticated (Phase 4/10).
  // `country` is always derived server-side from the request IP — a
  // client could otherwise report any country it likes, which would
  // corrupt the admin world map (docs/BUSINESS_RULES.md: never trust
  // client-supplied data for anything that feeds an admin-facing report).
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('track')
  async track(@Body() dto: TrackEventDto, @Req() req: Request) {
    const country = this.geo.countryForIp(extractIp(req));
    await this.prisma.analyticsEvent.create({
      data: {
        eventType: dto.eventType,
        metadata: dto.metadata as unknown as Prisma.InputJsonValue,
        country,
      },
    });
    return { received: true };
  }

  @Roles(...ADMIN_ROLES)
  @Get('overview')
  async overview() {
    const cached = await this.safeCacheGet(OVERVIEW_CACHE_KEY);
    if (cached)
      return JSON.parse(cached) as Awaited<
        ReturnType<AnalyticsController['computeOverview']>
      >;

    const result = await this.computeOverview();
    await this.safeCacheSet(
      OVERVIEW_CACHE_KEY,
      JSON.stringify(result),
      OVERVIEW_CACHE_TTL_SECONDS,
    );
    return result;
  }

  private async computeOverview() {
    const [
      clientCount,
      companies,
      fileRequested,
      fileApproved,
      rfqCount,
      appointmentCount,
      candidatesByStatus,
      ctaClicks,
      ticketsByStatus,
      ticketsByType,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.client } }),
      this.prisma.user.findMany({
        where: { role: Role.client, companyName: { not: null } },
        distinct: ['companyName'],
        select: { companyName: true },
      }),
      this.prisma.fileAccessRequest.count(),
      this.prisma.fileAccessRequest.count({
        where: { status: FileAccessStatus.approved },
      }),
      this.prisma.serviceRequest.count(),
      this.prisma.appointment.count(),
      this.prisma.candidateApplication.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        where: { eventType: { startsWith: AnalyticsEventTypePrefix.CtaClick } },
        _count: true,
      }),
      this.prisma.ticket.groupBy({ by: ['status'], _count: true }),
      this.prisma.ticket.groupBy({ by: ['type'], _count: true }),
    ]);

    const serviceViews = await this.prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: {
        eventType: { startsWith: AnalyticsEventTypePrefix.ServicePageView },
      },
      _count: true,
    });

    return {
      clientCount,
      companyCount: companies.length,
      fileAccessRequested: fileRequested,
      fileAccessApproved: fileApproved,
      rfqCount,
      appointmentCount,
      candidatesByStatus: candidatesByStatus.map((c) => ({
        status: c.status,
        count: c._count,
      })),
      ctaClicks: ctaClicks.map((c) => ({
        eventType: c.eventType,
        count: c._count,
      })),
      serviceViews: serviceViews.map((c) => ({
        eventType: c.eventType,
        count: c._count,
      })),
      ticketsByStatus: ticketsByStatus.map((t) => ({
        status: t.status,
        count: t._count,
      })),
      ticketsByType: ticketsByType.map((t) => ({
        type: t.type,
        count: t._count,
      })),
    };
  }

  // Powers the admin dashboard world map — requests grouped by the
  // resolved visitor country, most recent 90 days of `page_view` events.
  @Roles(...ADMIN_ROLES)
  @Get('geo-overview')
  async geoOverview(): Promise<{
    since: string;
    countries: { country: string; count: number }[];
  }> {
    const cached = await this.safeCacheGet(GEO_OVERVIEW_CACHE_KEY);
    if (cached)
      return JSON.parse(cached) as {
        since: string;
        countries: { country: string; count: number }[];
      };

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['country'],
      where: {
        eventType: AnalyticsEventType.PageView,
        country: { not: null },
        occurredAt: { gte: since },
      },
      _count: true,
    });
    const result = {
      since: since.toISOString(),
      countries: grouped
        .filter((g) => g.country)
        .map((g) => ({ country: g.country as string, count: g._count }))
        .sort((a, b) => b.count - a.count),
    };
    await this.safeCacheSet(
      GEO_OVERVIEW_CACHE_KEY,
      JSON.stringify(result),
      OVERVIEW_CACHE_TTL_SECONDS,
    );
    return result;
  }
}
