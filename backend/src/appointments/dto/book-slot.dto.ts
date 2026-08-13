import { IsString } from 'class-validator';

export class BookSlotDto {
  @IsString()
  slotId!: string;
}
