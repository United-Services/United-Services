import { IsString, Matches, MaxLength } from 'class-validator';

export class PresignServiceFileDto {
  @IsString()
  @MaxLength(200)
  filename!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/, {
    message: 'contentType must be a valid MIME type',
  })
  contentType!: string;
}
