import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { requestLoggingMiddleware } from './common/middleware/request-logging.middleware';

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
  // nginx (nginx.conf) is this app's only direct hop — the ONE thing that
  // connects straight to it. Without `trust proxy`, Express's req.ip
  // (what the global throttler keys rate limits on) resolves to nginx's
  // own address for every request regardless of client, collapsing every
  // user into one shared rate-limit bucket. `1` trusts exactly that one
  // hop's X-Forwarded-For entry.
  //
  // Production (docs/DEPLOYMENT.md) puts Cloudflare in front of nginx too
  // — a SECOND hop before the request reaches this app — but that does
  // NOT mean this needs to become `trust proxy: 2`. nginx.conf's
  // `set_real_ip_from`/`real_ip_header CF-Connecting-IP` resolves
  // Cloudflare's hop *at the nginx layer*: for a connection genuinely
  // from a Cloudflare edge IP, nginx rewrites $remote_addr to the real
  // visitor IP before building the X-Forwarded-For value it sends
  // onward — so from this app's perspective there is still exactly one
  // hop (nginx) asserting the client IP, whether or not Cloudflare is
  // live in front of it.
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
