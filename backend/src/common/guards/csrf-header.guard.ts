import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CSRF_EXEMPT_KEY } from '../decorators/csrf-exempt.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// ClerkAuthGuard authenticates state-changing requests off the __session
// cookie alone (checked before the Authorization header — see
// extractToken()), and this API is called with axios's withCredentials:
// true. A cookie-only auth story is vulnerable to CSRF: a plain
// cross-site HTML <form method="POST"> auto-attaches the cookie and needs
// no preflight for a simple content-type, so cookie presence alone can't
// distinguish our own frontend from an attacker's page.
//
// This guard closes that gap the same way most cookie-authenticated APIs
// do: require a custom header on every state-changing request. A bare
// HTML form cannot set custom headers, so this is enough to block the
// classic form-based CSRF vector without needing a token-issuance round
// trip. The frontend's shared axios instance (frontend/src/lib/api.ts)
// sends this header on every request.
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const isExempt = this.reflector.getAllAndOverride<boolean>(
      CSRF_EXEMPT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isExempt) return true;

    if (request.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw new ForbiddenException('Missing CSRF protection header');
    }
    return true;
  }
}
