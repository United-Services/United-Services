import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MultipartPresignPartDto {
  @IsString()
  key!: string;

  @IsString()
  uploadId!: string;

  @IsInt()
  @Min(1)
  partNumber!: number;
}

class CompletedPartDto {
  @IsInt()
  @Min(1)
  partNumber!: number;

  @IsString()
  eTag!: string;
}

export class MultipartCompleteDto {
  @IsString()
  key!: string;

  @IsString()
  uploadId!: string;

  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  @ArrayMinSize(1)
  parts!: CompletedPartDto[];
}

export class MultipartAbortDto {
  @IsString()
  key!: string;

  @IsString()
  uploadId!: string;
}
