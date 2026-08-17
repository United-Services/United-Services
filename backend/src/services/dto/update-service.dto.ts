import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// Admin-editable content for a service. Deliberately excludes slug/iconKey
// (structural identifiers, not marketing copy) and imageS3Key (set only
// via the presign/confirm image-upload flow, never a raw field edit).
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
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  specs?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
