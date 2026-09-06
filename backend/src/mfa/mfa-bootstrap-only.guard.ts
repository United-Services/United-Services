import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { MfaService } from './mfa.service';
import type { User } from '../generated/prisma';

// Guards the routes that ADD, REPLACE or DELETE an MFA factor.
//
// MfaController is @MfaExempt() at class level, and has to be: an admin
// who hasn't enrolled yet must be able to reach the enrollment routes
// (MfaEnrolledGuard would otherwise 403 them), and an enrolled admin
// whose session isn't verified yet must be able to reach the challenge
// routes (MfaSessionVerifiedGuard would otherwise 403 them). But that
// blanket exemption also covered enrollment for an ALREADY-enrolled
// admin — so anyone holding a stolen admin session cookie, with no
// second factor at all, could POST /mfa/totp/enroll (which upserts over
// the confirmed secret), confirm with their own authenticator, pass the
// challenge, and hold a fully MFA-verified session. MFA was defeatable
// by the enrollment endpoint itself.
//
// This closes that: a factor can be added/replaced/removed with no MFA
// session only while the account has NO factor yet (bootstrap — there
// is nothing to challenge). Once mfaEnrolled is true, the exact check
// MfaSessionVerifiedGuard applies everywhere else applies here too. The
// legitimate replace-your-authenticator flow (AdminSecuritySection)
// runs from inside the admin dashboard, which already required a
// verified session to reach, so it is unaffected.
@Injectable()
export class MfaBootstrapOnlyGuard implements CanActivate {
  constructor(private readonly mfa: MfaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: User; sessionId?: string }>();
    const { user, sessionId } = request;
    // ClerkAuthGuard runs earlier in the global chain and rejects
    // unauthenticated requests before any route guard; this is only a
    // defensive fallthrough, never the auth boundary.
    if (!user) return true;
    if (!user.mfaEnrolled) return true;

    if (!sessionId || !(await this.mfa.isSessionVerified(sessionId))) {
      throw new ForbiddenException(
        'MFA verification required for this session',
      );
    }
    return true;
  }
}
