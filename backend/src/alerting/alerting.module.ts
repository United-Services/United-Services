import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { IncidentAlertService } from './incident-alert.service';

@Module({
  imports: [RedisModule],
  providers: [IncidentAlertService],
  exports: [IncidentAlertService],
})
export class AlertingModule {}
