import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MfaSessionVerifiedGuard } from './mfa-session-verified.guard';
import { Role } from '../../generated/prisma';
import type { MfaService } from '../../mfa/mfa.service';

// Closes the gap where mfaEnrolled=true (a one-time fact about the
// account) was being silently treated as "this sign-in proved the second
// factor" (a fact about the current session) — an admin who enrolled
// once was never asked to verify again on any later login.
describe('MfaSessionVerifiedGuard', () => {
  function contextFor(
    user: { role: Role; mfaEnrolled: boolean } | undefined,
    sessionId: string | undefined,
    exempt: boolean,
    isSessionVerified: boolean,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(exempt),
    } as unknown as Reflector;
    const mfa = {
      isSessionVerified: jest.fn().mockResolvedValue(isSessionVerified),
    } as unknown as MfaService;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user, sessionId }) }),
    } as unknown as ExecutionContext;
    return { guard: new MfaSessionVerifiedGuard(reflector, mfa), context, mfa };
  }

  it('rejects an enrolled admin whose current session has not been verified', async () => {
    const { guard, context } = contextFor(
      { role: Role.admin, mfaEnrolled: true },
      'sess_1',
      false,
      false,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows an enrolled admin whose current session has already been verified', async () => {
    const { guard, context } = contextFor(
      { role: Role.admin, mfaEnrolled: true },
      'sess_1',
      false,
      true,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('does not gate an unenrolled admin — MfaEnrolledGuard already rejects that case', async () => {
    const { guard, context, mfa } = contextFor(
      { role: Role.admin, mfaEnrolled: false },
      'sess_1',
      false,
      false,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mfa.isSessionVerified).not.toHaveBeenCalled();
  });

  it('allows an unverified session through on an @MfaExempt() route', async () => {
    const { guard, context } = contextFor(
      { role: Role.admin, mfaEnrolled: true },
      'sess_1',
      true,
      false,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('never gates a non-admin account', async () => {
    const { guard, context, mfa } = contextFor(
      { role: Role.client, mfaEnrolled: false },
      'sess_1',
      false,
      false,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mfa.isSessionVerified).not.toHaveBeenCalled();
  });

  it('lets an unauthenticated request pass through (RolesGuard is responsible for rejecting those)', async () => {
    const { guard, context } = contextFor(undefined, undefined, false, false);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects an admin request with no sessionId even if somehow marked exempt-false and enrolled', async () => {
    const { guard, context } = contextFor(
      { role: Role.admin, mfaEnrolled: true },
      undefined,
      false,
      true,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
