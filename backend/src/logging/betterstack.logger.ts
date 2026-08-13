import { ConsoleLogger } from '@nestjs/common';

// Ships every log line to Betterstack in addition to the console, so
// production logs are centralized (Phase 14). Fire-and-forget — a logging
// failure must never take down a request. Falls back to console-only if
// BETTERSTACK_SOURCE_TOKEN isn't configured (e.g. local dev).
export class BetterstackLogger extends ConsoleLogger {
  private readonly ingestUrl = process.env.BETTERSTACK_INGEST_URL;
  private readonly token = process.env.BETTERSTACK_SOURCE_TOKEN;

  private ship(level: string, message: unknown, context?: string) {
    if (!this.ingestUrl || !this.token) return;
    fetch(this.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({
        dt: new Date().toISOString().replace('T', ' ').replace('Z', ' UTC'),
        level,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        context,
        service: 'backend',
      }),
    }).catch(() => {
      // Never let log shipping itself throw or block the request lifecycle.
    });
  }

  log(message: unknown, context?: string) {
    super.log(message as string, context);
    this.ship('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string) {
    super.error(message as string, stack, context);
    this.ship('error', message, context);
  }

  warn(message: unknown, context?: string) {
    super.warn(message as string, context);
    this.ship('warn', message, context);
  }
}
