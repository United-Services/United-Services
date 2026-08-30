import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import { MfaService } from './mfa.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentSessionId } from '../common/decorators/current-session-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MfaExempt } from '../common/decorators/mfa-exempt.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TotpCodeDto } from './dto/totp.dto';
import {
  WebAuthnAuthVerifyDto,
  WebAuthnRegisterVerifyDto,
} from './dto/webauthn.dto';
import { AdminPasswordResetDto } from './dto/admin-password-reset.dto';
import type { User } from '../generated/prisma';
import { ADMIN_ROLES } from '../common/constants/admin-roles';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

// MFA is mandatory for admin and super_admin only (docs/BUSINESS_RULES.md
// rule 2) — every route here is admin/super_admin-only, enforced by the
// global RolesGuard. super_admin goes through the exact same enrollment
// and per-session challenge flow, not a separate one. See
// MfaEnrolledGuard for why this controller is @MfaExempt().
@Controller('mfa')
@Roles(...ADMIN_ROLES)
@MfaExempt()
export class MfaController {
  private readonly clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  constructor(
    private readonly mfa: MfaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: User) {
    return this.mfa.status(user);
  }

  @Post('totp/enroll')
  enrollTotp(@CurrentUser() user: User) {
    return this.mfa.enrollTotp(user);
  }

  @Post('totp/confirm')
  confirmTotp(@CurrentUser() user: User, @Body() dto: TotpCodeDto) {
    return this.mfa.confirmTotp(user, dto.code);
  }

  // Self-service: an admin removing their own authenticator app enrollment.
  // MfaService rejects this if it would leave the account with zero
  // working MFA methods.
  @Delete('totp')
  async deleteTotp(@CurrentUser() user: User) {
    const result = await this.mfa.deleteTotpCredential(user);
    await this.auditLog.record({
      actorUserId: user.id,
      action: 'admin.totp_credential_deleted',
      targetType: 'TotpCredential',
      targetId: user.id,
    });
    return result;
  }

  @Post('webauthn/register-options')
  webauthnRegisterOptions(@CurrentUser() user: User) {
    return this.mfa.webauthnRegisterOptions(user);
  }

  @Post('webauthn/register-verify')
  webauthnRegisterVerify(
    @CurrentUser() user: User,
    @Body() dto: WebAuthnRegisterVerifyDto,
  ) {
    return this.mfa.webauthnRegisterVerify(
      user,
      dto.response as RegistrationResponseJSON,
      dto.label,
    );
  }

  // Self-service: an admin removing one of their own credentials, e.g. to
  // replace it (enroll a new one, then delete the old). MfaService rejects
  // this if it would leave the account with zero working MFA methods.
  @Delete('webauthn/:id')
  async deleteWebauthn(@CurrentUser() user: User, @Param('id') id: string) {
    const result = await this.mfa.deleteWebauthnCredential(user, id);
    await this.auditLog.record({
      actorUserId: user.id,
      action: 'admin.webauthn_credential_deleted',
      targetType: 'WebAuthnCredential',
      targetId: id,
    });
    return result;
  }

  @Post('webauthn/auth-options')
  webauthnAuthOptions(@CurrentUser() user: User) {
    return this.mfa.webauthnAuthOptions(user);
  }

  // Per-session MFA challenge (see MfaSessionVerifiedGuard).
  @Post('webauthn/auth-verify')
  async webauthnAuthVerify(
    @CurrentUser() user: User,
    @CurrentSessionId() sessionId: string,
    @Body() dto: WebAuthnAuthVerifyDto,
  ) {
    const verified = await this.mfa.webauthnAuthVerify(
      user,
      dto.response as AuthenticationResponseJSON,
    );
    if (verified) await this.mfa.markSessionVerified(sessionId);
    return { verified };
  }

  // TOTP counterpart to webauthn/auth-verify above.
  @Post('challenge/totp')
  async challengeTotp(
    @CurrentUser() user: User,
    @CurrentSessionId() sessionId: string,
    @Body() dto: TotpCodeDto,
  ) {
    const verified = await this.mfa.verifyTotp(user, dto.code);
    if (!verified) throw new BadRequestException('Invalid code');
    await this.mfa.markSessionVerified(sessionId);
    return { verified: true };
  }

  // Admin password reset never uses an email link — a fresh MFA
  // verification must accompany the new password in the same request.
  // See docs/BUSINESS_RULES.md rule 7.
  @Post('admin-password-reset')
  async resetPassword(
    @CurrentUser() user: User,
    @Body() dto: AdminPasswordResetDto,
  ) {
    const verified =
      dto.method === 'totp'
        ? await this.mfa.verifyTotp(user, dto.totpCode!)
        : await this.mfa.webauthnAuthVerify(
            user,
            dto.webauthnResponse as AuthenticationResponseJSON,
          );

    if (!verified) throw new BadRequestException('MFA verification failed');

    await this.clerkClient.users.updateUser(user.clerkId, {
      password: dto.newPassword,
      signOutOfOtherSessions: true,
    });

    await this.auditLog.record({
      actorUserId: user.id,
      action: 'admin.password_reset',
      targetType: 'User',
      targetId: user.id,
    });

    return { success: true };
  }
}
