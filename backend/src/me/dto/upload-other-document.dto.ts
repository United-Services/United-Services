import { IsString, MaxLength } from 'class-validator';

export class UploadOtherDocumentDto {
  @IsString()
  s3Key!: string;

  // Display name only — never used to derive a path or trusted for
  // anything security-relevant (the actual S3 key is server-generated).
  @IsString()
  @MaxLength(255)
  originalFilename!: string;
}
