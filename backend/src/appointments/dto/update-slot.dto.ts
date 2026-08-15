import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class UpdateSlotDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  // Hides the slot from GET /appointments/slots (the public/client-facing
  // availability list) regardless of isBooked — see schema.prisma's
  // comment on AppointmentSlot.isClosed.
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
