import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const COOLDOWN_SECONDS = 15 * 60; // one page per distinct failing route per 15 min
const COOLDOWN_KEY_PREFIX = 'alert:cooldown:';

// Pages a real phone via ntfy.sh the moment a genuine 5xx happens — a log
// line alone doesn't wake anyone up unless a log-based alert rule is
// configured (fragile, easy to silently break). This posts directly to a
// topic URL instead, which ntfy's mobile app (iOS/Android) is subscribed
// to and turns into a push notification. Free, no account/API key —
// NTFY_TOPIC_URL's unguessable topic name is what stands in for auth (see
// docs/CREDENTIALS_CHECKLIST.md for why that matters and how to pick one).
//
// Off by default everywhere except a real server that explicitly opts in
// (ALERTING_ENABLED=true) — without that, every local dev exception while
// actively coding would otherwise page whoever's on call.
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
          // 5 = "urgent" — ntfy's max priority, meant to bypass a phone's
          // normal notification quiet-hours behavior where the app allows
          // it. Anything lower risks this getting silently batched instead
          // of actually waking someone up.
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
