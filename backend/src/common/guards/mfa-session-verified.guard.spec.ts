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

  // See docs/BUSINESS_RULES.md rule 17 — super_admin goes through the
  // identical per-session verification as admin.
  it('rejects an enrolled super_admin whose current session has not been verified', async () => {
    const { guard, context } = contextFor(
      { role: Role.super_admin, mfaEnrolled: true },
      'sess_1',
      false,
      false,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows an enrolled super_admin whose current session has already been verified', async () => {
    const { guard, context } = contextFor(
      { role: Role.super_admin, mfaEnrolled: true },
      'sess_1',
      false,
      true,
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

  // The specific distinction rule 2 calls out: mfaEnrolled is a permanent,
  // one-time fact about the *account*, while session verification is keyed
  // on the Clerk session id and must be proven again per new sign-in. This
  // drives the guard against MfaService's real markSessionVerified/
  // isSessionVerified pair (in-memory Redis stand-in, matching this repo's
  // convention elsewhere) rather than a stub that always answers the same
  // way, so it actually exercises "same already-enrolled user, new
  // session id after a fresh login -> still rejected until that session
  // itself calls /challenge/totp or /webauthn/auth-verify".
  it('requires a fresh session verification on a new login (same enrolled user, different session id)', async () => {
    const redisStore = new Map<string, string>();
    const redis = {
      get: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      set: jest.fn((key: string, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve('OK');
      }),
    };
    const mfa = {
      isSessionVerified: (sessionId: string) =>
        Promise.resolve(redisStore.has(`mfa:session-verified:${sessionId}`)),
      markSessionVerified: (sessionId: string) =>
        redis.set(`mfa:session-verified:${sessionId}`, '1'),
    } as unknown as MfaService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new MfaSessionVerifiedGuard(reflector, mfa);
    const user = { role: Role.admin, mfaEnrolled: true };
    const contextForSession = (sessionId: string) =>
      ({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ user, sessionId }) }),
      }) as unknown as ExecutionContext;

    // First login: session A verifies via the TOTP/WebAuthn challenge.
    await mfa.markSessionVerified('sess_login_A');
    await expect(
      guard.canActivate(contextForSession('sess_login_A')),
    ).resolves.toBe(true);

    // Second login (same account, enrollment unchanged) gets a brand new
    // Clerk session id and must NOT ride on the first login's verification.
    await expect(
      guard.canActivate(contextForSession('sess_login_B')),
    ).rejects.toThrow(ForbiddenException);
  });
});
