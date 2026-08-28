import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { requestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { AllowedOriginsService } from './allowed-origins/allowed-origins.service';

// Every non-DI-registered piece of app setup lives here instead of inline in
// bootstrap(), so the e2e test harness (test/utils/bootstrap.ts) can call the
// exact same function and never drift out of sync with what production runs.
export function configureApp(app: NestExpressApplication): void {
  // Trust the single reverse-proxy hop in front of this app so req.ip
  // (used for rate limiting) reflects the real client. See docs/DEPLOYMENT.md
  // for the proxy topology.
  app.set('trust proxy', 1);

  // Registered before everything else that can short-circuit a request
  // (helmet's redirects aside, cookieParser/CORS/guards/throttling all
  // come after) so its res.on('finish') listener is attached — and thus
  // guaranteed to fire — no matter which layer downstream ends up
  // resolving the request.
  app.use(requestLoggingMiddleware);

  app.use(cookieParser());
  // gzip/brotli response compression. nginx.conf also compresses at the
  // edge in production — the two don't double-compress each other
  // (nginx skips a response that already carries Content-Encoding), so
  // this is the same defense-in-depth pattern as the security headers
  // above: nginx handles it in production, this covers the case where
  // the app is hit directly (local dev, health checks, no nginx layer).
  app.use(compression());
  app.use(
    helmet({
      // This process only ever serves JSON — no HTML, no inline scripts —
      // so the CSP can be maximally restrictive; there's nothing here that
      // needs 'unsafe-inline' or a third-party script/style source.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      // Force HTTPS on every subsequent request for a year, including
      // subdomains; safe in production (always served over TLS via nginx)
      // and a no-op in local dev since browsers ignore HSTS over plain
      // HTTP anyway.
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Origins are DB-backed now (AllowedOriginsService), not a static
  // CORS_ORIGINS env var that needed a redeploy to change — resolved via
  // app.get() since this function runs after NestFactory.create() has
  // already built the full DI graph. `isAllowed()` is a synchronous
  // in-memory check on the hot path (see that service's class comment);
  // this callback runs on every single cross-origin request.
  const allowedOrigins = app.get(AllowedOriginsService);
  app.enableCors({
    origin: (requestOrigin, callback) => {
      // No Origin header at all (same-origin requests, curl, server-to-
      // server calls) — nothing for CORS to restrict; only cross-origin
      // browser requests ever send this header.
      if (!requestOrigin) return callback(null, true);
      allowedOrigins
        .isAllowed(requestOrigin)
        .then((allowed) => callback(null, allowed))
        .catch((err) => callback(err));
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
