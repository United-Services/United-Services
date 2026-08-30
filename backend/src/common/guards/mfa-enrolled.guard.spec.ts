import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MfaEnrolledGuard } from './mfa-enrolled.guard';
import { Role } from '../../generated/prisma';

// Closes the gap where the /admin-mfa-setup redirect was purely a
// frontend UX nudge — an admin account that never completed TOTP/WebAuthn
// enrollment must be rejected by the backend itself on every admin route,
// not just steered away by the Next.js page.
describe('MfaEnrolledGuard', () => {
  function contextFor(
    user: { role: Role; mfaEnrolled: boolean } | undefined,
    exempt: boolean,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(exempt),
    } as unknown as Reflector;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    return { guard: new MfaEnrolledGuard(reflector), context };
  }

  it('rejects an admin who has not completed MFA enrollment', () => {
    const { guard, context } = contextFor(
      { role: Role.admin, mfaEnrolled: false },
      false,
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows an admin who has completed MFA enrollment', () => {
    const { guard, context } = contextFor(
      { role: Role.admin, mfaEnrolled: true },
      false,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an unenrolled admin through on an @MfaExempt() route (enrollment endpoints)', () => {
    const { guard, context } = contextFor(
      { role: Role.admin, mfaEnrolled: false },
      true,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('never gates a non-admin account, enrolled or not', () => {
    const { guard, context } = contextFor(
      { role: Role.client, mfaEnrolled: false },
      false,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  // super_admin must go through the identical MFA-enrollment enforcement
  // as admin — see docs/BUSINESS_RULES.md rule 17. This is the exact
  // class of bug the me.controller.ts admin-password-reset fix closed for
  // admin: a role check using `=== Role.admin` instead of the ADMIN_ROLES
  // set would silently exempt super_admin from MFA entirely, not just
  // from a permission.
  it('rejects a super_admin who has not completed MFA enrollment', () => {
    const { guard, context } = contextFor(
      { role: Role.super_admin, mfaEnrolled: false },
      false,
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a super_admin who has completed MFA enrollment', () => {
    const { guard, context } = contextFor(
      { role: Role.super_admin, mfaEnrolled: true },
      false,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an unenrolled super_admin through on an @MfaExempt() route', () => {
    const { guard, context } = contextFor(
      { role: Role.super_admin, mfaEnrolled: false },
      true,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets an unauthenticated request pass through (RolesGuard is responsible for rejecting those)', () => {
    const { guard, context } = contextFor(undefined, false);
    expect(guard.canActivate(context)).toBe(true);
  });
});
