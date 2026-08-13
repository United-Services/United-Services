import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AuditLogController } from './audit-log.controller';

@Module({
  controllers: [AnalyticsController, AuditLogController],
})
export class AnalyticsModule {}
