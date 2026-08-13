import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class WebAuthnRegisterVerifyDto {
  @IsObject()
  response!: object;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;
}

export class WebAuthnAuthVerifyDto {
  @IsObject()
  response!: object;
}
