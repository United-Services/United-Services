import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { MFA_EXEMPT_KEY } from '../decorators/mfa-exempt.decorator';
import { Role, type User } from '../../generated/prisma';

// The /admin-mfa-setup redirect in the frontend is a UX nudge, not an
// authorization boundary — a raw HTTP request to any admin-only endpoint
// would previously succeed for an admin account that has never completed
// TOTP/WebAuthn enrollment. This guard closes that gap server-side.
// Runs after RolesGuard in the chain (see app.module.ts), so any request
// reaching here that belongs to a non-admin has already been rejected;
// this guard only ever needs to gate admin accounts.
@Injectable()
export class MfaEnrolledGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isExempt = this.reflector.getAllAndOverride<boolean>(MFA_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isExempt) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: User }>();
    if (!user || user.role !== Role.admin) return true;

    if (!user.mfaEnrolled) {
      throw new ForbiddenException(
        'MFA enrollment required before accessing this resource',
      );
    }
    return true;
  }
}
