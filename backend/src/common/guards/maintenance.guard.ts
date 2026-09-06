import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';

// Redis key whose presence puts the API into write-maintenance. Set it
// with `SET maintenance:writes-disabled 1` at the start of a planned
// database cutover and DEL it at the end — see docs/DISASTER_RECOVERY.md
// "Planned database cutover". Redis is the right home for the flag: it
// is already a hard dependency, and it survives the very database swap
// this exists to protect.
export const MAINTENANCE_FLAG_KEY = 'maintenance:writes-disabled';
const RETRY_AFTER_SECONDS = 120;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Write-only maintenance mode. Reads keep serving; every mutating
// request gets a 503 with Retry-After and a message the frontend can
// surface as a banner, instead of either landing on a database that is
// about to be abandoned (lost) or failing with a 500 (the two outcomes
// a cutover produced before this existed — there was no maintenance or
// read-only mode anywhere in the codebase).
//
// Registered FIRST in the APP_GUARD chain: it must be cheap and must
// run before ClerkAuthGuard's DB round trip, since the whole point is
// to not touch the database.
//
// Fails OPEN. If Redis itself is unreachable, the flag is assumed
// absent — a Redis outage must not turn into a write outage, and the
// throttler makes the same call for the same reason.
@Injectable()
export class MaintenanceGuard implements CanActivate {
  private readonly logger = new Logger(MaintenanceGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    let active: boolean;
    try {
      active = (await this.redis.get(MAINTENANCE_FLAG_KEY)) !== null;
    } catch (err) {
      this.logger.error(
        `Could not read the maintenance flag — assuming not in maintenance: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
    if (!active) return true;

    http.getResponse<Response>().setHeader('Retry-After', String(RETRY_AFTER_SECONDS));
    throw new ServiceUnavailableException({
      statusCode: 503,
      error: 'Service Unavailable',
      message:
        'The service is briefly read-only for scheduled maintenance. Please retry in a couple of minutes — nothing you entered has been lost.',
      maintenance: true,
    });
  }
}
