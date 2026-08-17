import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RedisService } from '../redis/redis.service';
import { TranslationService } from '../translations/translation.service';
import { TRANSLATABLE_LOCALES } from '../translations/translatable-locales';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PresignServiceFileDto } from './dto/presign-service-file.dto';
import { ConfirmServiceFileDto } from './dto/confirm-service-file.dto';
import { PresignServiceImageDto } from './dto/presign-service-image.dto';
import { ConfirmServiceImageDto } from './dto/confirm-service-image.dto';
import {
  Role,
  type User,
  type Service,
  type Prisma,
} from '../generated/prisma';
import {
  assertNoDisguisedExtension,
  assertSafeFilename,
  matchesContentType,
} from '../common/utils/file-security';

const SERVICES_LIST_CACHE_KEY = 'cache:services:list';
const CACHE_TTL_SECONDS = 300;

// How long a resolved image URL stays valid for the browser that receives
// it — generous relative to CACHE_TTL_SECONDS because presigning is a
// local, no-network-call operation (see resolveImageUrl below), so it's
// cheap to redo on every request regardless of whether the underlying
// service list came from cache. A short-tab-open visitor never sees this
// expire mid-visit.
const IMAGE_URL_TTL_SECONDS = 3600;

// Admin-only, but still enforced server-side: a spec file must actually be
// one of these document types. Never trust the client-reported
// `contentType` beyond this lookup.
const ALLOWED_SERVICE_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_SERVICE_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Controller('services')
export class ServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditLog: AuditLogService,
    private readonly redis: RedisService,
    private readonly translations: TranslationService,
  ) {}

  // Resolves each service's private imageS3Key (see the schema comment on
  // Service.imageS3Key) to a short-lived presigned GET URL — never a raw
  // key or permanent URL leaves this server. Run on every response, cache
  // hit or not, since presigning is local (HMAC over the request, no S3
  // round trip) and a URL baked into the 5-minute service-list cache would
  // otherwise go stale/expired well before the cache entry itself does.
  private async withImageUrl<T extends Service>(
    service: T,
  ): Promise<T & { imageUrl: string | null }> {
    if (!service.imageS3Key) return { ...service, imageUrl: null };
    const imageUrl = await this.s3.createDownloadUrl(
      service.imageS3Key,
      IMAGE_URL_TTL_SECONDS,
    );
    return { ...service, imageUrl };
  }

  // Merges each service's machine translation (name/shortDescription/
  // longDescription only — `specs` is technical standard codes and is
  // deliberately never translated, see TranslationService's SERVICE_FIELDS)
  // on top of the original record for 'ar'/'zh'. Omitted/'en'/anything
  // else returns the services completely untouched.
  private async withTranslations(
    services: Service[],
    locale?: string,
  ): Promise<Service[]> {
    if (!locale || !TRANSLATABLE_LOCALES.includes(locale)) return services;
    const translated = await this.translations.getTranslatedServices(
      services,
      locale,
    );
    return services.map((s) => ({ ...s, ...translated.get(s.id) }));
  }

  // Public marketing content — read-heavy, low-churn, so it's cached in
  // Redis with an explicit invalidation on admin edits (Phase 10). Never
  // cache anything containing per-user data — this endpoint never does.
  // The cached payload is always the untranslated (English) record —
  // translation is merged in afterward per-request, same reasoning as
  // withImageUrl not being baked into the cache either.
  @Public()
  @Get()
  async list(@Query('locale') locale?: string) {
    const cached = await this.redis.get(SERVICES_LIST_CACHE_KEY);
    const services = cached
      ? (JSON.parse(cached) as Service[])
      : await this.fetchAndCacheServices();
    const withTranslations = await this.withTranslations(services, locale);
    return Promise.all(withTranslations.map((s) => this.withImageUrl(s)));
  }

  private async fetchAndCacheServices(): Promise<Service[]> {
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
  async bySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    const service = await this.prisma.service.findUnique({ where: { slug } });
    if (!service) throw new NotFoundException('Service not found');
    const [withTranslation] = await this.withTranslations([service], locale);
    return this.withImageUrl(withTranslation);
  }

  @Roles(Role.admin)
  @Post()
  async create(@CurrentUser() admin: User, @Body() dto: CreateServiceDto) {
    const existing = await this.prisma.service.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('A service with this slug already exists');
    }
    const maxOrder = await this.prisma.service.aggregate({
      _max: { order: true },
    });
    const created = await this.prisma.service.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        shortDescription: dto.shortDescription,
        longDescription: dto.longDescription,
        specs: dto.specs ?? [],
        order: dto.order ?? (maxOrder._max.order ?? 0) + 1,
        // Vestigial structural field — nothing in the current frontend
        // reads it, but the column is non-nullable; the slug is a safe,
        // always-present default rather than exposing a redundant field
        // in the create form.
        iconKey: dto.slug,
        updatedByAdminId: admin.id,
      },
    });
    await this.redis.del(SERVICES_LIST_CACHE_KEY);
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'service.created',
      targetType: 'Service',
      targetId: created.id,
      metadata: { slug: dto.slug, name: dto.name },
    });
    this.translations.triggerServiceAsync(created, TRANSLATABLE_LOCALES); // fire-and-forget
    return this.withImageUrl(created);
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
    // Triggered regardless of which fields changed — the hash check
    // inside triggerServiceAsync/getTranslatedServices makes a no-op
    // retrigger on an update that didn't touch name/shortDescription/
    // longDescription cheap and correct, so there's no need to diff
    // fields here (same reasoning as PositionsController.update).
    this.translations.triggerServiceAsync(updated, TRANSLATABLE_LOCALES); // fire-and-forget
    return this.withImageUrl(updated);
  }

  // The service's public hero image — a different object/prefix from the
  // private spec files below, but the same presign -> confirm shape used
  // everywhere else in this codebase (see me.controller.ts's candidate
  // uploads): the file never transits this server, and content is only
  // trusted once its magic bytes are checked at confirm time.
  @Roles(Role.admin)
  @Post(':id/image/presign')
  async presignImage(
    @Param('id') serviceId: string,
    @Body() dto: PresignServiceImageDto,
  ) {
    const extension = ALLOWED_SERVICE_IMAGE_TYPES[dto.contentType];
    if (!extension) {
      throw new BadRequestException(
        'Unsupported contentType for service images',
      );
    }
    // pending/ prefix: a presigned PUT URL is reusable until it expires,
    // not single-use, so this key must never be trusted/served until
    // confirmImage validates and promotes it.
    const key = `pending/service-images/${serviceId}/${Date.now()}-${randomUUID()}.${extension}`;
    const url = await this.s3.createUploadUrl(key, dto.contentType);
    return { url, key };
  }

  @Roles(Role.admin)
  @Post(':id/image')
  async confirmImage(
    @CurrentUser() admin: User,
    @Param('id') serviceId: string,
    @Body() dto: ConfirmServiceImageDto,
  ) {
    const expectedPrefix = `pending/service-images/${serviceId}/`;
    if (!dto.s3Key.startsWith(expectedPrefix)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    const existing = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { imageS3Key: true },
    });
    if (!existing) throw new NotFoundException('Service not found');

    const bytes = await this.s3.readLeadingBytes(dto.s3Key);
    const matchesAny = Object.keys(ALLOWED_SERVICE_IMAGE_TYPES).some((type) =>
      matchesContentType(bytes, type),
    );
    if (!matchesAny) {
      await this.s3.deleteObject(dto.s3Key).catch(() => undefined);
      throw new BadRequestException(
        'Uploaded file content does not match an accepted image format',
      );
    }

    // Promote off the presign-writable pending key before ever storing or
    // serving it — closes the same TOCTOU window described in
    // uploads.controller.ts.
    const permanentKey = dto.s3Key.slice('pending/'.length);
    await this.s3.promoteUpload(dto.s3Key, permanentKey);

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: { imageS3Key: permanentKey, updatedByAdminId: admin.id },
    });

    // Only after the new key is safely committed — never delete the old
    // object first, or a failure between the two would leave the service
    // with no image at all instead of just a stale one.
    if (existing.imageS3Key) {
      await this.s3.deleteObject(existing.imageS3Key).catch(() => undefined);
    }

    await this.redis.del(SERVICES_LIST_CACHE_KEY);
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'service.image_updated',
      targetType: 'Service',
      targetId: serviceId,
      metadata: {},
    });
    return this.withImageUrl(updated);
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
    if (!ALLOWED_SERVICE_FILE_TYPES.has(dto.contentType)) {
      throw new BadRequestException('Unsupported contentType for spec files');
    }
    const safeName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    assertNoDisguisedExtension(safeName);
    // pending/ prefix: a presigned PUT URL is reusable until it expires,
    // not single-use, so this key must never be trusted/served once
    // confirmFile promotes it — see the identical reasoning on the
    // candidate-upload path in me.controller.ts.
    const key = `pending/service-specs/${serviceId}/${Date.now()}-${randomUUID()}-${safeName}`;
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
    assertSafeFilename(dto.originalFilename);
    const expectedPrefix = `pending/service-specs/${serviceId}/`;
    if (!dto.s3Key.startsWith(expectedPrefix)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    const bytes = await this.s3.readLeadingBytes(dto.s3Key);
    const matchesAny = [...ALLOWED_SERVICE_FILE_TYPES].some((type) =>
      matchesContentType(bytes, type),
    );
    if (!matchesAny) {
      await this.s3.deleteObject(dto.s3Key).catch(() => undefined);
      throw new BadRequestException(
        'Uploaded file content does not match an accepted document type',
      );
    }

    // Promote off the presign-writable pending key before ever storing or
    // serving it — closes the same TOCTOU window described in
    // uploads.controller.ts.
    const permanentKey = dto.s3Key.slice('pending/'.length);
    await this.s3.promoteUpload(dto.s3Key, permanentKey);

    const existingCount = await this.prisma.serviceFile.count({
      where: { serviceId },
    });
    const file = await this.prisma.serviceFile.create({
      data: {
        serviceId,
        s3Key: permanentKey,
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
