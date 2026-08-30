import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FailoverService } from '../failover/failover.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly failover: FailoverService,
  ) {}

  @Public()
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
