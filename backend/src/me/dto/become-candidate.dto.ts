import { IsDateString, IsOptional, IsString } from 'class-validator';

// Signup only collects identity info — ID photo and CV are uploaded later
// from the candidate's own dashboard, not at signup time.
export class BecomeCandidateDto {
  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  positionId?: string;
}
