import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  Logger,
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
import { ADMIN_ROLES } from '../common/constants/admin-roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PresignServiceFileDto } from './dto/presign-service-file.dto';
import { ConfirmServiceFileDto } from './dto/confirm-service-file.dto';
import { PresignServiceImageDto } from './dto/presign-service-image.dto';
import { ConfirmServiceImageDto } from './dto/confirm-service-image.dto';
import { MultipartCreateServiceFileDto } from './dto/multipart-create-service-file.dto';
import { MultipartCreateServiceImageDto } from './dto/multipart-create-service-image.dto';
import {
  MultipartAbortDto,
  MultipartCompleteDto,
  MultipartPresignPartDto,
} from '../uploads/dto/multipart-part.dto';
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
  private readonly logger = new Logger(ServicesController.name);

  // A Redis outage must degrade the public services page to "always a
  // fresh DB read," never "500." Previously every redis.get/set/del call
  // in this controller was unguarded.
  private async safeCacheGet(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${err}`);
      return null;
    }
  }

  private async safeCacheSet(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${err}`);
    }
  }

  private async safeCacheDel(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`Cache invalidation failed for ${key}: ${err}`);
    }
  }

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
  //
  // `imageS3Key` itself is stripped from the returned object — the
  // comment above already documented that promise, but the code didn't
  // actually keep it: every field of `service` was being spread verbatim
  // into every response, including this one, so the public GET /services
  // and GET /services/:slug endpoints were handing an unauthenticated
  // visitor the private internal S3 key on every request.
  private async withImageUrl<T extends Service>(
    service: T,
  ): Promise<Omit<T, 'imageS3Key'> & { imageUrl: string | null }> {
    const { imageS3Key, ...rest } = service;
    if (!imageS3Key) return { ...rest, imageUrl: null };
    const imageUrl = await this.s3.createDownloadUrl(
      imageS3Key,
      IMAGE_URL_TTL_SECONDS,
    );
    return { ...rest, imageUrl };
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
    // Falls back to the untranslated (English-field) response rather than
    // 500ing the public services page when LibreTranslate is unreachable.
    try {
      const translated = await this.translations.getTranslatedServices(
        services,
        locale,
      );
      return services.map((s) => ({ ...s, ...translated.get(s.id) }));
    } catch (err) {
      this.logger.warn(
        `Translation lookup failed for locale=${locale}: ${err}`,
      );
      return services;
    }
  }

  // Public marketing content — read-heavy, low-churn, so it's cached in
  // Redis with an explicit invalidation on admin edits (Phase 10). Never
  // cache anything containing per-user data — this endpoint never does.
  // The cached payload is always the untranslated (English) record —
  // translation is merged in afterward per-request, same reasoning as
  // withImageUrl not being baked into the cache either.
  @Public()
  // Safe to let a browser/CDN cache this response body directly, not
  // just the DB read behind it — every field is public marketing
  // content, and the presigned imageUrl embedded per service is valid
  // for a full hour (IMAGE_URL_TTL_SECONDS), well past this max-age. No
  // per-user data ever appears here. stale-while-revalidate lets an
  // edge cache keep serving the previous response for a bit while it
  // refetches, instead of every visitor blocking on a fresh fetch the
  // instant max-age expires.
  @Header(
    'Cache-Control',
    `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`,
  )
  @Get()
  async list(@Query('locale') locale?: string) {
    const cached = await this.safeCacheGet(SERVICES_LIST_CACHE_KEY);
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
    await this.safeCacheSet(
      SERVICES_LIST_CACHE_KEY,
      JSON.stringify(services),
      CACHE_TTL_SECONDS,
    );
    return services;
  }

  // Batched counterpart to latestFile() below — replaces what used to be
  // one /services/:id/latest-file round trip per card on the client
  // dashboard (an N+1 over HTTP: N services on screen meant N requests,
  // each paying full auth-guard/CSRF/throttler overhead on top of an
  // otherwise-cheap indexed query). Registered ahead of the `:slug`
  // route below so "latest-files" is matched as this literal path, not
  // captured as a slug param.
  @Get('latest-files')
  async latestFiles(@Query('ids') ids?: string) {
    const serviceIds = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (serviceIds.length === 0) return {};

    const files = await this.prisma.serviceFile.findMany({
      where: { serviceId: { in: serviceIds } },
      orderBy: { uploadedAt: 'desc' },
      select: {
        serviceId: true,
        id: true,
        originalFilename: true,
        version: true,
        uploadedAt: true,
      },
    });

    // Keep only the newest file per service — `files` is already ordered
    // newest-first, so the first time a serviceId is seen is its latest.
    const byServiceId: Record<string, (typeof files)[number]> = {};
    for (const file of files) {
      if (!byServiceId[file.serviceId]) byServiceId[file.serviceId] = file;
    }
    return byServiceId;
  }

  @Public()
  @Header(
    'Cache-Control',
    `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`,
  )
  @Get(':slug')
  async bySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    const service = await this.prisma.service.findUnique({ where: { slug } });
    if (!service) throw new NotFoundException('Service not found');
    const [withTranslation] = await this.withTranslations([service], locale);
    return this.withImageUrl(withTranslation);
  }

  @Roles(...ADMIN_ROLES)
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
    await this.safeCacheDel(SERVICES_LIST_CACHE_KEY);
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

  @Roles(...ADMIN_ROLES)
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
    await this.safeCacheDel(SERVICES_LIST_CACHE_KEY);
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

  // Blocked (409, not a raw FK-constraint 500) whenever real business
  // records still point at this service — an RFQ against it, or a
  // file-access request on one of its spec files — rather than silently
  // cascading those away. ServiceFile rows themselves do cascade-delete
  // (see the schema's onDelete: Cascade on ServiceFile.service), but only
  // once we've confirmed nothing else references them.
  @Roles(...ADMIN_ROLES)
  @Delete(':id')
  async remove(@CurrentUser() admin: User, @Param('id') id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: { files: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    const rfqCount = await this.prisma.serviceRequest.count({
      where: { serviceId: id },
    });
    if (rfqCount > 0) {
      throw new ConflictException(
        'Cannot delete a service with existing RFQs against it',
      );
    }

    if (service.files.length > 0) {
      const accessRequestCount = await this.prisma.fileAccessRequest.count({
        where: { serviceFileId: { in: service.files.map((f) => f.id) } },
      });
      if (accessRequestCount > 0) {
        throw new ConflictException(
          'Cannot delete a service whose spec files have file-access requests on record',
        );
      }
    }

    await this.prisma.service.delete({ where: { id } });

    // Best-effort — the DB delete above is already committed, so a
    // failure here leaves an orphaned S3 object, not an inconsistent
    // record. Never undo the delete over this.
    const keysToDelete = [
      ...service.files.map((f) => f.s3Key),
      ...(service.imageS3Key ? [service.imageS3Key] : []),
    ];
    await Promise.all(
      keysToDelete.map((key) =>
        this.s3.deleteObject(key).catch(() => undefined),
      ),
    );

    await this.safeCacheDel(SERVICES_LIST_CACHE_KEY);
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'service.deleted',
      targetType: 'Service',
      targetId: id,
      metadata: { slug: service.slug, name: service.name },
    });
    return { ok: true };
  }

  // The service's public hero image — a different object/prefix from the
  // private spec files below, but the same presign -> confirm shape used
  // everywhere else in this codebase (see me.controller.ts's candidate
  // uploads): the file never transits this server, and content is only
  // trusted once its magic bytes are checked at confirm time.
  @Roles(...ADMIN_ROLES)
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

  // Chunked counterpart to presignImage() — same key scheme, same
  // allowlist, but split into parts so a dropped connection only loses
  // the parts still in flight, not the whole image.
  @Roles(...ADMIN_ROLES)
  @Post(':id/image/multipart/create')
  async multipartCreateImage(
    @Param('id') serviceId: string,
    @Body() dto: MultipartCreateServiceImageDto,
  ) {
    const extension = ALLOWED_SERVICE_IMAGE_TYPES[dto.contentType];
    if (!extension) {
      throw new BadRequestException(
        'Unsupported contentType for service images',
      );
    }
    const key = `pending/service-images/${serviceId}/${Date.now()}-${randomUUID()}.${extension}`;
    const uploadId = await this.s3.createMultipartUpload(key, dto.contentType);
    return { key, uploadId };
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/image/multipart/presign-part')
  async multipartPresignImagePart(
    @Param('id') serviceId: string,
    @Body() dto: MultipartPresignPartDto,
  ) {
    if (!dto.key.startsWith(`pending/service-images/${serviceId}/`)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    const url = await this.s3.presignUploadPart(
      dto.key,
      dto.uploadId,
      dto.partNumber,
    );
    return { url };
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/image/multipart/complete')
  async multipartCompleteImage(
    @Param('id') serviceId: string,
    @Body() dto: MultipartCompleteDto,
  ) {
    if (!dto.key.startsWith(`pending/service-images/${serviceId}/`)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    await this.s3.completeMultipartUpload(
      dto.key,
      dto.uploadId,
      dto.parts.map((p) => ({ partNumber: p.partNumber, eTag: p.eTag })),
    );
    return { key: dto.key };
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/image/multipart/abort')
  async multipartAbortImage(
    @Param('id') serviceId: string,
    @Body() dto: MultipartAbortDto,
  ) {
    if (!dto.key.startsWith(`pending/service-images/${serviceId}/`)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    await this.s3.abortMultipartUpload(dto.key, dto.uploadId);
    return { ok: true };
  }

  @Roles(...ADMIN_ROLES)
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

    await this.safeCacheDel(SERVICES_LIST_CACHE_KEY);
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
  @Roles(...ADMIN_ROLES)
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

  // Chunked counterpart to presignFile() — see multipartCreateImage() above
  // for why this exists alongside the single-PUT path.
  @Roles(...ADMIN_ROLES)
  @Post(':id/files/multipart/create')
  async multipartCreateFile(
    @Param('id') serviceId: string,
    @Body() dto: MultipartCreateServiceFileDto,
  ) {
    if (!ALLOWED_SERVICE_FILE_TYPES.has(dto.contentType)) {
      throw new BadRequestException('Unsupported contentType for spec files');
    }
    const safeName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    assertNoDisguisedExtension(safeName);
    const key = `pending/service-specs/${serviceId}/${Date.now()}-${randomUUID()}-${safeName}`;
    const uploadId = await this.s3.createMultipartUpload(key, dto.contentType);
    return { key, uploadId };
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/files/multipart/presign-part')
  async multipartPresignFilePart(
    @Param('id') serviceId: string,
    @Body() dto: MultipartPresignPartDto,
  ) {
    if (!dto.key.startsWith(`pending/service-specs/${serviceId}/`)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    const url = await this.s3.presignUploadPart(
      dto.key,
      dto.uploadId,
      dto.partNumber,
    );
    return { url };
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/files/multipart/complete')
  async multipartCompleteFile(
    @Param('id') serviceId: string,
    @Body() dto: MultipartCompleteDto,
  ) {
    if (!dto.key.startsWith(`pending/service-specs/${serviceId}/`)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    await this.s3.completeMultipartUpload(
      dto.key,
      dto.uploadId,
      dto.parts.map((p) => ({ partNumber: p.partNumber, eTag: p.eTag })),
    );
    return { key: dto.key };
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/files/multipart/abort')
  async multipartAbortFile(
    @Param('id') serviceId: string,
    @Body() dto: MultipartAbortDto,
  ) {
    if (!dto.key.startsWith(`pending/service-specs/${serviceId}/`)) {
      throw new BadRequestException('s3Key does not belong to this service');
    }
    await this.s3.abortMultipartUpload(dto.key, dto.uploadId);
    return { ok: true };
  }

  @Roles(...ADMIN_ROLES)
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

  @Roles(...ADMIN_ROLES)
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
