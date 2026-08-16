import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const COOLDOWN_SECONDS = 15 * 60; // one page per distinct failing route per 15 min
const COOLDOWN_KEY_PREFIX = 'alert:cooldown:';

// Pages a real phone via Betterstack's Uptime/On-Call Incident API the
// moment a genuine 5xx happens — a log line alone doesn't wake anyone up
// unless a log-based alert rule is configured (fragile, easy to silently
// break). This calls the incident API directly instead.
//
// Off by default everywhere except a real server that explicitly opts in
// (ALERTING_ENABLED=true) — without that, every local dev exception while
// actively coding would otherwise page whoever's on call.
@Injectable()
export class IncidentAlertService {
  private readonly logger = new Logger(IncidentAlertService.name);
  private readonly enabled: boolean;
  private readonly apiToken: string | undefined;
  private readonly requesterEmail: string | undefined;

  constructor(private readonly redis: RedisService) {
    this.enabled = process.env.ALERTING_ENABLED === 'true';
    this.apiToken = process.env.BETTERSTACK_INCIDENT_API_TOKEN;
    this.requesterEmail = process.env.BETTERSTACK_REQUESTER_EMAIL;
  }

  // Never throws — a failure to page must never become a second unhandled
  // exception on top of the one that triggered this call.
  async trigger(params: {
    route: string;
    method: string;
    statusCode: number;
    errorMessage: string;
    requestId?: string;
  }): Promise<void> {
    if (!this.enabled) return;
    if (!this.apiToken || !this.requesterEmail) {
      this.logger.warn(
        'ALERTING_ENABLED=true but BETTERSTACK_INCIDENT_API_TOKEN or BETTERSTACK_REQUESTER_EMAIL is missing — cannot page.',
      );
      return;
    }

    try {
      // Dedup per route+method, not globally — a broken RFQ endpoint and a
      // broken appointments endpoint failing at the same time should both
      // page, but the same endpoint failing repeatedly should page once.
      const cooldownKey = `${COOLDOWN_KEY_PREFIX}${params.method}:${params.route}`;
      const acquired = await this.redis.set(
        cooldownKey,
        '1',
        'EX',
        COOLDOWN_SECONDS,
        'NX',
      );
      if (acquired !== 'OK') {
        this.logger.debug(`Alert suppressed (cooldown active): ${cooldownKey}`);
        return;
      }

      const res = await fetch('https://uptime.betterstack.com/api/v2/incidents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requester_email: this.requesterEmail,
          name: `500 on ${params.method} ${params.route}`,
          summary: params.errorMessage.slice(0, 500),
          description: [
            `Status: ${params.statusCode}`,
            `Route: ${params.method} ${params.route}`,
            params.requestId ? `Request ID: ${params.requestId}` : null,
            `Environment: ${process.env.NODE_ENV}`,
          ]
            .filter(Boolean)
            .join('\n'),
        }),
      });

      if (!res.ok) {
        this.logger.error(
          `Betterstack incident API returned ${res.status}: ${await res.text()}`,
        );
      }
    } catch (err) {
      // Swallow — see the doc comment above. Still logged, so it's visible
      // in Betterstack Logs (the one channel still working if this fails).
      this.logger.error('Failed to trigger incident alert', err as Error);
    }
  }
}
