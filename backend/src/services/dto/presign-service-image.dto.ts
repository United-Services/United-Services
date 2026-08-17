import { IsIn } from 'class-validator';

// Kept in sync with ALLOWED_SERVICE_IMAGE_TYPES in services.controller.ts —
// duplicated here (rather than imported) so the DTO gives a clean 400 with
// a specific message before the controller even runs.
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class PresignServiceImageDto {
  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: 'contentType must be one of image/jpeg, image/png, image/webp',
  })
  contentType!: string;
}
