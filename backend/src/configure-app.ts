import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

// Every non-DI-registered piece of app setup (main.ts's imperative
// app.use()/app.set()/app.useGlobalPipes() calls) lives here instead of
// inline in bootstrap(), specifically so the e2e test harness
// (test/utils/bootstrap.ts) can call the exact same function and never
// silently drift out of sync with what production actually runs. This is
// not a hypothetical risk: it already happened once — the e2e test
// bootstrap only replicated `setGlobalPrefix` and every e2e test
// (including the pre-existing health check) ran with NO ValidationPipe
// active at all, meaning `whitelist`/`forbidNonWhitelisted` was never
// actually being exercised by a single test in this repo despite looking
// like it was.
export function configureApp(app: NestExpressApplication): void {
  // nginx (nginx.conf) sits in front of this app and is the only hop
  // between it and the internet, correctly appending $remote_addr to
  // X-Forwarded-For rather than trusting a client-supplied value outright.
  // Without `trust proxy`, Express's req.ip (what the global throttler
  // keys rate limits on) resolves to nginx's own address for every
  // request regardless of client — collapsing every user into one shared
  // rate-limit bucket instead of limiting each client independently.
  // `1` trusts exactly one hop back, matching nginx being the sole proxy.
  app.set('trust proxy', 1);

  app.use(cookieParser());
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

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
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
