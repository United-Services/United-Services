import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Service } from '../s3/s3.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PresignUploadDto } from './dto/presign-upload.dto';
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
};

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

    // Lands under pending/ — a presigned PUT URL is reusable until it
    // expires, not single-use, so this key is never trusted/referenced
    // directly by anything else. Once its content passes validation (see
    // MeController.uploadDocuments), it's promoted to its permanent,
    // no-longer-presign-writable key and this one is deleted — closing
    // the window where the object could be silently swapped after being
    // validated.
    // The timestamp is kept for readability/ordering; randomUUID() is what
    // actually makes the key unguessable (defense-in-depth — nothing
    // should be reachable by key alone, but it shouldn't be enumerable
    // either).
    const key = `pending/candidates/${user.id}/${dto.kind}-${Date.now()}-${randomUUID()}.${extension}`;
    const url = await this.s3.createUploadUrl(key, dto.contentType);
    return { url, key };
  }
}
