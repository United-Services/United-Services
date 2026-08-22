import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export class MultipartCreateServiceFileDto {
  @IsString()
  @MaxLength(200)
  filename!: string;

  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: 'contentType must be one of the accepted document types',
  })
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  fileSize!: number;
}
