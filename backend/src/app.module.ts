import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { PrismaModule } from './prisma/prisma.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { S3Module } from './s3/s3.module';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { UploadsController } from './uploads/uploads.controller';
import { CryptoModule } from './crypto/crypto.module';
import { RedisModule } from './redis/redis.module';
import { MfaModule } from './mfa/mfa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      storage: new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')),
    }),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    S3Module,
    CryptoModule,
    RedisModule,
    MfaModule,
  ],
  controllers: [HealthController, MeController, UploadsController],
  providers: [
    // Order matters: ClerkAuthGuard runs first and attaches req.user, then
    // RolesGuard can read it, then ThrottlerGuard applies rate limits.
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
