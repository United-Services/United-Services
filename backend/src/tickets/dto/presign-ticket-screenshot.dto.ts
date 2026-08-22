import { IsIn } from 'class-validator';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class PresignTicketScreenshotDto {
  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: 'contentType must be one of image/jpeg, image/png, image/webp',
  })
  contentType!: string;
}
