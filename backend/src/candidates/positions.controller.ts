import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TranslationService } from '../translations/translation.service';
import { TRANSLATABLE_LOCALES } from '../translations/translatable-locales';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../common/constants/admin-roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';
import { Role, type User } from '../generated/prisma';

// Public, read-heavy, low-churn — same cache-aside pattern as
// ServicesController's list cache (Phase 6 of the perf audit). Keyed per
// locale bucket since listOpen()'s response shape differs by locale.
const OPEN_POSITIONS_CACHE_KEY = (locale: string) =>
  `cache:positions:open:${locale}`;
const CACHE_TTL_SECONDS = 300;

@Controller('positions')
export class PositionsController {
  private readonly logger = new Logger(PositionsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationService,
    private readonly auditLog: AuditLogService,
    private readonly redis: RedisService,
  ) {}

  // Public Careers page — only ever shows isOpen positions. `locale` is
  // optional and only ever changes the response for 'ar'/'zh' — omitted,
  // 'en', or anything unrecognized takes the exact same path as before
  // this endpoint had any translation awareness.
  @Public()
  // Same reasoning as ServicesController.list()'s Cache-Control — public,
  // no per-user data, safe for a browser/CDN to cache directly rather
  // than hitting this endpoint (even a Redis-cache-hit one) every time.
  @Header(
    'Cache-Control',
    `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`,
  )
  @Get()
  async listOpen(@Query('locale') locale?: string) {
    const cacheKey = OPEN_POSITIONS_CACHE_KEY(locale ?? 'en');
    // This is the public Careers page — a Redis blip must degrade to an
    // uncached DB read, never take the whole page down. Previously an
    // unguarded `redis.get`/`set` meant a Redis outage 500'd this
    // endpoint even though the actual data (Postgres) was fine.
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as unknown;
    } catch (err) {
      this.logger.warn(`Cache read failed for ${cacheKey}: ${err}`);
    }

    const positions = await this.prisma.openPosition.findMany({
      where: { isOpen: true },
      orderBy: { createdAt: 'desc' },
    });

    let result: unknown = positions;
    if (locale && TRANSLATABLE_LOCALES.includes(locale)) {
      try {
        const translated = await this.translations.getTranslatedPositions(
          positions,
          locale,
        );
        result = positions.map((p) => ({ ...p, ...translated.get(p.id) }));
      } catch (err) {
        // Falls back to the untranslated (English-field) response rather
        // than 500ing the whole page when LibreTranslate is unreachable.
        this.logger.warn(
          `Translation lookup failed for locale=${locale}: ${err}`,
        );
      }
    }

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`Cache write failed for ${cacheKey}: ${err}`);
    }
    return result;
  }

  @Roles(...ADMIN_ROLES)
  @Get('all')
  listAll() {
    return this.prisma.openPosition.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles(...ADMIN_ROLES)
  @Post()
  async create(@CurrentUser() admin: User, @Body() dto: CreatePositionDto) {
    const created = await this.prisma.openPosition.create({
      data: { ...dto, createdByAdminId: admin.id },
    });
    await this.invalidateListCache();
    if (created.isOpen) {
      this.translations.triggerAsync(created, TRANSLATABLE_LOCALES); // fire-and-forget
    }
    return created;
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    const updated = await this.prisma.openPosition.update({
      where: { id },
      data: dto,
    });
    await this.invalidateListCache();
    // Triggered regardless of which fields changed — the hash check
    // inside triggerAsync/getTranslatedPositions makes a no-op retrigger
    // on an update that didn't touch title/description/department cheap
    // and correct, so there's no need to diff fields here.
    if (updated.isOpen) {
      this.translations.triggerAsync(updated, TRANSLATABLE_LOCALES); // fire-and-forget
    }
    return updated;
  }

  // A create/update can flip which positions are `isOpen` or change
  // translated fields — clear every locale bucket rather than trying to
  // reason about which ones are stale. Cheap: the next listOpen() per
  // locale just repopulates it, and this only runs on admin writes.
  // allSettled, not all — a create/update's DB write already succeeded by
  // the time this runs; one locale's redis.del rejecting must not turn
  // that into a 500 response to the admin (the write is real, only the
  // cache is briefly stale, and the next listOpen() call for the
  // failed-to-invalidate locale still repopulates it after its own TTL).
  private async invalidateListCache() {
    const results = await Promise.allSettled(
      ['en', ...TRANSLATABLE_LOCALES].map((locale) =>
        this.redis.del(OPEN_POSITIONS_CACHE_KEY(locale)),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`Cache invalidation failed: ${result.reason}`);
      }
    }
  }

  // Lets an admin force a specific translation to regenerate (e.g. to fix
  // a bad machine translation) without waiting for a content edit.
  @Roles(...ADMIN_ROLES)
  @Post(':id/translations/:locale/invalidate')
  async invalidateTranslation(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Param('locale') locale: string,
  ) {
    await this.translations.invalidate('open_position', id, locale);
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'position_translation.invalidated',
      targetType: 'OpenPosition',
      targetId: id,
      metadata: { locale },
    });
    return { ok: true };
  }
}
