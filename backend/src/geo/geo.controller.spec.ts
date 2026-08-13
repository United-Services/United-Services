import { GeoController } from './geo.controller';
import type { GeoService } from './geo.service';

describe('GeoController', () => {
  function makeController(localeReturn: string) {
    const geo = {
      localeForIp: jest.fn().mockReturnValue(localeReturn),
    } as unknown as GeoService;
    return { controller: new GeoController(geo), geo };
  }

  it('uses the first IP in a comma-separated X-Forwarded-For chain', () => {
    const { controller, geo } = makeController('ar');
    const req: any = {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' },
      socket: { remoteAddress: '10.0.0.9' },
    };

    const result = controller.locale(req);

    expect(geo.localeForIp).toHaveBeenCalledWith('203.0.113.5');
    expect(result).toEqual({ locale: 'ar' });
  });

  it('falls back to the socket remote address when there is no X-Forwarded-For header', () => {
    const { controller, geo } = makeController('en');
    const req: any = { headers: {}, socket: { remoteAddress: '10.0.0.9' } };

    controller.locale(req);

    expect(geo.localeForIp).toHaveBeenCalledWith('10.0.0.9');
  });
});
