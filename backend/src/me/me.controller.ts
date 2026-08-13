import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BecomeCandidateDto } from './dto/become-candidate.dto';
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

async function assertOwnedCandidateUpload(
  s3: S3Service,
  userId: string,
  kind: 'candidate-id-photo' | 'candidate-cv',
  key: string,
): Promise<void> {
  if (!key.startsWith(`candidates/${userId}/${kind}-`)) {
    throw new BadRequestException('Uploaded file does not belong to you');
  }
  const bytes = await s3.readLeadingBytes(key);
  const matches = CANDIDATE_UPLOAD_TYPES[kind].some((type) =>
    matchesContentType(bytes, type),
  );
  if (!matches) {
    await s3.deleteObject(key).catch(() => undefined);
    throw new BadRequestException(
      'Uploaded file content does not match an accepted format',
    );
  }
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
  ) {}

  @Get()
  me(@CurrentUser() user: User) {
    return this.toDto(user);
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
  // 'candidate', paired with creating the CandidateApplication row
  // atomically. Only ever reachable from 'client' — an admin account can
  // never reach this path, closing off any privilege-escalation route.
  @Post('become-candidate')
  async becomeCandidate(
    @CurrentUser() user: User,
    @Body() dto: BecomeCandidateDto,
  ) {
    if (user.role !== Role.client) {
      throw new ForbiddenException(
        'Only client accounts can apply as a candidate',
      );
    }

    await Promise.all([
      assertOwnedCandidateUpload(
        this.s3,
        user.id,
        'candidate-id-photo',
        dto.idPhotoS3Key,
      ),
      assertOwnedCandidateUpload(this.s3, user.id, 'candidate-cv', dto.cvS3Key),
    ]);

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
            idPhotoS3Key: dto.idPhotoS3Key,
            cvS3Key: dto.cvS3Key,
            dateOfBirth: new Date(dto.dateOfBirth),
          },
        }),
      ]);
      return { user: this.toDto(updatedUser), applicationId: application.id };
    } catch {
      throw new ConflictException(
        'An application already exists for this account',
      );
    }
  }

  private toDto(user: User) {
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      mfaEnrolled: user.mfaEnrolled,
    };
  }
}
