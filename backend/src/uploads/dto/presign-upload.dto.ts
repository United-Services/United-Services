import { IsIn, IsString, Matches } from 'class-validator';

export class PresignUploadDto {
  @IsIn(['candidate-id-photo', 'candidate-cv', 'candidate-other-document'])
  kind!: 'candidate-id-photo' | 'candidate-cv' | 'candidate-other-document';

  @IsString()
  @Matches(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/, {
    message: 'contentType must be a valid MIME type',
  })
  contentType!: string;
}
