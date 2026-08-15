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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqStatusDto } from './dto/update-rfq-status.dto';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { Role, type User } from '../generated/prisma';

@Controller('rfqs')
export class RfqController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(Role.client)
  @Post()
  create(@CurrentUser() client: User, @Body() dto: CreateRfqDto) {
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
  @Roles(Role.admin)
  @Get()
  async list(@Query('q') q?: string) {
    const rfqs = await this.prisma.serviceRequest.findMany({
      orderBy: { createdAt: 'desc' },
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
    if (!q) return rfqs;
    return rfqs.filter((r) =>
      fuzzyMatch(
        searchableText(
          r.client.firstName,
          r.client.lastName,
          r.client.companyName,
          r.projectDetails,
        ),
        q,
      ),
    );
  }

  @Roles(Role.admin)
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateRfqStatusDto,
  ) {
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'rfq.status_updated',
      targetType: 'ServiceRequest',
      targetId: id,
      metadata: { status: dto.status },
    });
    return updated;
  }

  // Toggle, not a one-way transition — an admin can un-mark a request they
  // flagged as contacted by mistake. Independent of `status` (see
  // schema.prisma's comment on ServiceRequest.contactedAt).
  @Roles(Role.admin)
  @Patch(':id/contacted')
  async toggleContacted(@CurrentUser() admin: User, @Param('id') id: string) {
    const existing = await this.prisma.serviceRequest.findUniqueOrThrow({
      where: { id },
      select: { contactedAt: true },
    });
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: { contactedAt: existing.contactedAt ? null : new Date() },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'rfq.contacted_toggled',
      targetType: 'ServiceRequest',
      targetId: id,
      metadata: { contactedAt: updated.contactedAt },
    });
    return updated;
  }
}
