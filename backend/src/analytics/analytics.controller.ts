import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { extractIp } from '../common/utils/extract-ip';
import { TrackEventDto } from './dto/track-event.dto';
import { Role, FileAccessStatus, type Prisma } from '../generated/prisma';
import {
  AnalyticsEventType,
  AnalyticsEventTypePrefix,
} from './analytics-event-type.enums';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

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

  @Roles(Role.admin)
  @Get('overview')
  async overview() {
    const [
      clientCount,
      companies,
      fileRequested,
      fileApproved,
      rfqCount,
      appointmentCount,
      candidatesByStatus,
      ctaClicks,
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
    };
  }

  // Powers the admin dashboard world map — requests grouped by the
  // resolved visitor country, most recent 90 days of `page_view` events.
  @Roles(Role.admin)
  @Get('geo-overview')
  async geoOverview() {
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
    return {
      since: since.toISOString(),
      countries: grouped
        .filter((g) => g.country)
        .map((g) => ({ country: g.country as string, count: g._count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
