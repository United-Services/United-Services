import { IsIn, IsInt, Max, Min } from 'class-validator';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class MultipartCreateServiceImageDto {
  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: 'contentType must be one of image/jpeg, image/png, image/webp',
  })
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  fileSize!: number;
}
