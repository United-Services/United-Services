import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

// A new service's structural identifier — set once here, excluded from
// UpdateServiceDto same as iconKey (see that file's comment). Lowercase
// letters/digits/hyphens only so it's always safe to use as-is in a URL
// path (/services/:slug) with no encoding.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CreateServiceDto {
  @IsString()
  @MaxLength(200)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase letters, digits, and hyphens only',
  })
  slug!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(200)
  shortDescription!: string;

  @IsString()
  @MaxLength(4000)
  longDescription!: string;

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
