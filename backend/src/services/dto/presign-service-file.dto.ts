import { IsIn, IsString, MaxLength } from 'class-validator';

// Kept in sync with ALLOWED_SERVICE_FILE_TYPES in services.controller.ts —
// duplicated here (rather than imported) so the DTO gives a clean 400 with
// a specific message before the controller even runs.
const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export class PresignServiceFileDto {
  @IsString()
  @MaxLength(200)
  filename!: string;

  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: 'contentType must be one of the accepted document types',
  })
  contentType!: string;
}
