import { IsBoolean } from 'class-validator';

export class DecideFileAccessRequestDto {
  @IsBoolean()
  approve!: boolean;
}
