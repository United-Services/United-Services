import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

// This guard is the last line of defense keeping a client from ever
// reaching an admin-only handler (e.g. POST /admin/users/:id/disable) even
// if the frontend route gate is bypassed — see docs/BUSINESS_RULES.md.
describe('RolesGuard', () => {
  function contextWithUser(user: { role: string } | undefined) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function guardRequiring(roles: string[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows the request through when no @Roles() decorator is present', () => {
    const guard = guardRequiring(undefined);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    const guard = guardRequiring(['admin']);
    expect(guard.canActivate(contextWithUser({ role: 'admin' }))).toBe(true);
  });

  it('rejects a client hitting an admin-only route', () => {
    const guard = guardRequiring(['admin']);
    expect(() =>
      guard.canActivate(contextWithUser({ role: 'client' })),
    ).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated request on a role-gated route', () => {
    const guard = guardRequiring(['admin']);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
