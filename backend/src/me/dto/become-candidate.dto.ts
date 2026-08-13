import { IsDateString, IsOptional, IsString } from 'class-validator';

export class BecomeCandidateDto {
  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  idPhotoS3Key!: string;

  @IsString()
  cvS3Key!: string;

  @IsOptional()
  @IsString()
  positionId?: string;
}
