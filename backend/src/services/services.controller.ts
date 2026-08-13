import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PresignServiceFileDto } from './dto/presign-service-file.dto';
import { ConfirmServiceFileDto } from './dto/confirm-service-file.dto';
import { Role, type User } from '../generated/prisma';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditLog: AuditLogService,
  ) {}

  // Public marketing content — services page content is DB-editable by
  // admins, but browsing it never requires an account.
  @Public()
  @Get()
  list() {
    return this.prisma.service.findMany({ orderBy: { order: 'asc' } });
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.prisma.service.findUniqueOrThrow({ where: { slug } });
  }

  @Roles(Role.admin)
  @Patch(':id')
  async update(@CurrentUser() admin: User, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    const updated = await this.prisma.service.update({
      where: { id },
      data: { ...dto, updatedByAdminId: admin.id },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'service.updated',
      targetType: 'Service',
      targetId: id,
      metadata: dto as any,
    });
    return updated;
  }

  // Spec files are always private (see ServiceFile model comment) — an
  // admin uploads via presigned PUT directly to S3, then confirms so we
  // record the object without the file ever transiting this server.
  @Roles(Role.admin)
  @Post(':id/files/presign')
  async presignFile(@Param('id') serviceId: string, @Body() dto: PresignServiceFileDto) {
    const safeName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `service-specs/${serviceId}/${Date.now()}-${safeName}`;
    const url = await this.s3.createUploadUrl(key, dto.contentType);
    return { url, key };
  }

  @Roles(Role.admin)
  @Post(':id/files')
  async confirmFile(@CurrentUser() admin: User, @Param('id') serviceId: string, @Body() dto: ConfirmServiceFileDto) {
    const existingCount = await this.prisma.serviceFile.count({ where: { serviceId } });
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
    return this.prisma.serviceFile.findMany({ where: { serviceId }, orderBy: { uploadedAt: 'desc' } });
  }
}
