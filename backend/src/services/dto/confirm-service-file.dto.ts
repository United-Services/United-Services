import { IsString, MaxLength } from 'class-validator';

export class ConfirmServiceFileDto {
  @IsString()
  @MaxLength(500)
  s3Key!: string;

  @IsString()
  @MaxLength(200)
  originalFilename!: string;
}
