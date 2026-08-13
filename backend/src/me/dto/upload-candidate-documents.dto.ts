import { IsOptional, IsString } from 'class-validator';

// At least one of these must be present — enforced in the controller
// (class-validator doesn't have a clean "at least one of" out of the box)
// so a candidate can update just their CV, just their ID photo, or both in
// one call.
export class UploadCandidateDocumentsDto {
  @IsOptional()
  @IsString()
  idPhotoS3Key?: string;

  @IsOptional()
  @IsString()
  cvS3Key?: string;
}
