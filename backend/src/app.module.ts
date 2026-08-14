import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { PrismaModule } from './prisma/prisma.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { S3Module } from './s3/s3.module';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MfaEnrolledGuard } from './common/guards/mfa-enrolled.guard';
import { CsrfHeaderGuard } from './common/guards/csrf-header.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { UploadsController } from './uploads/uploads.controller';
import { CryptoModule } from './crypto/crypto.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { MfaModule } from './mfa/mfa.module';
import { ServicesModule } from './services/services.module';
import { FileAccessModule } from './file-access/file-access.module';
import { RfqModule } from './rfq/rfq.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CandidatesModule } from './candidates/candidates.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { GeoModule } from './geo/geo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    // Reuses the same RedisService connection RedisModule already manages
    // (services-list caching etc.) instead of opening a second, separate
    // ioredis connection just for throttler storage.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    S3Module,
    CryptoModule,
    MfaModule,
    ServicesModule,
    FileAccessModule,
    RfqModule,
    AppointmentsModule,
    CandidatesModule,
    AnalyticsModule,
    AdminUsersModule,
    GeoModule,
  ],
  controllers: [HealthController, MeController, UploadsController],
  providers: [
    // Order matters: CsrfHeaderGuard is cheap and independent of req.user,
    // so it runs first and rejects unsafe-method requests missing the
    // custom header before any auth work happens. Then ClerkAuthGuard
    // attaches req.user, then RolesGuard can read it, then
    // MfaEnrolledGuard (only ever gates admin accounts, so it's safe to
    // run after role checks), then ThrottlerGuard applies rate limits.
    { provide: APP_GUARD, useClass: CsrfHeaderGuard },
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MfaEnrolledGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Catches anything that escapes a controller/service unhandled —
    // logs it, and always returns a safe, generic JSON body (never a
    // stack trace or raw error message) for a non-HttpException error.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
