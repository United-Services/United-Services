import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { FailoverService } from '../failover/failover.service';
import { createFailoverRedisConnection } from '../failover/failover-redis-connection';

@Global()
@Module({
  providers: [
    {
      provide: RedisService,
      useFactory: (failover: FailoverService) =>
        createFailoverRedisConnection(failover) as unknown as RedisService,
      inject: [FailoverService],
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
