import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { matchesContentType } from '../common/utils/file-security';
import { DEFAULT_PAGE_SIZE } from '../common/utils/paginate';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { PresignTicketScreenshotDto } from './dto/presign-ticket-screenshot.dto';
import { Role, type User } from '../generated/prisma';

const ALLOWED_SCREENSHOT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const IMAGE_URL_TTL_SECONDS = 3600;

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditLog: AuditLogService,
  ) {}

  // Public and unauthenticated (a disabled/locked-out user may not be able
  // to make an authenticated request at all) — presign lands the
  // screenshot under pending/tickets/ before the ticket row even exists;
  // create() below validates and promotes it once the ticket has an id.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('presign')
  async presign(@Body() dto: PresignTicketScreenshotDto) {
    const extension = ALLOWED_SCREENSHOT_TYPES[dto.contentType];
    if (!extension) {
      throw new BadRequestException(
        'Unsupported contentType for a ticket screenshot',
      );
    }
    const key = `pending/tickets/${Date.now()}-${randomUUID()}.${extension}`;
    const url = await this.s3.createUploadUrl(key, dto.contentType);
    return { url, key };
  }

  // Public, unauthenticated, and the main abuse surface of this
  // controller (free-form text from anyone) — tightly throttled
  // accordingly, well below the presign/analytics-track limits.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async create(@Body() dto: CreateTicketDto) {
    if (
      dto.screenshotS3Key &&
      !dto.screenshotS3Key.startsWith('pending/tickets/')
    ) {
      throw new BadRequestException('Invalid screenshot reference');
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        name: dto.name,
        email: dto.email,
        company: dto.company,
        type: dto.type,
        details: dto.details,
      },
    });

    if (dto.screenshotS3Key) {
      const bytes = await this.s3.readLeadingBytes(dto.screenshotS3Key);
      const matchesAny = Object.keys(ALLOWED_SCREENSHOT_TYPES).some((type) =>
        matchesContentType(bytes, type),
      );
      if (!matchesAny) {
        await this.s3.deleteObject(dto.screenshotS3Key).catch(() => undefined);
        // The ticket itself is still useful without its screenshot — a
        // bad/mismatched image shouldn't lose the whole report, so this
        // isn't rolled back into a hard failure of the submission.
      } else {
        const permanentKey = `tickets/${ticket.id}/${dto.screenshotS3Key.slice('pending/tickets/'.length)}`;
        await this.s3.promoteUpload(dto.screenshotS3Key, permanentKey);
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { screenshotS3Key: permanentKey },
        });
      }
    }

    return { id: ticket.id };
  }

  // Priority order is the enum's own declaration order (technical,
  // disabled_account, non_technical — see schema.prisma) — Postgres
  // native enums sort by declared ordinal, not alphabetically, so this
  // ORDER BY alone gives the admin queue the right triage order.
  @Roles(Role.admin)
  @Get()
  async list(
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    take: number,
  ) {
    const rows = await this.prisma.ticket.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      skip,
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const items = await Promise.all(
      page.map(async (t) => ({
        ...t,
        screenshotUrl: t.screenshotS3Key
          ? await this.s3.createDownloadUrl(
              t.screenshotS3Key,
              IMAGE_URL_TTL_SECONDS,
            )
          : null,
      })),
    );

    return { items, hasMore };
  }

  // Toggles, not one-way — an admin can mark a ticket back to
  // "uncontacted" if that turns out to be a mistake (see schema.prisma's
  // comment on Ticket.contactedAt). Resolving (below) is the only
  // irreversible action.
  @Roles(Role.admin)
  @Patch(':id/contacted')
  async toggleContacted(@CurrentUser() admin: User, @Param('id') id: string) {
    const existing = await this.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ticket not found');

    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: { contactedAt: existing.contactedAt ? null : new Date() },
    });

    await this.auditLog.record({
      actorUserId: admin.id,
      action: ticket.contactedAt ? 'ticket.contacted' : 'ticket.uncontacted',
      targetType: 'Ticket',
      targetId: id,
      metadata: {},
    });

    return ticket;
  }

  // Irreversible: deletes the ticket (and its screenshot) outright rather
  // than storing a "resolved" status — same DB-delete-first,
  // best-effort-S3-cleanup-after pattern as
  // services.controller.ts's remove().
  @Roles(Role.admin)
  @Delete(':id')
  async resolve(@CurrentUser() admin: User, @Param('id') id: string) {
    const existing = await this.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ticket not found');

    await this.prisma.ticket.delete({ where: { id } });

    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'ticket.resolved',
      targetType: 'Ticket',
      targetId: id,
      metadata: { type: existing.type, email: existing.email },
    });

    if (existing.screenshotS3Key) {
      await this.s3
        .deleteObject(existing.screenshotS3Key)
        .catch(() => undefined);
    }

    return { ok: true };
  }
}
