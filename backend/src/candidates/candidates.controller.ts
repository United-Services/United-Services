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
import { RequestDocumentsDto } from './dto/request-documents.dto';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
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

  // Fuzzy-matched in-app — see fuzzy-match.ts and the equivalent note on
  // AdminUsersController.list.
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('status') status?: ApplicationStatus,
  ) {
    const applications = await this.prisma.candidateApplication.findMany({
      where: status ? { status } : {},
      orderBy: { id: 'desc' },
      include: {
        candidateUser: {
          select: { firstName: true, lastName: true, email: true },
        },
        position: { select: { title: true, department: true } },
      },
    });
    if (!q) return applications;
    return applications.filter((a) =>
      fuzzyMatch(
        searchableText(
          a.candidateUser.firstName,
          a.candidateUser.lastName,
          a.candidateUser.email,
        ),
        q,
      ),
    );
  }

  @Get(':id/documents')
  async documents(@Param('id') id: string) {
    const application = await this.prisma.candidateApplication.findUnique({
      where: { id },
      include: {
        otherDocuments: {
          select: { id: true, originalFilename: true, s3Key: true },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });
    if (!application) throw new NotFoundException('Application not found');

    // Either document may not have been uploaded yet — the candidate
    // dashboard lets them upload ID/CV after signup, not during it.
    const [idPhotoUrl, cvUrl, otherDocuments] = await Promise.all([
      application.idPhotoS3Key
        ? this.s3.createDownloadUrl(
            application.idPhotoS3Key,
            DOCUMENT_URL_TTL_SECONDS,
          )
        : Promise.resolve(null),
      application.cvS3Key
        ? this.s3.createDownloadUrl(
            application.cvS3Key,
            DOCUMENT_URL_TTL_SECONDS,
          )
        : Promise.resolve(null),
      Promise.all(
        application.otherDocuments.map(async (doc) => ({
          id: doc.id,
          originalFilename: doc.originalFilename,
          url: await this.s3.createDownloadUrl(
            doc.s3Key,
            DOCUMENT_URL_TTL_SECONDS,
          ),
        })),
      ),
    ]);
    return {
      idPhotoUrl,
      cvUrl,
      otherDocuments,
      expiresInSeconds: DOCUMENT_URL_TTL_SECONDS,
    };
  }

  // Lets an admin ask a candidate to (re-)submit a document — surfaced as
  // a banner + optional note on the candidate's own dashboard. Cleared
  // automatically the next time the candidate uploads anything (see
  // MeController.uploadDocuments).
  @Patch(':id/request-documents')
  async requestDocuments(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: RequestDocumentsDto,
  ) {
    const updated = await this.prisma.candidateApplication.update({
      where: { id },
      data: {
        documentsRequested: true,
        documentsRequestedNote: dto.note ?? null,
        documentsRequestedAt: new Date(),
      },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'candidate.documents_requested',
      targetType: 'CandidateApplication',
      targetId: id,
    });
    return updated;
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
