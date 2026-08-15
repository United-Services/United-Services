import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateFileAccessRequestDto } from './dto/create-file-access-request.dto';
import { DecideFileAccessRequestDto } from './dto/decide-file-access-request.dto';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { FileAccessStatus, Role, type User } from '../generated/prisma';

const DOWNLOAD_URL_TTL_SECONDS = 300;

// The full request -> admin approval -> short-lived presigned download
// flow. A request can only ever be approved by an admin (never
// auto-approved) and a client can only ever see/act on their own requests.
// See docs/BUSINESS_RULES.md rules 1 and 3.
@Controller('file-access-requests')
export class FileAccessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(Role.client)
  @Post()
  async create(
    @CurrentUser() client: User,
    @Body() dto: CreateFileAccessRequestDto,
  ) {
    const existing = await this.prisma.fileAccessRequest.findFirst({
      where: {
        clientId: client.id,
        serviceFileId: dto.serviceFileId,
        status: { in: [FileAccessStatus.pending, FileAccessStatus.approved] },
      },
    });
    if (existing)
      throw new ConflictException(
        'You already have a pending or approved request for this file',
      );

    return this.prisma.fileAccessRequest.create({
      data: { clientId: client.id, serviceFileId: dto.serviceFileId },
    });
  }

  @Roles(Role.client)
  @Get('mine')
  mine(@CurrentUser() client: User) {
    return this.prisma.fileAccessRequest.findMany({
      where: { clientId: client.id },
      orderBy: { requestedAt: 'desc' },
      include: {
        serviceFile: {
          include: { service: { select: { name: true, slug: true } } },
        },
      },
    });
  }

  // Fuzzy-matched in-app — see fuzzy-match.ts and the equivalent note on
  // AdminUsersController.list.
  @Roles(Role.admin)
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('status') status?: FileAccessStatus,
  ) {
    const requests = await this.prisma.fileAccessRequest.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: 'desc' },
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
        },
        serviceFile: {
          include: { service: { select: { name: true, slug: true } } },
        },
      },
    });
    if (!q) return requests;
    return requests.filter((r) =>
      fuzzyMatch(
        searchableText(
          r.client.firstName,
          r.client.lastName,
          r.client.email,
          r.client.companyName,
          r.serviceFile.originalFilename,
        ),
        q,
      ),
    );
  }

  @Roles(Role.admin)
  @Post(':id/decide')
  async decide(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: DecideFileAccessRequestDto,
  ) {
    const request = await this.prisma.fileAccessRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException('Request not found');

    const updated = await this.prisma.fileAccessRequest.update({
      where: { id },
      data: {
        status: dto.approve
          ? FileAccessStatus.approved
          : FileAccessStatus.denied,
        decidedAt: new Date(),
        decidedByAdminId: admin.id,
      },
    });

    await this.auditLog.record({
      actorUserId: admin.id,
      action: dto.approve ? 'file_access.approved' : 'file_access.denied',
      targetType: 'FileAccessRequest',
      targetId: id,
      metadata: {
        clientId: request.clientId,
        serviceFileId: request.serviceFileId,
      },
    });

    return updated;
  }

  @Get(':id/download')
  async download(@CurrentUser() user: User, @Param('id') id: string) {
    const request = await this.prisma.fileAccessRequest.findUnique({
      where: { id },
      include: { serviceFile: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (user.role !== Role.admin && request.clientId !== user.id) {
      throw new ForbiddenException('This request does not belong to you');
    }
    if (request.status !== FileAccessStatus.approved) {
      throw new ForbiddenException('This request has not been approved');
    }

    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000);
    const url = await this.s3.createDownloadUrl(
      request.serviceFile.s3Key,
      DOWNLOAD_URL_TTL_SECONDS,
    );

    await this.prisma.fileAccessRequest.update({
      where: { id },
      data: { downloadTokenExpiresAt: expiresAt },
    });
    await this.auditLog.record({
      actorUserId: user.id,
      action: 'file_access.download_issued',
      targetType: 'FileAccessRequest',
      targetId: id,
    });

    return { url, expiresAt };
  }
}
