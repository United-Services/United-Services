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
