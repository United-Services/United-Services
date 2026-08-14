import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { MFA_EXEMPT_KEY } from '../decorators/mfa-exempt.decorator';
import { MfaService } from '../../mfa/mfa.service';
import { Role, type User } from '../../generated/prisma';

// MfaEnrolledGuard only ever checks that an admin has completed
// enrollment *at some point in the past* — it says nothing about whether
// *this particular sign-in* proved the second factor. Without this guard,
// an admin who enrolled once would never be asked to prove it again on
// any future login: mfaEnrolled stays true forever, so every new session
// would sail straight through. This guard requires a fresh MFA challenge
// once per Clerk session (see MfaService.markSessionVerified) — enrolling
// is a one-time setup; verifying is required on every sign-in.
// Runs after MfaEnrolledGuard in the chain (see app.module.ts): an
// unenrolled admin is already rejected there with the "please enroll"
// message, so this only ever needs to gate enrolled admins.
@Injectable()
export class MfaSessionVerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly mfa: MfaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isExempt = this.reflector.getAllAndOverride<boolean>(MFA_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isExempt) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: User; sessionId?: string }>();
    const { user, sessionId } = request;
    if (!user || user.role !== Role.admin) return true;
    if (!user.mfaEnrolled) return true; // MfaEnrolledGuard already rejected this case

    if (!sessionId || !(await this.mfa.isSessionVerified(sessionId))) {
      throw new ForbiddenException(
        'MFA verification required for this session',
      );
    }
    return true;
  }
}
