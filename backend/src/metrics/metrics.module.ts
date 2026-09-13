import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsTokenGuard } from './metrics-token.guard';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { QueueMetricsPoller } from './queue-metrics.poller';

@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsTokenGuard,
    QueueMetricsPoller,
    // Global so every HTTP request through the app is timed, not just
    // routes that happen to import MetricsModule — same registration
    // pattern as ThrottlerGuard/ClerkAuthGuard in app.module.ts.
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  // MetricsService is exported so any future module that wants to
  // record a custom metric (e.g. a business-level counter) can inject
  // it without duplicating the Registry — nothing does yet.
  exports: [MetricsService],
})
export class MetricsModule {}
