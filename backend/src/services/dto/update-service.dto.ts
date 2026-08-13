import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Admin-editable content for a service. Deliberately excludes slug/iconKey
// (structural identifiers, not marketing copy).
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  longDescription?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
