import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DecideApplicationDto } from './dto/decide-application.dto';
import { ApplicationStatus, Role, type User } from '../generated/prisma';

const DOCUMENT_URL_TTL_SECONDS = 300;

// Candidate applications are always reviewed by a human admin — no
// auto-approval path. See docs/BUSINESS_RULES.md rule 5.
@Roles(Role.admin)
@Controller('candidate-applications')
export class CandidatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  list(@Query('q') q?: string, @Query('status') status?: ApplicationStatus) {
    return this.prisma.candidateApplication.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q
          ? {
              candidateUser: {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      include: {
        candidateUser: {
          select: { firstName: true, lastName: true, email: true },
        },
        position: { select: { title: true, department: true } },
      },
    });
  }

  @Get(':id/documents')
  async documents(@Param('id') id: string) {
    const application = await this.prisma.candidateApplication.findUnique({
      where: { id },
    });
    if (!application) throw new NotFoundException('Application not found');

    const [idPhotoUrl, cvUrl] = await Promise.all([
      this.s3.createDownloadUrl(
        application.idPhotoS3Key,
        DOCUMENT_URL_TTL_SECONDS,
      ),
      this.s3.createDownloadUrl(application.cvS3Key, DOCUMENT_URL_TTL_SECONDS),
    ]);
    return { idPhotoUrl, cvUrl, expiresInSeconds: DOCUMENT_URL_TTL_SECONDS };
  }

  @Patch(':id/decide')
  async decide(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: DecideApplicationDto,
  ) {
    const updated = await this.prisma.candidateApplication.update({
      where: { id },
      data: {
        status: dto.approve
          ? ApplicationStatus.approved
          : ApplicationStatus.denied,
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
      },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: dto.approve ? 'candidate.approved' : 'candidate.denied',
      targetType: 'CandidateApplication',
      targetId: id,
    });
    return updated;
  }
}
