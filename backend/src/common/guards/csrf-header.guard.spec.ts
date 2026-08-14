import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfHeaderGuard } from './csrf-header.guard';

// Cookie-based auth (ClerkAuthGuard checks the __session cookie before an
// Authorization header) is vulnerable to CSRF unless state-changing
// requests require something a plain cross-site HTML form can't send —
// this guard is that check.
describe('CsrfHeaderGuard', () => {
  function contextFor(
    method: string,
    headers: Record<string, string>,
    exempt = false,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(exempt),
    } as unknown as Reflector;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
    } as unknown as ExecutionContext;
    return { guard: new CsrfHeaderGuard(reflector), context };
  }

  it('rejects a POST with no X-Requested-With header — the classic HTML-form CSRF vector', () => {
    const { guard, context } = contextFor('POST', {});
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a POST with the required header', () => {
    const { guard, context } = contextFor('POST', {
      'x-requested-with': 'XMLHttpRequest',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a PATCH/DELETE without the header too, not just POST', () => {
    const { guard: patchGuard, context: patchCtx } = contextFor('PATCH', {});
    expect(() => patchGuard.canActivate(patchCtx)).toThrow(ForbiddenException);
    const { guard: deleteGuard, context: deleteCtx } = contextFor('DELETE', {});
    expect(() => deleteGuard.canActivate(deleteCtx)).toThrow(
      ForbiddenException,
    );
  });

  it('never blocks safe methods (GET/HEAD/OPTIONS), header or not', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const { guard, context } = contextFor(method, {});
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('allows an @CsrfExempt() route through without the header (e.g. the Clerk webhook)', () => {
    const { guard, context } = contextFor('POST', {}, true);
    expect(guard.canActivate(context)).toBe(true);
  });
});
