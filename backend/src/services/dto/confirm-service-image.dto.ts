import { IsString, MaxLength } from 'class-validator';

export class ConfirmServiceImageDto {
  @IsString()
  @MaxLength(500)
  s3Key!: string;
}
