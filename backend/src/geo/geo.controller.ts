import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GeoService } from './geo.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('locale')
  locale(@Req() req: Request) {
    const ip = this.extractIp(req);
    return { locale: this.geo.localeForIp(ip) };
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? '';
  }
}
