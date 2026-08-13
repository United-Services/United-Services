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

  @Roles(Role.admin)
  @Get()
  list(@Query('q') q?: string) {
    return this.prisma.serviceRequest.findMany({
      where: q
        ? {
            OR: [
              { client: { firstName: { contains: q, mode: 'insensitive' } } },
              { client: { lastName: { contains: q, mode: 'insensitive' } } },
              { client: { companyName: { contains: q, mode: 'insensitive' } } },
              { projectDetails: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
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
}
