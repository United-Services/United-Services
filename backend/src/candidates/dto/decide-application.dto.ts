import { IsBoolean } from 'class-validator';

export class DecideApplicationDto {
  @IsBoolean()
  approve!: boolean;
}
