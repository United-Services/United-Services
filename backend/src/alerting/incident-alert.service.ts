import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const COOLDOWN_SECONDS = 15 * 60;
const COOLDOWN_KEY_PREFIX = 'alert:cooldown:';

// Pages a real phone via ntfy.sh when a genuine 5xx happens. See
// docs/CREDENTIALS_CHECKLIST.md for NTFY_TOPIC_URL setup. Off by default;
// requires ALERTING_ENABLED=true to opt in.
@Injectable()
export class IncidentAlertService {
  private readonly logger = new Logger(IncidentAlertService.name);
  private readonly enabled: boolean;
  private readonly topicUrl: string | undefined;

  constructor(private readonly redis: RedisService) {
    this.enabled = process.env.ALERTING_ENABLED === 'true';
    this.topicUrl = process.env.NTFY_TOPIC_URL;
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
    if (!this.topicUrl) {
      this.logger.warn(
        'ALERTING_ENABLED=true but NTFY_TOPIC_URL is missing — cannot page.',
      );
      return;
    }

    try {
      // Dedup per route+method, not globally.
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

      const body = [
        `Status: ${params.statusCode}`,
        `Route: ${params.method} ${params.route}`,
        params.requestId ? `Request ID: ${params.requestId}` : null,
        `Environment: ${process.env.NODE_ENV}`,
        '',
        params.errorMessage.slice(0, 500),
      ]
        .filter((line) => line !== null)
        .join('\n');

      const res = await fetch(this.topicUrl, {
        method: 'POST',
        headers: {
          Title: `500 on ${params.method} ${params.route}`,
          Priority: '5',
          Tags: 'rotating_light',
        },
        body,
      });

      if (!res.ok) {
        this.logger.error(`ntfy returned ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      // Swallow — see the doc comment above. Still logged, so it's visible
      // in Betterstack Logs (the log-shipping pipeline, unaffected by this
      // failing) — the one channel still working if this fails.
      this.logger.error('Failed to trigger incident alert', err as Error);
    }
  }
}
