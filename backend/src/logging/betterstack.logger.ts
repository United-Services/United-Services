import { ConsoleLogger } from '@nestjs/common';

interface LogEntry {
  dt: string;
  level: string;
  message: string;
  context?: string;
  service: 'backend';
}

// Upper bound on lines held in memory awaiting shipment. Beyond this the
// OLDEST are dropped (and counted) — a bounded loss of old log lines is
// the correct failure mode; the alternative was unbounded growth.
const MAX_BUFFER = 5_000;
// Lines per POST, and the longest a line waits before a flush.
const MAX_BATCH = 100;
const FLUSH_INTERVAL_MS = 1_000;
// Concurrent POSTs. Before batching existed this was effectively
// unbounded: one fire-and-forget fetch per log line, one log line per
// HTTP request (RequestLoggingMiddleware), so ~500 req/s meant ~500
// outbound POSTs/s against one origin. undici's per-origin pool is 128
// connections with an unbounded queue, so a slow or 429ing Betterstack
// accumulated pending requests and their retained bodies without limit
// — which matches the 1.25 GB RSS peak measured under load. A logging
// vendor had become a hard availability dependency.
const MAX_IN_FLIGHT = 4;
const REQUEST_TIMEOUT_MS = 5_000;

// Ships every log line to Betterstack ONLY — never the console, in any
// environment or configuration. This intentionally means a log vanishes
// with nowhere to go if BETTERSTACK_INGEST_URL/BETTERSTACK_SOURCE_TOKEN
// aren't set; that's the accepted tradeoff for guaranteeing nothing ever
// prints to stdout/stderr. A logging failure must never take down a
// request. Still extends ConsoleLogger (for Nest's LoggerService
// interface/formatting helpers) but deliberately never calls any of its
// super.log/error/warn methods, which is what would actually write to
// the console.
//
// Lines are buffered and shipped in batches (a JSON array per POST —
// Betterstack's HTTP source accepts an array of events), with a bound
// on buffer size and on concurrent in-flight requests. flush() drains
// the buffer and resolves once every send has settled; main.ts awaits
// it on the exit paths so the last lines before a crash still ship.
export class BetterstackLogger extends ConsoleLogger {
  private readonly ingestUrl = process.env.BETTERSTACK_INGEST_URL;
  private readonly token = process.env.BETTERSTACK_SOURCE_TOKEN;

  private buffer: LogEntry[] = [];
  private dropped = 0;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = 0;
  private readonly pending = new Set<Promise<void>>();

  private ship(level: string, message: unknown, context?: string) {
    if (!this.ingestUrl || !this.token) return;
    this.buffer.push({
      dt: new Date().toISOString().replace('T', ' ').replace('Z', ' UTC'),
      level,
      message:
        typeof message === 'string'
          ? message
          : BetterstackLogger.stringifyMessage(message),
      context,
      service: 'backend',
    });
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.shift();
      this.dropped += 1;
    }
    if (this.buffer.length >= MAX_BATCH) {
      void this.flush();
    } else if (!this.timer) {
      // unref: a pending flush must never be what keeps the process
      // alive (tests, or a shutdown that has otherwise completed).
      this.timer = setTimeout(() => void this.flush(), FLUSH_INTERVAL_MS);
      this.timer.unref();
    }
  }

  // Drains everything buffered, respecting MAX_IN_FLIGHT, and resolves
  // when every send started by this call has settled. Never rejects.
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.buffer.length > 0) {
      if (this.inFlight >= MAX_IN_FLIGHT) {
        // Wait for a slot rather than spawn more sends.
        await Promise.race(this.pending);
        continue;
      }
      const batch = this.buffer.splice(0, MAX_BATCH);
      if (this.dropped > 0) {
        batch.unshift({
          dt: batch[0].dt,
          level: 'warn',
          message: `BetterstackLogger dropped ${this.dropped} log line(s): buffer exceeded ${MAX_BUFFER} while shipping was slow`,
          context: 'BetterstackLogger',
          service: 'backend',
        });
        this.dropped = 0;
      }
      const send = this.post(batch).finally(() => {
        this.inFlight -= 1;
        this.pending.delete(send);
      });
      this.inFlight += 1;
      this.pending.add(send);
    }
    await Promise.allSettled([...this.pending]);
  }

  private post(batch: LogEntry[]): Promise<void> {
    return fetch(this.ingestUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
      .then(() => undefined)
      .catch(() => {
        // Never let log shipping itself throw or block the request
        // lifecycle. The batch is lost; that is the accepted outcome.
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
