import { AnalyticsController } from './analytics.controller';
import type { PrismaService } from '../prisma/prisma.service';

describe('AnalyticsController', () => {
  function makeController() {
    const prisma = {
      analyticsEvent: { create: jest.fn().mockResolvedValue({}), groupBy: jest.fn().mockResolvedValue([]) },
      user: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      fileAccessRequest: { count: jest.fn().mockResolvedValue(0) },
      serviceRequest: { count: jest.fn().mockResolvedValue(0) },
      appointment: { count: jest.fn().mockResolvedValue(0) },
      candidateApplication: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    return { controller: new AnalyticsController(prisma), prisma };
  }

  it('track records the event type and metadata as given', async () => {
    const { controller, prisma } = makeController();
    const result = await controller.track({ eventType: 'cta_click_hero', metadata: { page: 'home' } } as any);

    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: { eventType: 'cta_click_hero', metadata: { page: 'home' } },
    });
    expect(result).toEqual({ received: true });
  });

  it('overview derives companyCount from the distinct company names returned, not a raw count', async () => {
    const { controller, prisma } = makeController();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([{ companyName: 'A' }, { companyName: 'B' }]);
    (prisma.user.count as jest.Mock).mockResolvedValue(12);

    const result = await controller.overview();

    expect(result.clientCount).toBe(12);
    expect(result.companyCount).toBe(2);
  });

  it('overview reshapes groupBy results into {eventType, count} / {status, count} pairs', async () => {
    const { controller, prisma } = makeController();
    (prisma.candidateApplication.groupBy as jest.Mock).mockResolvedValue([{ status: 'pending', _count: 3 }]);
    (prisma.analyticsEvent.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ eventType: 'cta_click_hero', _count: 5 }])
      .mockResolvedValueOnce([{ eventType: 'service_page_view_gre', _count: 8 }]);

    const result = await controller.overview();

    expect(result.candidatesByStatus).toEqual([{ status: 'pending', count: 3 }]);
    expect(result.ctaClicks).toEqual([{ eventType: 'cta_click_hero', count: 5 }]);
    expect(result.serviceViews).toEqual([{ eventType: 'service_page_view_gre', count: 8 }]);
  });
});
