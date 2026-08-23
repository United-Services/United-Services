import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '../../generated/prisma';

// Global access log for every API endpoint, wired in via app.use() in
// configure-app.ts — deliberately plain Express middleware, not a Nest
// interceptor. Interceptors sit downstream of every APP_GUARD
// (CsrfHeaderGuard, ClerkAuthGuard, RolesGuard, ThrottlerGuard, ...), so
// a request a guard rejects (401/403/429) never reaches one — this
// app.use() is the one place upstream of all of that, guaranteeing every
// request gets logged regardless of how it was resolved.
//
// Ships to Betterstack the same as every other `new Logger(...)` call in
// this codebase (see BetterstackLogger, wired in as the app's logger in
// main.ts). Separate concern from AllExceptionsFilter, which only logs
// (and pages on) 5xx failures in detail — this logs the outcome of every
// request, success or not, as one line, without a stack trace each time.
const logger = new Logger('RequestLog');

// Polled continuously by uptime monitoring and carries no diagnostic
// value line-by-line.
const SKIP_PATHS = new Set(['/api/v1/health']);

export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const start = Date.now();
  // `finish` fires once Express has actually written the response and
  // res.statusCode is settled — a guard's rejection, the controller's own
  // return, and AllExceptionsFilter's error response all end up here the
  // same way, so this one listener genuinely covers every outcome.
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const userId = (req as Request & { user?: User }).user?.id;
    const line = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)${userId ? ` [user:${userId}]` : ''}`;

    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });

  next();
}
