import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePositionDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsString()
  @MaxLength(80)
  department!: string;
}

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
