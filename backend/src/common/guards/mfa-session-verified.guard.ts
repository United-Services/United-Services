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
import type { User } from '../../generated/prisma';
import { isAdminRole } from '../constants/admin-roles';

// Requires a fresh per-session MFA challenge (see MfaService.markSessionVerified).
// Runs after MfaEnrolledGuard in the chain (see app.module.ts).
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
    if (!user || !isAdminRole(user.role)) return true;
    if (!user.mfaEnrolled) return true; // MfaEnrolledGuard already rejected this case

    if (!sessionId || !(await this.mfa.isSessionVerified(sessionId))) {
      throw new ForbiddenException(
        'MFA verification required for this session',
      );
    }
    return true;
  }
}
