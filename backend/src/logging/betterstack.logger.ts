import { ConsoleLogger } from '@nestjs/common';

// Ships every log line to Betterstack ONLY — never the console, in any
// environment or configuration. This intentionally means a log vanishes
// with nowhere to go if BETTERSTACK_INGEST_URL/BETTERSTACK_SOURCE_TOKEN
// aren't set; that's the accepted tradeoff for guaranteeing nothing ever
// prints to stdout/stderr. Fire-and-forget — a logging failure must
// never take down a request. Still extends ConsoleLogger (for Nest's
// LoggerService interface/formatting helpers) but deliberately never
// calls any of its super.log/error/warn methods, which is what would
// actually write to the console.
export class BetterstackLogger extends ConsoleLogger {
  private readonly ingestUrl = process.env.BETTERSTACK_INGEST_URL;
  private readonly token = process.env.BETTERSTACK_SOURCE_TOKEN;

  private ship(level: string, message: unknown, context?: string) {
    if (!this.ingestUrl || !this.token) return;
    fetch(this.ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        dt: new Date().toISOString().replace('T', ' ').replace('Z', ' UTC'),
        level,
        message:
          typeof message === 'string' ? message : JSON.stringify(message),
        context,
        service: 'backend',
      }),
    }).catch(() => {
      // Never let log shipping itself throw or block the request lifecycle.
    });
  }

  log(message: unknown, context?: string) {
    this.ship('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string) {
    this.ship(
      'error',
      stack ? `${String(message)}\n${stack}` : message,
      context,
    );
  }

  warn(message: unknown, context?: string) {
    this.ship('warn', message, context);
  }

  // ConsoleLogger also defines these — left unoverridden, they'd fall
  // through to the real console-writing implementation, defeating the
  // whole point. debug() is genuinely called (IncidentAlertService's
  // cooldown-suppression log); verbose/fatal aren't used anywhere today
  // but are overridden defensively so nothing new can slip a line onto
  // stdout by using them.
  debug(message: unknown, context?: string) {
    this.ship('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.ship('info', message, context);
  }

  fatal(message: unknown, context?: string) {
    this.ship('error', message, context);
  }
}
