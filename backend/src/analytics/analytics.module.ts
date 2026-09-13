import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AuditLogController } from './audit-log.controller';
import { AnalyticsWriteWorker } from './analytics-write.worker';
import { GeoModule } from '../geo/geo.module';

@Module({
  imports: [GeoModule],
  controllers: [AnalyticsController, AuditLogController],
  providers: [AnalyticsWriteWorker],
})
export class AnalyticsModule {}
