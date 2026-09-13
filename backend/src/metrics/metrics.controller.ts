import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';
import { MetricsTokenGuard } from './metrics-token.guard';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // @Public() bypasses ClerkAuthGuard (Prometheus has no Clerk session to
  // present); MetricsTokenGuard is this route's own gate instead — see
  // that guard's class comment for why a static bearer token, not real
  // auth. @SkipThrottle() for the same reason as HealthController: a
  // scraper polling every 15s from one fixed IP (prometheus.yml's
  // scrape_interval) must never start seeing 429s from the global
  // per-IP limiter.
  @Public()
  @SkipThrottle()
  @UseGuards(MetricsTokenGuard)
  @Get()
  async index(@Res() res: Response): Promise<void> {
    // registry.contentType (from prom-client) includes the exposition
    // format version Prometheus's scraper parses against — a bare
    // "text/plain" works today but is the wrong thing to hardcode.
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.metrics());
  }
}
