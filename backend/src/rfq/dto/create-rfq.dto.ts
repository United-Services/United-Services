import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRfqDto {
  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsString()
  @MaxLength(4000)
  projectDetails!: string;
}
