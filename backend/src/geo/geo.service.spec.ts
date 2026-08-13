import { GeoService } from './geo.service';

// Locale detection drives the first-visit language prompt (see
// frontend LanguagePrompt.tsx) — getting a country wrong just shows the
// wrong banner, but the fallback-to-English path matters: it must never
// throw when the DB is unavailable.
describe('GeoService', () => {
  function withReader(countryCode: string | undefined) {
    const service = new GeoService();
    (service as any).reader = {
      get: () => (countryCode ? { country: { iso_code: countryCode } } : null),
    };
    return service;
  }

  it('maps an Egyptian IP to ar', () => {
    expect(withReader('EG').localeForIp('1.2.3.4')).toBe('ar');
  });

  it('maps a Saudi IP to ar', () => {
    expect(withReader('SA').localeForIp('1.2.3.4')).toBe('ar');
  });

  it('maps a Chinese IP to zh', () => {
    expect(withReader('CN').localeForIp('1.2.3.4')).toBe('zh');
  });

  it('maps a Taiwanese IP to zh', () => {
    expect(withReader('TW').localeForIp('1.2.3.4')).toBe('zh');
  });

  it('falls back to en for a country outside both sets', () => {
    expect(withReader('US').localeForIp('1.2.3.4')).toBe('en');
  });

  it('falls back to en when the lookup finds no country', () => {
    expect(withReader(undefined).localeForIp('1.2.3.4')).toBe('en');
  });

  it('falls back to en without throwing when the mmdb reader never loaded', () => {
    const service = new GeoService(); // onModuleInit never ran — reader stays null
    expect(() => service.localeForIp('1.2.3.4')).not.toThrow();
    expect(service.localeForIp('1.2.3.4')).toBe('en');
  });
});
