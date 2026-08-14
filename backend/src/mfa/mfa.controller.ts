import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { Role, type User } from '../generated/prisma';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

// MFA is mandatory for admins only (docs/BUSINESS_RULES.md rule 2) —
// every route here is admin-only, enforced by the global RolesGuard.
// @MfaExempt() at the class level: MfaEnrolledGuard would otherwise lock
// an unenrolled admin out of the very endpoints they need to enroll
// through. The post-enrollment routes (webauthn/auth-*,
// admin-password-reset) are still safe to expose pre-enrollment since
// they require an already-registered credential to succeed at all.
@Controller('mfa')
@Roles(Role.admin)
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

  @Post('webauthn/auth-options')
  webauthnAuthOptions(@CurrentUser() user: User) {
    return this.mfa.webauthnAuthOptions(user);
  }

  // Not used by the admin-password-reset flow — that flow only calls
  // webauthn/auth-options for the challenge, then bundles the raw
  // response into POST /mfa/admin-password-reset directly, verifying via
  // the service method itself rather than this endpoint. This one is the
  // per-session MFA challenge (see MfaSessionVerifiedGuard): a successful
  // verification here always marks the *current* Clerk session as having
  // proven its second factor, since that's true regardless of why the
  // challenge was requested.
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

  // The TOTP counterpart to webauthn/auth-verify above — proves the
  // second factor for *this sign-in* (MfaSessionVerifiedGuard), distinct
  // from totp/confirm (one-time, at enrollment) and from the TOTP branch
  // of admin-password-reset (which re-verifies specifically to authorize
  // a password change, not to mark the session itself).
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
