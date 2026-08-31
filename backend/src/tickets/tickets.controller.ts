import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { matchesContentType } from '../common/utils/file-security';
import { DEFAULT_PAGE_SIZE, paginate } from '../common/utils/paginate';
import { SEARCH_SCAN_LIMIT } from '../common/constants/search-scan-limit';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import {
  TICKET_ARCHIVE_QUEUE,
  type TicketArchiveJobData,
} from '../queue/queue.tokens';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { PresignTicketScreenshotDto } from './dto/presign-ticket-screenshot.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { Role, TicketStatus, type User } from '../generated/prisma';

const ALLOWED_SCREENSHOT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const IMAGE_URL_TTL_SECONDS = 3600;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditLog: AuditLogService,
    @Inject(TICKET_ARCHIVE_QUEUE)
    private readonly archiveQueue: Queue<TicketArchiveJobData>,
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
      const size = await this.s3.getObjectSize(dto.screenshotS3Key);
      const bytes = await this.s3.readLeadingBytes(dto.screenshotS3Key);
      const matchesAny = Object.keys(ALLOWED_SCREENSHOT_TYPES).some((type) =>
        matchesContentType(bytes, type),
      );
      if (size > MAX_SCREENSHOT_BYTES || !matchesAny) {
        await this.s3.deleteObject(dto.screenshotS3Key).catch(() => undefined);
        // The ticket itself is still useful without its screenshot — an
        // oversized or bad/mismatched image shouldn't lose the whole
        // report, so this isn't rolled back into a hard failure of the
        // submission.
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
  // ORDER BY alone gives the admin queue the right triage order. `q`
  // fuzzy-matches name/email/company/details over a bounded scan, same
  // in-app-filter-then-paginate pattern as every other searchable admin
  // list (see SEARCH_SCAN_LIMIT) — pushing this particular sort into SQL
  // while still supporting fuzzy search would mean duplicating the
  // priority ORDER BY as a raw query; simpler to keep everything on the
  // one established pattern.
  //
  // Exclusively super_admin — NOT ADMIN_ROLES/Role.admin. This is one of
  // the two features (see AuditLogController for the other) deliberately
  // kept out of a regular admin's reach.
  @Roles(Role.super_admin)
  @Get()
  async list(
    @Query('q') q: string | undefined,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    take: number,
  ) {
    const rows = await this.prisma.ticket.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      take: SEARCH_SCAN_LIMIT,
    });
    const filtered = q
      ? rows.filter((t) =>
          fuzzyMatch(searchableText(t.name, t.email, t.company, t.details), q),
        )
      : rows;
    const { items: page, hasMore } = paginate(filtered, skip, take);

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

  // Freely switchable between unresolved and contacted in either
  // direction, but resolved is terminal (docs/BUSINESS_RULES.md rule
  // 20) — the moment a ticket is resolved it's archived and its
  // screenshot deleted (TicketArchiveWorker), so there's nothing left to
  // switch back from. The terminal guard has to live in the update's own
  // `where`, not a preceding read — a separate findUnique-then-check
  // leaves a window where two concurrent requests could both read
  // "not yet resolved" before either write commits, letting a second
  // request reopen a ticket that's already being archived. Same fix as
  // appointments.controller.ts's book() and every other decide-style
  // endpoint in this codebase. `contactedAt` is set the first time
  // status ever moves to `contacted` and never cleared afterward, even
  // if later switched away — it's a "when were they first reached"
  // record, not the current state (status is).
  //
  // Exclusively super_admin — see the comment on list() above.
  @Roles(Role.super_admin)
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    const existing = await this.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ticket not found');

    const now = new Date();
    const contactedAt =
      dto.status === TicketStatus.contacted && !existing.contactedAt
        ? now
        : existing.contactedAt;
    const resolvedAt =
      dto.status === TicketStatus.resolved ? now : existing.resolvedAt;

    const updated = await this.prisma.ticket.updateMany({
      where: { id, status: { not: TicketStatus.resolved } },
      data: { status: dto.status, contactedAt, resolvedAt },
    });
    if (updated.count === 0) {
      throw new ConflictException(
        'This ticket has already been resolved and archived — its status can no longer be changed.',
      );
    }

    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'ticket.status_updated',
      targetType: 'Ticket',
      targetId: id,
      metadata: { from: existing.status, to: dto.status },
    });

    if (dto.status === TicketStatus.resolved) {
      // Archival (and the S3 screenshot deletion) happens off the
      // request path — this admin's PATCH shouldn't wait on an S3 call.
      // Retries/DLQ are TicketArchiveWorker's job; the periodic sweep
      // (TicketArchiveService.archiveAllResolved) is the backstop if
      // this enqueue itself is ever lost.
      await this.archiveQueue.add(
        'archive-ticket',
        { ticketId: id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86_400 },
        },
      );
    }

    return { ...existing, status: dto.status, contactedAt, resolvedAt };
  }
}
