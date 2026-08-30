import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../common/constants/admin-roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqStatusDto } from './dto/update-rfq-status.dto';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { SEARCH_SCAN_LIMIT } from '../common/constants/search-scan-limit';
import { DEFAULT_PAGE_SIZE, paginate } from '../common/utils/paginate';
import { Role, type User } from '../generated/prisma';

@Controller('rfqs')
export class RfqController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(Role.client)
  @Post()
  async create(@CurrentUser() client: User, @Body() dto: CreateRfqDto) {
    if (dto.serviceId) {
      // Without this check, a stale/tampered/typo'd serviceId hits the
      // DB's foreign-key constraint directly — an unhandled
      // PrismaClientKnownRequestError isn't an HttpException, so the
      // global exception filter's catch-all turns it into a generic 500
      // instead of a clean 400. Confirmed live during a penetration test.
      const service = await this.prisma.service.findUnique({
        where: { id: dto.serviceId },
      });
      if (!service) throw new BadRequestException('Unknown serviceId');
    }
    return this.prisma.serviceRequest.create({
      data: {
        clientId: client.id,
        serviceId: dto.serviceId,
        projectDetails: dto.projectDetails,
      },
    });
  }

  @Roles(Role.client)
  @Get('mine')
  mine(@CurrentUser() client: User) {
    return this.prisma.serviceRequest.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
      include: { service: { select: { name: true, slug: true } } },
    });
  }

  // Fuzzy-matched in-app — see fuzzy-match.ts and the equivalent note on
  // AdminUsersController.list.
  @Roles(...ADMIN_ROLES)
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip = 0,
    @Query('take', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    take = DEFAULT_PAGE_SIZE,
  ) {
    const rfqs = await this.prisma.serviceRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: SEARCH_SCAN_LIMIT,
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
        },
        service: { select: { name: true, slug: true } },
      },
    });
    const filtered = q
      ? rfqs.filter((r) =>
          fuzzyMatch(
            searchableText(
              r.client.firstName,
              r.client.lastName,
              r.client.companyName,
              r.projectDetails,
            ),
            q,
          ),
        )
      : rfqs;
    return paginate(filtered, skip, take);
  }

  // Free to move between pending <-> in_review in either direction, but
  // once contactedAt is set the request is done — no further status
  // changes, matching the same finality contactedAt itself enforces
  // below. Without this guard an admin could still flip status after
  // marking contacted, which would contradict "contacted is final" from
  // the other side of the same row.
  @Roles(...ADMIN_ROLES)
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateRfqStatusDto,
  ) {
    // contactedAt: null has to live in the update's own `where` — a
    // separate findUnique-then-check leaves a window where two concurrent
    // requests can both read a null contactedAt before either write
    // commits, letting a status change through after the request was
    // already marked contacted. Same fix as appointments.controller.ts's
    // book().
    const updated = await this.prisma.serviceRequest.updateMany({
      where: { id, contactedAt: null },
      data: { status: dto.status },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.serviceRequest.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('RFQ not found');
      throw new BadRequestException(
        'This request has already been marked contacted and can no longer be changed.',
      );
    }
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'rfq.status_updated',
      targetType: 'ServiceRequest',
      targetId: id,
      metadata: { status: dto.status },
    });
    return this.prisma.serviceRequest.findUnique({ where: { id } });
  }

  // One-way, not a toggle — once a request is marked contacted, that's
  // final: no more status changes (see updateStatus's guard above) and no
  // un-marking. The frontend confirms with the admin before calling this,
  // since it can't be undone afterward.
  @Roles(...ADMIN_ROLES)
  @Patch(':id/contacted')
  async markContacted(@CurrentUser() admin: User, @Param('id') id: string) {
    // Same read-then-write race as updateStatus() above — the null check
    // has to live in the update's own `where`, not a separate read, or two
    // concurrent calls can both pass the guard and both fire the (final,
    // one-time) audit log entry below.
    const updated = await this.prisma.serviceRequest.updateMany({
      where: { id, contactedAt: null },
      data: { contactedAt: new Date() },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.serviceRequest.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('RFQ not found');
      throw new BadRequestException(
        'This request has already been marked contacted.',
      );
    }
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'rfq.contacted',
      targetType: 'ServiceRequest',
      targetId: id,
    });
    return this.prisma.serviceRequest.findUnique({ where: { id } });
  }
}
