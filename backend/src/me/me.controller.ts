import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentSessionId } from '../common/decorators/current-session-id.decorator';
import { MfaExempt } from '../common/decorators/mfa-exempt.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { MfaService } from '../mfa/mfa.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BecomeCandidateDto } from './dto/become-candidate.dto';
import { UploadCandidateDocumentsDto } from './dto/upload-candidate-documents.dto';
import { Role, type User } from '../generated/prisma';
import { matchesContentType } from '../common/utils/file-security';

// Mirrors the extension the server picked in UploadsController for each
// upload kind — used both to enforce the key belongs to this user/kind and
// to know which magic-byte signature to expect.
const CANDIDATE_UPLOAD_TYPES: Record<
  'candidate-id-photo' | 'candidate-cv',
  string[]
> = {
  'candidate-id-photo': ['image/jpeg', 'image/png'],
  'candidate-cv': [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

// Validates a pending upload (ownership + magic-byte content check) and,
// if it passes, promotes it to its permanent key and returns that key.
// The presigned PUT URL that wrote `pendingKey` is reusable until it
// expires (S3 presigned URLs are not single-use) — validating content
// once and then continuing to trust `pendingKey` forever would let an
// attacker re-PUT different content to the same key after this check
// already passed. Promoting to a fresh, non-presign-writable key and
// deleting the pending object closes that window: nothing ever stores or
// serves `pendingKey` again after this call returns.
async function promoteValidatedCandidateUpload(
  s3: S3Service,
  userId: string,
  kind: 'candidate-id-photo' | 'candidate-cv',
  pendingKey: string,
): Promise<string> {
  const expectedPrefix = `pending/candidates/${userId}/${kind}-`;
  if (!pendingKey.startsWith(expectedPrefix)) {
    throw new BadRequestException('Uploaded file does not belong to you');
  }
  const bytes = await s3.readLeadingBytes(pendingKey);
  const matches = CANDIDATE_UPLOAD_TYPES[kind].some((type) =>
    matchesContentType(bytes, type),
  );
  if (!matches) {
    await s3.deleteObject(pendingKey).catch(() => undefined);
    throw new BadRequestException(
      'Uploaded file content does not match an accepted format',
    );
  }

  const permanentKey = pendingKey.slice('pending/'.length);
  await s3.promoteUpload(pendingKey, permanentKey);
  return permanentKey;
}

// The only source of truth the frontend's post-sign-in redirect relies on —
// req.user was populated by ClerkAuthGuard from our own User table, not a
// raw Clerk claim, so this genuinely re-checks the DB on every call. See
// docs/BUSINESS_RULES.md.
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly mfa: MfaService,
  ) {}

  // Exempt from MfaEnrolledGuard *and* MfaSessionVerifiedGuard: the
  // frontend's /dashboard redirect calls this first to decide where an
  // admin should go, including whether that's /admin-mfa-setup
  // (me.mfaEnrolled === false) or /admin-mfa-challenge
  // (me.mfaSessionVerified === false) in the first place. Without this
  // exemption an admin's very first request in either state 403s here,
  // before ever learning where to go — a lockout, not a security
  // boundary. Returns only basic profile/role info (toDto below), nothing
  // admin-privileged, so this doesn't weaken what either guard actually
  // protects.
  @MfaExempt()
  @Get()
  async me(@CurrentUser() user: User, @CurrentSessionId() sessionId: string) {
    return this.toDto(user, sessionId);
  }

  // Client-only self-service profile completion, called right after
  // sign-up. Has no `role` field on its DTO by design — role changes never
  // flow through here.
  @Patch()
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: dto,
    });
    return this.toDto(updated);
  }

  // One-time self-service transition from the default 'client' role to
  // 'candidate' (every new sign-in self-heals to 'client' by default — see
  // ClerkAuthGuard — so this is the only path that ever produces a
  // 'candidate' account), paired with creating the CandidateApplication row
  // atomically. Only ever reachable from 'client', closing off any
  // privilege-escalation route (an admin account can never reach this
  // path). Deliberately does NOT accept document uploads — ID photo and CV
  // are uploaded afterward from the candidate's own dashboard via
  // uploadDocuments() below, not collected at signup.
  @Post('become-candidate')
  async becomeCandidate(
    @CurrentUser() user: User,
    @Body() dto: BecomeCandidateDto,
  ) {
    if (user.role !== Role.client) {
      throw new ForbiddenException(
        'This account has already applied as a candidate, or cannot apply',
      );
    }

    try {
      const [updatedUser, application] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: { role: Role.candidate },
        }),
        this.prisma.candidateApplication.create({
          data: {
            candidateUserId: user.id,
            positionId: dto.positionId,
            dateOfBirth: new Date(dto.dateOfBirth),
          },
        }),
      ]);
      return {
        user: await this.toDto(updatedUser),
        applicationId: application.id,
      };
    } catch {
      throw new ConflictException(
        'An application already exists for this account',
      );
    }
  }

  // Candidate dashboard status view — a candidate's own application, never
  // another candidate's (candidateUserId is always scoped to the caller,
  // never taken from the request).
  @Get('candidate-application')
  async myCandidateApplication(@CurrentUser() user: User) {
    if (user.role !== Role.candidate) {
      throw new ForbiddenException(
        'Only candidate accounts have an application',
      );
    }
    const application = await this.prisma.candidateApplication.findUnique({
      where: { candidateUserId: user.id },
      include: { position: { select: { title: true, department: true } } },
    });
    if (!application) throw new NotFoundException('No application found');
    return {
      id: application.id,
      status: application.status,
      hasIdPhoto: application.idPhotoS3Key !== null,
      hasCv: application.cvS3Key !== null,
      documentsRequested: application.documentsRequested,
      documentsRequestedNote: application.documentsRequestedNote,
      position: application.position,
    };
  }

  // Lets a candidate upload (or replace) their ID photo and/or CV after
  // signup, from their own dashboard. Uploading anything clears a pending
  // "documents requested" flag from an admin, since that's what it was
  // asking for.
  @Post('candidate-documents')
  async uploadDocuments(
    @CurrentUser() user: User,
    @Body() dto: UploadCandidateDocumentsDto,
  ) {
    if (user.role !== Role.candidate) {
      throw new ForbiddenException(
        'Only candidate accounts can upload documents',
      );
    }
    if (!dto.idPhotoS3Key && !dto.cvS3Key) {
      throw new BadRequestException(
        'Provide at least one of idPhotoS3Key or cvS3Key',
      );
    }

    const [idPhotoS3Key, cvS3Key] = await Promise.all([
      dto.idPhotoS3Key
        ? promoteValidatedCandidateUpload(
            this.s3,
            user.id,
            'candidate-id-photo',
            dto.idPhotoS3Key,
          )
        : Promise.resolve(undefined),
      dto.cvS3Key
        ? promoteValidatedCandidateUpload(
            this.s3,
            user.id,
            'candidate-cv',
            dto.cvS3Key,
          )
        : Promise.resolve(undefined),
    ]);

    const updated = await this.prisma.candidateApplication.update({
      where: { candidateUserId: user.id },
      data: {
        ...(idPhotoS3Key ? { idPhotoS3Key } : {}),
        ...(cvS3Key ? { cvS3Key } : {}),
        documentsRequested: false,
        documentsRequestedNote: null,
      },
    });
    return {
      hasIdPhoto: updated.idPhotoS3Key !== null,
      hasCv: updated.cvS3Key !== null,
    };
  }

  // sessionId is only ever passed from me() — the other two callers
  // (updateProfile, becomeCandidate) are client/candidate-only paths
  // where mfaSessionVerified is meaningless, so they skip the Redis
  // round-trip entirely rather than pass a sessionId nothing will read.
  private async toDto(user: User, sessionId?: string) {
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      mfaEnrolled: user.mfaEnrolled,
      mfaSessionVerified: sessionId
        ? await this.mfa.isSessionVerified(sessionId)
        : false,
    };
  }
}
