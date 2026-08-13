import { AnalyticsController } from './analytics.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { GeoService } from '../geo/geo.service';

describe('AnalyticsController', () => {
  function makeController(country: string | null = 'EG') {
    const prisma = {
      analyticsEvent: {
        create: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      fileAccessRequest: { count: jest.fn().mockResolvedValue(0) },
      serviceRequest: { count: jest.fn().mockResolvedValue(0) },
      appointment: { count: jest.fn().mockResolvedValue(0) },
      candidateApplication: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const geo = {
      countryForIp: jest.fn().mockReturnValue(country),
    } as unknown as GeoService;
    return { controller: new AnalyticsController(prisma, geo), prisma, geo };
  }

  const fakeReq = (ip = '203.0.113.5') =>
    ({ headers: { 'x-forwarded-for': ip }, socket: {} }) as any;

  describe('track', () => {
    it('records the event type and metadata as given', async () => {
      const { controller, prisma } = makeController();
      const result = await controller.track(
        { eventType: 'cta_click_hero', metadata: { page: 'home' } },
        fakeReq(),
      );

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'cta_click_hero',
          metadata: { page: 'home' },
          country: 'EG',
        },
      });
      expect(result).toEqual({ received: true });
    });

    it('always resolves country server-side from the request IP, never from client input', async () => {
      const { controller, prisma, geo } = makeController('DE');
      // Even if a caller tried to smuggle a country into metadata, only
      // GeoService's server-side resolution is ever persisted as `country`.
      await controller.track(
        { eventType: 'page_view', metadata: { country: 'XX' } },
        fakeReq('198.51.100.1'),
      );

      expect(geo.countryForIp).toHaveBeenCalledWith('198.51.100.1');
      expect(
        (prisma.analyticsEvent.create as jest.Mock).mock.calls[0][0].data
          .country,
      ).toBe('DE');
    });

    it('stores a null country when geo resolution fails (no mmdb loaded)', async () => {
      const { controller, prisma } = makeController(null);
      await controller.track({ eventType: 'page_view' }, fakeReq());
      expect(
        (prisma.analyticsEvent.create as jest.Mock).mock.calls[0][0].data
          .country,
      ).toBeNull();
    });
  });

  it('overview derives companyCount from the distinct company names returned, not a raw count', async () => {
    const { controller, prisma } = makeController();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { companyName: 'A' },
      { companyName: 'B' },
    ]);
    (prisma.user.count as jest.Mock).mockResolvedValue(12);

    const result = await controller.overview();

    expect(result.clientCount).toBe(12);
    expect(result.companyCount).toBe(2);
  });

  it('overview reshapes groupBy results into {eventType, count} / {status, count} pairs', async () => {
    const { controller, prisma } = makeController();
    (prisma.candidateApplication.groupBy as jest.Mock).mockResolvedValue([
      { status: 'pending', _count: 3 },
    ]);
    (prisma.analyticsEvent.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ eventType: 'cta_click_hero', _count: 5 }])
      .mockResolvedValueOnce([
        { eventType: 'service_page_view_gre', _count: 8 },
      ]);

    const result = await controller.overview();

    expect(result.candidatesByStatus).toEqual([
      { status: 'pending', count: 3 },
    ]);
    expect(result.ctaClicks).toEqual([
      { eventType: 'cta_click_hero', count: 5 },
    ]);
    expect(result.serviceViews).toEqual([
      { eventType: 'service_page_view_gre', count: 8 },
    ]);
  });

  describe('geoOverview', () => {
    it('only counts page_view events, sorted by count descending', async () => {
      const { controller, prisma } = makeController();
      (prisma.analyticsEvent.groupBy as jest.Mock).mockResolvedValue([
        { country: 'EG', _count: 5 },
        { country: 'US', _count: 20 },
        { country: 'DE', _count: 12 },
      ]);

      const result = await controller.geoOverview();

      expect(
        (prisma.analyticsEvent.groupBy as jest.Mock).mock.calls[0][0].where
          .eventType,
      ).toBe('page_view');
      expect(result.countries).toEqual([
        { country: 'US', count: 20 },
        { country: 'DE', count: 12 },
        { country: 'EG', count: 5 },
      ]);
    });

    it('filters out any null-country rows rather than showing an "unknown" bucket', async () => {
      const { controller, prisma } = makeController();
      (prisma.analyticsEvent.groupBy as jest.Mock).mockResolvedValue([
        { country: null, _count: 3 },
      ]);

      const result = await controller.geoOverview();

      expect(result.countries).toEqual([]);
    });
  });
});
