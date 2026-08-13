import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GeoService } from './geo.service';
import { Public } from '../common/decorators/public.decorator';
import { extractIp } from '../common/utils/extract-ip';

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('locale')
  locale(@Req() req: Request) {
    return { locale: this.geo.localeForIp(extractIp(req)) };
  }
}
