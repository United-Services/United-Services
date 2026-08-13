import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackEventDto {
  @IsString()
  @MaxLength(80)
  eventType!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
