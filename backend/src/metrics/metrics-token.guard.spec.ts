import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { MetricsTokenGuard } from './metrics-token.guard';

function makeContext(authHeader?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: authHeader } }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsTokenGuard', () => {
  const ORIGINAL_ENV = process.env.METRICS_TOKEN;
  let guard: MetricsTokenGuard;

  beforeEach(() => {
    guard = new MetricsTokenGuard();
  });

  afterEach(() => {
    process.env.METRICS_TOKEN = ORIGINAL_ENV;
  });

  // Fails CLOSED — an unset token must never mean "anyone can read
  // /metrics." This is the one case that must never accidentally become
  // `return true`.
  it('denies every request when METRICS_TOKEN is not configured, even a correct-looking header', () => {
    delete process.env.METRICS_TOKEN;
    expect(guard.canActivate(makeContext('Bearer anything'))).toBe(false);
  });

  it('throws Unauthorized when no Authorization header is present', () => {
    process.env.METRICS_TOKEN = 'secret-token';
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws Unauthorized for a non-Bearer Authorization header', () => {
    process.env.METRICS_TOKEN = 'secret-token';
    expect(() => guard.canActivate(makeContext('Basic dXNlcjpwYXNz'))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws Unauthorized for a Bearer token that does not match', () => {
    process.env.METRICS_TOKEN = 'secret-token';
    expect(() => guard.canActivate(makeContext('Bearer wrong-token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('returns true for the exact configured token', () => {
    process.env.METRICS_TOKEN = 'secret-token';
    expect(guard.canActivate(makeContext('Bearer secret-token'))).toBe(true);
  });

  // A token differing only in length from the real one is the case a
  // naive `Buffer.compare`/`===` would leak the most timing information
  // about — this only proves the guard still correctly rejects it, not
  // the timing property itself (which isn't practically testable in a
  // unit test), but it guards against a regression to a raw `!==` that
  // throws on length mismatch instead of comparing.
  it('throws Unauthorized for a token of different length than the real one', () => {
    process.env.METRICS_TOKEN = 'secret-token';
    expect(() => guard.canActivate(makeContext('Bearer short'))).toThrow(
      UnauthorizedException,
    );
  });
});
