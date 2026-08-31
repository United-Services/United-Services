import { BetterstackLogger } from './betterstack.logger';

// The whole point of this class: nothing it does may ever write to the
// console, in any configuration — logs go to Betterstack only, or
// nowhere at all if it isn't configured. Spy on every console method
// Node actually has and assert none of them fire, for every logger
// method this class exposes (including the ones ConsoleLogger defines
// that aren't explicitly overridden here — debug/verbose/fatal — since
// leaving any of those unoverridden would silently fall through to the
// real console-writing implementation).
describe('BetterstackLogger', () => {
  let consoleSpies: jest.SpyInstance[];
  let fetchMock: jest.Mock;

  beforeEach(() => {
    consoleSpies = (['log', 'error', 'warn', 'debug', 'info'] as const).map(
      (method) => jest.spyOn(console, method).mockImplementation(),
    );
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    jest.restoreAllMocks();
  });

  function expectNoConsoleOutput() {
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  }

  describe('when Betterstack is configured', () => {
    beforeEach(() => {
      process.env.BETTERSTACK_INGEST_URL = 'https://ingest.example.com';
      process.env.BETTERSTACK_SOURCE_TOKEN = 'test-token';
    });

    it.each(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const)(
      '%s() ships to Betterstack and never touches the console',
      (method) => {
        const logger = new BetterstackLogger();
        logger[method]('a message');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          'https://ingest.example.com',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          }),
        );
        expectNoConsoleOutput();
      },
    );

    it('error() folds the stack into the shipped message when provided', () => {
      const logger = new BetterstackLogger();
      logger.error('boom', 'at foo.ts:1:1');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.message).toBe('boom\nat foo.ts:1:1');
      expect(body.level).toBe('error');
      expectNoConsoleOutput();
    });

    // Regression: JSON.stringify(someError) produces "{}" — Error's own
    // name/message/stack are non-enumerable, so a bare
    // `logger.error(err)` (an Error as the sole argument) or
    // `logger.log(err)` used to silently ship as an empty,
    // undiagnosable "{}" instead of the actual error.
    it('log() ships a full name/message/stack when given a bare Error as the message', () => {
      const logger = new BetterstackLogger();
      const err = new Error('database connection refused');
      logger.log(err);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const shipped = JSON.parse(body.message);
      expect(shipped.name).toBe('Error');
      expect(shipped.message).toBe('database connection refused');
      expect(shipped.stack).toEqual(expect.stringContaining('Error: database connection refused'));
    });

    it('error() with a bare Error as the message (no stack/context args) still ships the real message, not {}', () => {
      const logger = new BetterstackLogger();
      const err = new TypeError('cannot read property of undefined');
      logger.error(err);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.message).not.toBe('{}');
      const shipped = JSON.parse(body.message);
      expect(shipped.name).toBe('TypeError');
      expect(shipped.message).toBe('cannot read property of undefined');
    });

    it('error() given an Error object as the `stack` argument extracts its real stack, not just its toString()', () => {
      const logger = new BetterstackLogger();
      const err = new Error('ntfy unreachable');
      // Mirrors IncidentAlertService's `logger.error('msg', err as Error)`
      // call shape — Nest's Logger types `stack?: string`, but nothing
      // enforces that at a call site.
      logger.error('Failed to trigger incident alert', err as unknown as string);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.message).toContain('Failed to trigger incident alert');
      expect(body.message).toContain('Error: ntfy unreachable');
    });

    it('serializes an array containing an Error (e.g. console.error("context", err)-shaped input) without losing the error detail', () => {
      const logger = new BetterstackLogger();
      logger.log(['request failed', new Error('timeout')]);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const shipped = JSON.parse(body.message);
      expect(shipped[0]).toBe('request failed');
      expect(shipped[1].message).toBe('timeout');
    });

    it('follows a chained `cause` Error so the root cause is never silently dropped', () => {
      const logger = new BetterstackLogger();
      const root = new Error('ECONNREFUSED');
      const wrapped = new Error('failed to connect', { cause: root });
      logger.log(wrapped);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const shipped = JSON.parse(body.message);
      expect(shipped.message).toBe('failed to connect');
      expect(shipped.cause.message).toBe('ECONNREFUSED');
    });

    it('still ships a genuinely plain object unchanged (no message/stack property) — the expansion only kicks in for error-shaped objects', () => {
      const logger = new BetterstackLogger();
      logger.log({ some: 'plain', data: 1 });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(JSON.parse(body.message)).toEqual({ some: 'plain', data: 1 });
    });

    // Regression for the real incident this whole fix was written for:
    // a library error object that ISN'T `instanceof Error` (many SDKs —
    // Clerk's included — throw custom classes that don't properly
    // extend the native Error, or define message/code as non-enumerable
    // getters) still silently produced "{}" even after the first round
    // of this fix, since that version only special-cased `instanceof
    // Error`. Detecting by property access instead catches this shape
    // too.
    it('expands a non-Error object that merely *looks* like an error (has a message property) instead of shipping {}', () => {
      const logger = new BetterstackLogger();
      class ClerkStyleError {
        constructor(
          public message: string,
          public status: number,
        ) {}
      }
      logger.error(new ClerkStyleError('session not found', 401));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.message).not.toBe('{}');
      const shipped = JSON.parse(body.message);
      expect(shipped.message).toBe('session not found');
      expect(shipped.status).toBe(401);
    });

    it('recovers a non-enumerable message getter that JSON.stringify alone would silently drop', () => {
      const logger = new BetterstackLogger();
      const weirdError: Record<string, unknown> = {};
      Object.defineProperty(weirdError, 'message', {
        value: 'hidden from JSON.stringify',
        enumerable: false,
      });

      // Sanity-check the premise: plain JSON.stringify really does drop
      // a non-enumerable property, which is exactly why this needs
      // fixing rather than being a redundant test.
      expect(JSON.stringify(weirdError)).toBe('{}');

      logger.log(weirdError);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(JSON.parse(body.message).message).toBe(
        'hidden from JSON.stringify',
      );
    });

    it('never throws or blocks when the Betterstack request itself rejects', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const logger = new BetterstackLogger();

      expect(() => logger.error('boom')).not.toThrow();
      // let the fire-and-forget rejection settle without an unhandled
      // rejection surfacing in the test run
      await new Promise((r) => setTimeout(r, 0));
      expectNoConsoleOutput();
    });
  });

  describe('when Betterstack is NOT configured (no token/URL)', () => {
    beforeEach(() => {
      delete process.env.BETTERSTACK_INGEST_URL;
      delete process.env.BETTERSTACK_SOURCE_TOKEN;
    });

    it.each(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const)(
      '%s() silently drops the log — never falls back to console, even unconfigured',
      (method) => {
        const logger = new BetterstackLogger();
        expect(() => logger[method]('a message')).not.toThrow();

        expect(fetchMock).not.toHaveBeenCalled();
        expectNoConsoleOutput();
      },
    );
  });
});
