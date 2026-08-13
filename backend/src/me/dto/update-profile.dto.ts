import { IsOptional, IsString, MaxLength } from 'class-validator';

// Deliberately has no `role` field — role changes never go through this
// endpoint. See docs/BUSINESS_RULES.md.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}
