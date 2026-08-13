import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TrackEventDto } from './dto/track-event.dto';
import { Role } from '../generated/prisma';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  // Fire-and-forget from the frontend. Tighter rate limit than the global
  // default since this is public and unauthenticated (Phase 4/10).
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('track')
  async track(@Body() dto: TrackEventDto) {
    await this.prisma.analyticsEvent.create({ data: { eventType: dto.eventType, metadata: dto.metadata as any } });
    return { received: true };
  }

  @Roles(Role.admin)
  @Get('overview')
  async overview() {
    const [clientCount, companies, fileRequested, fileApproved, rfqCount, appointmentCount, candidatesByStatus, ctaClicks] =
      await Promise.all([
        this.prisma.user.count({ where: { role: Role.client } }),
        this.prisma.user.findMany({ where: { role: Role.client, companyName: { not: null } }, distinct: ['companyName'], select: { companyName: true } }),
        this.prisma.fileAccessRequest.count(),
        this.prisma.fileAccessRequest.count({ where: { status: 'approved' } }),
        this.prisma.serviceRequest.count(),
        this.prisma.appointment.count(),
        this.prisma.candidateApplication.groupBy({ by: ['status'], _count: true }),
        this.prisma.analyticsEvent.groupBy({
          by: ['eventType'],
          where: { eventType: { startsWith: 'cta_click' } },
          _count: true,
        }),
      ]);

    const serviceViews = await this.prisma.analyticsEvent.groupBy({
      by: ['eventType'],
      where: { eventType: { startsWith: 'service_page_view' } },
      _count: true,
    });

    return {
      clientCount,
      companyCount: companies.length,
      fileAccessRequested: fileRequested,
      fileAccessApproved: fileApproved,
      rfqCount,
      appointmentCount,
      candidatesByStatus: candidatesByStatus.map((c) => ({ status: c.status, count: c._count })),
      ctaClicks: ctaClicks.map((c) => ({ eventType: c.eventType, count: c._count })),
      serviceViews: serviceViews.map((c) => ({ eventType: c.eventType, count: c._count })),
    };
  }
}
