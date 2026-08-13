import {
  IsIn,
  IsObject,
  IsString,
  Length,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Admin password reset never goes through an email link — a fresh MFA
// verification (TOTP code or WebAuthn assertion) must accompany the new
// password in the same request. See docs/BUSINESS_RULES.md rule 7.
export class AdminPasswordResetDto {
  @MinLength(8)
  newPassword!: string;

  @IsIn(['totp', 'webauthn'])
  method!: 'totp' | 'webauthn';

  @ValidateIf((o: AdminPasswordResetDto) => o.method === 'totp')
  @IsString()
  @Length(6, 6)
  totpCode?: string;

  @ValidateIf((o: AdminPasswordResetDto) => o.method === 'webauthn')
  @IsObject()
  webauthnResponse?: object;
}
