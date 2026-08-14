import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Populated by ClerkAuthGuard from the verified token's `sid` claim — the
// Clerk session id, distinct from the user id. Used to scope MFA
// re-verification to "once per sign-in", not once per user forever: see
// MfaSessionVerifiedGuard.
export const CurrentSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { sessionId: string }>();
    return request.sessionId;
  },
);
