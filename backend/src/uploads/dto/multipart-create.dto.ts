import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';
import type { PresignUploadDto } from './presign-upload.dto';

export class MultipartCreateDto {
  @IsIn(['candidate-id-photo', 'candidate-cv', 'candidate-other-document'])
  kind!: PresignUploadDto['kind'];

  @IsString()
  @Matches(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/, {
    message: 'contentType must be a valid MIME type',
  })
  contentType!: string;

  // Declared upfront so an oversized file is rejected before any bytes are
  // sent, rather than discovered only after a slow multi-part upload
  // completes.
  @IsInt()
  @Min(1)
  @Max(200 * 1024 * 1024)
  fileSize!: number;
}
