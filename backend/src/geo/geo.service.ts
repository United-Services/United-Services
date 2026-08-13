import { Injectable, OnModuleInit } from '@nestjs/common';
import { join } from 'node:path';
import { open, type CountryResponse, type Reader } from 'maxmind';

const ARABIC_COUNTRIES = new Set([
  'EG',
  'SA',
  'AE',
  'IQ',
  'KW',
  'QA',
  'BH',
  'OM',
  'JO',
  'LB',
  'SY',
  'YE',
  'LY',
  'TN',
  'DZ',
  'MA',
  'SD',
  'PS',
  'MR',
  'SO',
  'DJ',
  'KM',
]);
const CHINESE_COUNTRIES = new Set(['CN', 'TW', 'HK', 'MO']);

export type SupportedLocale = 'en' | 'ar' | 'zh';

// Backed by the real GeoLite2-Country database (see backend/GeoIP.conf and
// GEOIP_MAXMIND_DB_DIR) — no third-party geo API call needed for this.
@Injectable()
export class GeoService implements OnModuleInit {
  private reader: Reader<CountryResponse> | null = null;

  async onModuleInit() {
    const dbDir = process.env.GEOIP_MAXMIND_DB_DIR ?? './geoip-db';
    try {
      this.reader = await open(
        join(process.cwd(), dbDir, 'GeoLite2-Country.mmdb'),
      );
    } catch {
      // Missing/unreadable DB (e.g. not yet downloaded in this environment)
      // — localeForIp() falls back to 'en' rather than failing requests.
      this.reader = null;
    }
  }

  localeForIp(ip: string): SupportedLocale {
    const countryCode = this.countryForIp(ip);
    if (!countryCode) return 'en';
    if (ARABIC_COUNTRIES.has(countryCode)) return 'ar';
    if (CHINESE_COUNTRIES.has(countryCode)) return 'zh';
    return 'en';
  }

  // Raw ISO 3166-1 alpha-2 country code (e.g. "EG", "US") — used for the
  // admin dashboard's requests-by-country world map, which needs real
  // per-country granularity rather than the 3-way locale bucketing above.
  countryForIp(ip: string): string | null {
    if (!this.reader || !ip) return null;
    const result = this.reader.get(ip);
    return result?.country?.iso_code ?? null;
  }
}
