import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FailoverService } from '../failover/failover.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly failover: FailoverService,
  ) {}

  // Exempt from the global 100/min/IP throttle: an orchestrator or
  // uptime monitor polling this once a second from one fixed IP would
  // otherwise start receiving 429s after 100 seconds, read that as
  // "unhealthy", and restart a perfectly healthy process in a loop.
  // Measured: 110 sequential requests → 100×200 then 10×429.
  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    // Goes through PrismaService's failover-routing proxy — during a
    // Postgres failover this queries local, not primary, so the health
    // check still passes (correctly) while running on the standby.
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      // Betterstack already polls this endpoint (docs/DISASTER_RECOVERY.md
      // "Alerting") — surfacing failover mode here makes an active
      // failover externally observable for free, no separate dashboard.
      failover: {
        postgres: this.failover.getPostgresMode(),
        redis: this.failover.getRedisMode(),
      },
    };
  }
}
