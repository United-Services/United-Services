import {
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { ADMIN_ROLES, isAdminRole } from '../common/constants/admin-roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateFileAccessRequestDto } from './dto/create-file-access-request.dto';
import { DecideFileAccessRequestDto } from './dto/decide-file-access-request.dto';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { SEARCH_SCAN_LIMIT } from '../common/constants/search-scan-limit';
import { DEFAULT_PAGE_SIZE, paginate } from '../common/utils/paginate';
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
  @Roles(...ADMIN_ROLES)
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('status') status?: FileAccessStatus,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip = 0,
    @Query('take', new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    take = DEFAULT_PAGE_SIZE,
  ) {
    const requests = await this.prisma.fileAccessRequest.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: 'desc' },
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
        serviceFile: {
          include: { service: { select: { name: true, slug: true } } },
        },
      },
    });
    const filtered = q
      ? requests.filter((r) =>
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
        )
      : requests;
    return paginate(filtered, skip, take);
  }

  @Roles(...ADMIN_ROLES)
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
    // A decision is final — the admin UI already hides the approve/deny
    // buttons once status !== 'pending' (adminShared.tsx's ActionPair, used
    // by AdminRequestsSection), so a second decide() call reaching the
    // backend means either a replayed request or two admins racing on the
    // same request. Either way it must not silently overwrite the original
    // decidedByAdminId/decidedAt. Same bug class fixed in
    // candidates.controller.ts's decide().
    if (request.status !== FileAccessStatus.pending) {
      throw new ConflictException('This request has already been decided.');
    }

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
    if (!isAdminRole(user.role) && request.clientId !== user.id) {
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
