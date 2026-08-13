import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PresignServiceFileDto } from './dto/presign-service-file.dto';
import { ConfirmServiceFileDto } from './dto/confirm-service-file.dto';
import {
  Role,
  type User,
  type Service,
  type Prisma,
} from '../generated/prisma';

const SERVICES_LIST_CACHE_KEY = 'cache:services:list';
const CACHE_TTL_SECONDS = 300;

@Controller('services')
export class ServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditLog: AuditLogService,
    private readonly redis: RedisService,
  ) {}

  // Public marketing content — read-heavy, low-churn, so it's cached in
  // Redis with an explicit invalidation on admin edits (Phase 10). Never
  // cache anything containing per-user data — this endpoint never does.
  @Public()
  @Get()
  async list() {
    const cached = await this.redis.get(SERVICES_LIST_CACHE_KEY);
    if (cached) return JSON.parse(cached) as Service[];

    const services = await this.prisma.service.findMany({
      orderBy: { order: 'asc' },
    });
    await this.redis.set(
      SERVICES_LIST_CACHE_KEY,
      JSON.stringify(services),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return services;
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.prisma.service.findUniqueOrThrow({ where: { slug } });
  }

  @Roles(Role.admin)
  @Patch(':id')
  async update(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    const updated = await this.prisma.service.update({
      where: { id },
      data: { ...dto, updatedByAdminId: admin.id },
    });
    await this.redis.del(SERVICES_LIST_CACHE_KEY);
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'service.updated',
      targetType: 'Service',
      targetId: id,
      metadata: dto as unknown as Prisma.InputJsonValue,
    });
    return updated;
  }

  // Spec files are always private (see ServiceFile model comment) — an
  // admin uploads via presigned PUT directly to S3, then confirms so we
  // record the object without the file ever transiting this server.
  @Roles(Role.admin)
  @Post(':id/files/presign')
  async presignFile(
    @Param('id') serviceId: string,
    @Body() dto: PresignServiceFileDto,
  ) {
    const safeName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `service-specs/${serviceId}/${Date.now()}-${safeName}`;
    const url = await this.s3.createUploadUrl(key, dto.contentType);
    return { url, key };
  }

  @Roles(Role.admin)
  @Post(':id/files')
  async confirmFile(
    @CurrentUser() admin: User,
    @Param('id') serviceId: string,
    @Body() dto: ConfirmServiceFileDto,
  ) {
    const existingCount = await this.prisma.serviceFile.count({
      where: { serviceId },
    });
    const file = await this.prisma.serviceFile.create({
      data: {
        serviceId,
        s3Key: dto.s3Key,
        originalFilename: dto.originalFilename,
        version: existingCount + 1,
        uploadedByAdminId: admin.id,
      },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'service_file.uploaded',
      targetType: 'ServiceFile',
      targetId: file.id,
      metadata: { serviceId, originalFilename: dto.originalFilename },
    });
    return file;
  }

  @Roles(Role.admin)
  @Get(':id/files')
  listFiles(@Param('id') serviceId: string) {
    return this.prisma.serviceFile.findMany({
      where: { serviceId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  // Any signed-in user can see which spec file exists for a service (just
  // id/filename — never the s3Key) so a client can request access to it.
  // The file itself is still only ever reachable through the request ->
  // approval -> presigned-download flow.
  @Get(':id/latest-file')
  async latestFile(@Param('id') serviceId: string) {
    return this.prisma.serviceFile.findFirst({
      where: { serviceId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        originalFilename: true,
        version: true,
        uploadedAt: true,
      },
    });
  }
}
