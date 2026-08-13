import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestDocumentsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
