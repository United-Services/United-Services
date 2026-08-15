import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TranslationService } from '../translations/translation.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';
import { Role, type User } from '../generated/prisma';

// Only these two carry a machine translation — 'en' (or anything else,
// including an omitted param) is the existing untranslated path with zero
// added logic, matching current behavior exactly. Kept in sync with
// routing.locales minus "en" in the frontend's i18n/routing.ts.
const TRANSLATABLE_LOCALES = ['ar', 'zh'];

@Controller('positions')
export class PositionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly translations: TranslationService,
    private readonly auditLog: AuditLogService,
  ) {}

  // Public Careers page — only ever shows isOpen positions. `locale` is
  // optional and only ever changes the response for 'ar'/'zh' — omitted,
  // 'en', or anything unrecognized takes the exact same path as before
  // this endpoint had any translation awareness.
  @Public()
  @Get()
  async listOpen(@Query('locale') locale?: string) {
    const positions = await this.prisma.openPosition.findMany({
      where: { isOpen: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!locale || !TRANSLATABLE_LOCALES.includes(locale)) return positions;

    const translated = await this.translations.getTranslatedPositions(
      positions,
      locale,
    );
    return positions.map((p) => ({ ...p, ...translated.get(p.id) }));
  }

  @Roles(Role.admin)
  @Get('all')
  listAll() {
    return this.prisma.openPosition.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles(Role.admin)
  @Post()
  async create(@CurrentUser() admin: User, @Body() dto: CreatePositionDto) {
    const created = await this.prisma.openPosition.create({
      data: { ...dto, createdByAdminId: admin.id },
    });
    if (created.isOpen) {
      this.translations.triggerAsync(created, TRANSLATABLE_LOCALES); // fire-and-forget
    }
    return created;
  }

  @Roles(Role.admin)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    const updated = await this.prisma.openPosition.update({
      where: { id },
      data: dto,
    });
    // Triggered regardless of which fields changed — the hash check
    // inside triggerAsync/getTranslatedPositions makes a no-op retrigger
    // on an update that didn't touch title/description/department cheap
    // and correct, so there's no need to diff fields here.
    if (updated.isOpen) {
      this.translations.triggerAsync(updated, TRANSLATABLE_LOCALES); // fire-and-forget
    }
    return updated;
  }

  // Lets an admin force a specific translation to regenerate (e.g. to fix
  // a bad machine translation) without waiting for a content edit.
  @Roles(Role.admin)
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
