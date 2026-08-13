import { IsString } from 'class-validator';

export class CreateFileAccessRequestDto {
  @IsString()
  serviceFileId!: string;
}
