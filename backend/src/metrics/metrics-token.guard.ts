import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

// GET /metrics is @Public() (Prometheus can't do a Clerk session), but
// it exposes per-route request-rate/latency data and BullMQ queue
// depths — enough to fingerprint traffic patterns — so it still needs
// its own gate rather than being wide open on the public internet. A
// static bearer token checked with a constant-time compare (a plain
// `===` on secrets leaks timing information an attacker can use to
// guess it byte-by-byte) is deliberately simpler than real auth here:
// Prometheus's own scrape config only supports a static
// `authorization.credentials`, not a session/refresh flow, so anything
// more elaborate wouldn't actually be usable from the scraper side
// anyway. See prometheus/prometheus.yml for the client-side config this
// pairs with.
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  private readonly logger = new Logger(MetricsTokenGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.METRICS_TOKEN;
    // Fails CLOSED, not open: an unset token must never mean "anyone can
    // read /metrics," which is the opposite of every other secret-gated
    // route in this app (compare KekKeyStore, ClerkWebhookController).
    if (!expected) {
      this.logger.error(
        'METRICS_TOKEN is not set — refusing every /metrics request rather than serving it unauthenticated.',
      );
      return false;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const provided = header?.startsWith('Bearer ')
      ? header.slice(7)
      : undefined;
    if (!provided) {
      throw new UnauthorizedException('Missing bearer token');
    }

    // timingSafeEqual throws if the buffers differ in length, and a
    // length mismatch is itself a valid (if weak) timing signal — hash
    // both sides to a fixed length first so the comparison itself never
    // reveals how close a guess's length was, only whether it matched.
    const a = hash(provided);
    const b = hash(expected);
    if (!timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid bearer token');
    }
    return true;
  }
}

function hash(value: string): Buffer {
  // Uses the platform's crypto hash rather than importing a whole extra
  // dependency for what's just "normalize to a fixed-length buffer
  // before a constant-time compare" — sha256 collision resistance is
  // overkill for this, but it's already in Node core and free.
  return createHash('sha256').update(value).digest();
}
