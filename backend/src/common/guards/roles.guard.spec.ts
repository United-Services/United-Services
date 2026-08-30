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

  // The multi-role array shape used throughout the backend as
  // @Roles(...ADMIN_ROLES) (common/constants/admin-roles.ts) — every
  // admin-equivalent controller/route now passes ['admin', 'super_admin']
  // here instead of a single role, so both actually have to work through
  // this exact guard, not just the underlying array semantics in theory.
  it('allows either role in a multi-role @Roles(...ADMIN_ROLES)-style list', () => {
    const guard = guardRequiring(['admin', 'super_admin']);
    expect(
      guard.canActivate(contextWithUser({ role: 'admin' })),
    ).toBe(true);
    expect(
      guard.canActivate(contextWithUser({ role: 'super_admin' })),
    ).toBe(true);
  });

  it('rejects a role not present in a multi-role list', () => {
    const guard = guardRequiring(['admin', 'super_admin']);
    expect(() =>
      guard.canActivate(contextWithUser({ role: 'client' })),
    ).toThrow(ForbiddenException);
  });

  // The audit-log/tickets exclusivity boundary (docs/BUSINESS_RULES.md
  // rule 17) depends on this exact distinction: @Roles(Role.super_admin)
  // alone — not ADMIN_ROLES — must still reject a plain admin.
  it('rejects a plain admin on a route requiring exactly super_admin', () => {
    const guard = guardRequiring(['super_admin']);
    expect(() =>
      guard.canActivate(contextWithUser({ role: 'admin' })),
    ).toThrow(ForbiddenException);
  });

  it('allows super_admin on a route requiring exactly super_admin', () => {
    const guard = guardRequiring(['super_admin']);
    expect(
      guard.canActivate(contextWithUser({ role: 'super_admin' })),
    ).toBe(true);
  });
});
