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
          typeof message === 'string'
            ? message
            : BetterstackLogger.stringifyMessage(message),
        context,
        service: 'backend',
      }),
    }).catch(() => {
      // Never let log shipping itself throw or block the request lifecycle.
    });
  }

  // `JSON.stringify(someError)` produces "{}" — Error's own message/
  // stack/name are non-enumerable, so a bare `logger.error(err)` (an
  // Error object as the sole argument, no message string) silently
  // shipped as an empty, undiagnosable "{}". Native Errors aren't the
  // only offenders: many libraries throw custom error classes that
  // either don't properly extend Error, or that also define message/
  // stack/code as non-enumerable getters — same masking either way.
  // expandErrorLike() detects an error-like object by *property access*
  // (works regardless of enumerability), not by `instanceof Error` or
  // Object.keys/JSON.stringify (which only see enumerable own
  // properties).
  private static stringifyMessage(message: unknown): string {
    try {
      return JSON.stringify(BetterstackLogger.expandErrorLike(message));
    } catch {
      return String(message);
    }
  }

  private static expandErrorLike(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      return value.map((v) => BetterstackLogger.expandErrorLike(v));
    }

    const obj = value as Record<string, unknown>;
    const looksLikeError =
      value instanceof Error ||
      typeof obj.message === 'string' ||
      typeof obj.stack === 'string';
    if (!looksLikeError) return value;

    const expanded: Record<string, unknown> = { ...obj };
    for (const key of [
      'name',
      'message',
      'stack',
      'code',
      'status',
      'statusCode',
    ]) {
      if (obj[key] !== undefined) expanded[key] = obj[key];
    }
    if (obj.cause !== undefined) {
      expanded.cause = BetterstackLogger.expandErrorLike(obj.cause);
    }
    return expanded;
  }

  log(message: unknown, context?: string) {
    this.ship('info', message, context);
  }

  // `stack` is typed `string` (matches Nest's LoggerService signature), but
  // nothing enforces that at a call site — `logger.error('msg', err)`
  // passing a whole Error object as `stack` used to silently rely on
  // Error.prototype.toString() happening to produce something readable.
  // Handled explicitly now so a real Error here still ships its actual
  // stack, not just its one-line toString().
  error(message: unknown, stack?: string | Error, context?: string) {
    const stackText =
      stack instanceof Error ? (stack.stack ?? stack.message) : stack;
    this.ship(
      'error',
      stackText ? `${String(message)}\n${stackText}` : message,
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
