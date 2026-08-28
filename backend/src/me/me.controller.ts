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
import { createClerkClient } from '@clerk/backend';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentSessionId } from '../common/decorators/current-session-id.decorator';
import { MfaExempt } from '../common/decorators/mfa-exempt.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { MfaService } from '../mfa/mfa.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BecomeCandidateDto } from './dto/become-candidate.dto';
import { UploadCandidateDocumentsDto } from './dto/upload-candidate-documents.dto';
import { UploadOtherDocumentDto } from './dto/upload-other-document.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Role, type User } from '../generated/prisma';
import { matchesContentType } from '../common/utils/file-security';

type CandidateUploadKind =
  'candidate-id-photo' | 'candidate-cv' | 'candidate-other-document';

// Mirrors the extension the server picked in UploadsController for each
// upload kind — used both to enforce the key belongs to this user/kind and
// to know which magic-byte signature to expect.
const CANDIDATE_UPLOAD_TYPES: Record<CandidateUploadKind, string[]> = {
  'candidate-id-photo': ['image/jpeg', 'image/png'],
  'candidate-cv': [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  'candidate-other-document': [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
  ],
};

// Validates a pending upload (ownership + magic-byte content check) and,
// if it passes, promotes it to its permanent key and returns that key.
async function promoteValidatedCandidateUpload(
  s3: S3Service,
  userId: string,
  kind: CandidateUploadKind,
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
  private readonly clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly mfa: MfaService,
  ) {}

  // Exempt from MFA guards to avoid a lockout loop before an admin has
  // enrolled/verified. Returns only basic profile/role info.
  @MfaExempt()
  @Get()
  async me(@CurrentUser() user: User, @CurrentSessionId() sessionId: string) {
    return this.toDto(user, sessionId);
  }

  // Exempt from MFA guards for the same reason as me() above: the
  // dashboard redirect (frontend app/[locale]/dashboard/page.tsx) sends
  // *every* role here first whenever mustChangePassword is true —
  // including a brand-new admin account, which at that point has
  // mfaEnrolled=false and hasn't reached MFA setup yet. That bootstrap
  // case can't require a current password (there isn't a real one yet)
  // or a fresh MFA session (nothing to verify against yet), so it has to
  // stay reachable here regardless of role.
  //
  // What must NOT be reachable here: an already-set-up admin
  // (mustChangePassword already false) rotating their password with
  // nothing but a stolen session cookie and zero fresh-MFA proof — that
  // silently defeats MfaSessionVerifiedGuard via @MfaExempt() and is a
  // full account-takeover primitive (new password + signOutOfOtherSessions
  // in one unauthenticated-beyond-the-cookie request), directly against
  // docs/BUSINESS_RULES.md rule 7 ("admin password reset requires a
  // fresh MFA verification"). Those admins are pointed at the dedicated,
  // correctly-gated path instead: MfaController.resetPassword
  // (POST /mfa/admin-password-reset), which requires a fresh TOTP/WebAuthn
  // verification in the same request and audit-logs the change — unlike
  // this endpoint, which does neither.
  @MfaExempt()
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
  ) {
    if (user.role === Role.admin && !user.mustChangePassword) {
      throw new ForbiddenException(
        'Admin accounts must change their password via a fresh MFA verification — use POST /mfa/admin-password-reset',
      );
    }
    await this.clerkClient.users.updateUser(user.clerkId, {
      password: dto.newPassword,
      signOutOfOtherSessions: true,
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
    return { success: true };
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
      include: {
        position: { select: { title: true, department: true } },
        otherDocuments: {
          select: { id: true, originalFilename: true, uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });
    if (!application) throw new NotFoundException('No application found');
    return {
      id: application.id,
      status: application.status,
      hasIdPhoto: application.idPhotoS3Key !== null,
      hasCv: application.cvS3Key !== null,
      otherDocuments: application.otherDocuments,
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

  // Lets a candidate attach additional supporting documents (transcript,
  // certificate, portfolio, etc.) beyond the fixed ID/CV slots — unlike
  // uploadDocuments above, each call adds a new row rather than replacing
  // one. Also clears a pending "documents requested" flag, same reasoning
  // as uploadDocuments.
  @Post('candidate-documents/other')
  async uploadOtherDocument(
    @CurrentUser() user: User,
    @Body() dto: UploadOtherDocumentDto,
  ) {
    if (user.role !== Role.candidate) {
      throw new ForbiddenException(
        'Only candidate accounts can upload documents',
      );
    }
    const application = await this.prisma.candidateApplication.findUnique({
      where: { candidateUserId: user.id },
    });
    if (!application) throw new NotFoundException('No application found');

    const s3Key = await promoteValidatedCandidateUpload(
      this.s3,
      user.id,
      'candidate-other-document',
      dto.s3Key,
    );

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.candidateDocument.create({
        data: {
          applicationId: application.id,
          s3Key,
          originalFilename: dto.originalFilename,
        },
      });
      await tx.candidateApplication.update({
        where: { id: application.id },
        data: { documentsRequested: false, documentsRequestedNote: null },
      });
      return created;
    });

    return {
      id: document.id,
      originalFilename: document.originalFilename,
      uploadedAt: document.uploadedAt,
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
      mustChangePassword: user.mustChangePassword,
      mfaSessionVerified: sessionId
        ? await this.mfa.isSessionVerified(sessionId)
        : false,
    };
  }
}
