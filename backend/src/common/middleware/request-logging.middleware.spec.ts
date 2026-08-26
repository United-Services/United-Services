import { Logger } from '@nestjs/common';
import { requestLoggingMiddleware } from './request-logging.middleware';

// Builds a minimal Express-shaped req/res: only what the middleware
// actually reads/calls, not a full mock framework.
function makeReqRes(overrides: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  statusCode?: number;
}) {
  const finishHandlers: Array<() => void> = [];
  const req = {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/api/v1/services',
    originalUrl: overrides.path ?? '/api/v1/services',
    headers: overrides.headers ?? {},
  };
  const res = {
    statusCode: overrides.statusCode ?? 200,
    on: (event: string, handler: () => void) => {
      if (event === 'finish') finishHandlers.push(handler);
    },
  };
  return {
    req,
    res,
    fireFinish: () => finishHandlers.forEach((h) => h()),
  };
}

describe('requestLoggingMiddleware', () => {
  it('includes the X-Request-Id header value in the logged line when present', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const { req, res, fireFinish } = makeReqRes({
      headers: { 'x-request-id': 'req-abc-123' },
    });
    const next = jest.fn();

    requestLoggingMiddleware(req as never, res as never, next);
    expect(next).toHaveBeenCalled();
    fireFinish();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[req:req-abc-123]'),
    );
    logSpy.mockRestore();
  });

  it('never includes a "[req:...]" tag when no X-Request-Id header was sent', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const { req, res, fireFinish } = makeReqRes({});
    requestLoggingMiddleware(req as never, res as never, jest.fn());
    fireFinish();

    expect(logSpy).toHaveBeenCalledWith(expect.not.stringContaining('[req:'));
    logSpy.mockRestore();
  });

  it('skips logging entirely for the health-check path, request id or not', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const { req, res } = makeReqRes({
      path: '/api/v1/health',
      headers: { 'x-request-id': 'req-should-not-appear' },
    });
    const next = jest.fn();
    requestLoggingMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
