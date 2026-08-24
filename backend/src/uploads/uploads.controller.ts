import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Service } from '../s3/s3.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { MultipartCreateDto } from './dto/multipart-create.dto';
import {
  MultipartAbortDto,
  MultipartCompleteDto,
  MultipartPresignPartDto,
} from './dto/multipart-part.dto';
import type { User } from '../generated/prisma';

// contentType is client-reported, so it's only ever used to pick a safe,
// server-controlled extension for the S3 key — never trusted for anything
// else (e.g. Content-Type on the object is still what S3 was told at PUT
// time by the presigned URL itself).
const ALLOWED_CONTENT_TYPES: Record<
  PresignUploadDto['kind'],
  Record<string, string>
> = {
  'candidate-id-photo': { 'image/jpeg': 'jpg', 'image/png': 'png' },
  'candidate-cv': {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
  },
  // Free-form supporting documents (transcript, certificate, portfolio,
  // etc.) — a superset of the CV/ID formats since we don't know in advance
  // what an admin might ask a candidate to submit.
  'candidate-other-document': {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  },
};

// Enforced both here (fail fast, before any bytes are sent) and nowhere
// else server-side otherwise — S3 itself has no opinion on this.
const MAX_BYTES: Record<PresignUploadDto['kind'], number> = {
  'candidate-id-photo': 8 * 1024 * 1024,
  'candidate-cv': 15 * 1024 * 1024,
  'candidate-other-document': 20 * 1024 * 1024,
};

function keyBelongsToUser(key: string, userId: string): boolean {
  return key.startsWith(`pending/candidates/${userId}/`);
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly s3: S3Service) {}

  @Post('presign')
  async presign(@CurrentUser() user: User, @Body() dto: PresignUploadDto) {
    const extension = ALLOWED_CONTENT_TYPES[dto.kind]?.[dto.contentType];
    if (!extension)
      throw new BadRequestException(
        'Unsupported contentType for this upload kind',
      );

    // Lands under pending/ until validated and promoted — see
    // MeController.uploadDocuments.
    const key = `pending/candidates/${user.id}/${dto.kind}-${Date.now()}-${randomUUID()}.${extension}`;
    const url = await this.s3.createUploadUrl(key, dto.contentType);
    return { url, key };
  }

  // --- Multipart upload: same key scheme and content-type allowlist as
  // presign() above, but chunked so a dropped connection only costs the
  // client the parts it hadn't finished yet, not the whole file.

  @Post('multipart/create')
  async multipartCreate(
    @CurrentUser() user: User,
    @Body() dto: MultipartCreateDto,
  ) {
    const extension = ALLOWED_CONTENT_TYPES[dto.kind]?.[dto.contentType];
    if (!extension)
      throw new BadRequestException(
        'Unsupported contentType for this upload kind',
      );
    const limit = MAX_BYTES[dto.kind];
    if (dto.fileSize > limit) {
      throw new BadRequestException(
        `File is too large — the limit for this upload is ${Math.floor(limit / (1024 * 1024))}MB`,
      );
    }

    const key = `pending/candidates/${user.id}/${dto.kind}-${Date.now()}-${randomUUID()}.${extension}`;
    const uploadId = await this.s3.createMultipartUpload(key, dto.contentType);
    return { key, uploadId };
  }

  @Post('multipart/presign-part')
  async multipartPresignPart(
    @CurrentUser() user: User,
    @Body() dto: MultipartPresignPartDto,
  ) {
    if (!keyBelongsToUser(dto.key, user.id)) {
      throw new ForbiddenException('Upload does not belong to you');
    }
    const url = await this.s3.presignUploadPart(
      dto.key,
      dto.uploadId,
      dto.partNumber,
    );
    return { url };
  }

  @Post('multipart/complete')
  async multipartComplete(
    @CurrentUser() user: User,
    @Body() dto: MultipartCompleteDto,
  ) {
    if (!keyBelongsToUser(dto.key, user.id)) {
      throw new ForbiddenException('Upload does not belong to you');
    }
    await this.s3.completeMultipartUpload(
      dto.key,
      dto.uploadId,
      dto.parts.map((p) => ({ partNumber: p.partNumber, eTag: p.eTag })),
    );
    return { key: dto.key };
  }

  @Post('multipart/abort')
  async multipartAbort(
    @CurrentUser() user: User,
    @Body() dto: MultipartAbortDto,
  ) {
    if (!keyBelongsToUser(dto.key, user.id)) {
      throw new ForbiddenException('Upload does not belong to you');
    }
    await this.s3.abortMultipartUpload(dto.key, dto.uploadId);
    return { ok: true };
  }
}
