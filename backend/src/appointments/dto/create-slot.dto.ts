import { IsDateString } from 'class-validator';

export class CreateSlotDto {
  @IsDateString()
  date!: string;

  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;
}
