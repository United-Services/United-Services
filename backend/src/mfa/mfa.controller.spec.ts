import { BadRequestException } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import type { MfaService } from './mfa.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

const updateUserMock = jest.fn();
jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    users: { updateUser: (...args: unknown[]) => updateUserMock(...args) },
  }),
}));

// Admin password reset is the one place a new password can be set outside
// Clerk's own UI, and it's deliberately never reachable via an email link
// (docs/BUSINESS_RULES.md rule 7) — a fresh MFA proof must accompany it in
// the same request. These tests lock in that neither branch (TOTP nor
// WebAuthn) can set a password without that proof actually succeeding.
describe('MfaController.resetPassword', () => {
  const user = { id: 'admin-1', clerkId: 'clerk-1' } as User;

  function makeController() {
    updateUserMock.mockReset().mockResolvedValue({});
    const mfa = {
      verifyTotp: jest.fn(),
      webauthnAuthVerify: jest.fn(),
      markSessionVerified: jest.fn().mockResolvedValue(undefined),
    } as unknown as MfaService;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    return { controller: new MfaController(mfa, auditLog), mfa, auditLog };
  }

  it('rejects the reset when the TOTP code fails verification, without touching Clerk', async () => {
    const { controller, mfa } = makeController();
    (mfa.verifyTotp as jest.Mock).mockResolvedValue(false);

    await expect(
      controller.resetPassword(user, {
        method: 'totp',
        totpCode: '000000',
        newPassword: 'newpw12345',
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('sets the new password and signs out other sessions once TOTP verifies', async () => {
    const { controller, mfa, auditLog } = makeController();
    (mfa.verifyTotp as jest.Mock).mockResolvedValue(true);

    const result = await controller.resetPassword(user, {
      method: 'totp',
      totpCode: '123456',
      newPassword: 'newpw12345',
    } as any);

    expect(updateUserMock).toHaveBeenCalledWith('clerk-1', {
      password: 'newpw12345',
      signOutOfOtherSessions: true,
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.password_reset' }),
    );
    expect(result).toEqual({ success: true });
  });

  it('rejects the reset when WebAuthn verification fails', async () => {
    const { controller, mfa } = makeController();
    (mfa.webauthnAuthVerify as jest.Mock).mockResolvedValue(false);

    await expect(
      controller.resetPassword(user, {
        method: 'webauthn',
        webauthnResponse: {},
        newPassword: 'newpw12345',
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('resets via the WebAuthn branch once verified, without ever touching verifyTotp', async () => {
    const { controller, mfa } = makeController();
    (mfa.webauthnAuthVerify as jest.Mock).mockResolvedValue(true);

    await controller.resetPassword(user, {
      method: 'webauthn',
      webauthnResponse: {},
      newPassword: 'newpw12345',
    } as any);

    expect(mfa.verifyTotp).not.toHaveBeenCalled();
    expect(updateUserMock).toHaveBeenCalled();
  });
});

// These two endpoints are what /admin-mfa-challenge calls once per new
// sign-in — a successful verification here is what actually satisfies
// MfaSessionVerifiedGuard for the rest of that session (see its own
// guard-level tests for the gating side of that).
describe('MfaController — per-session MFA challenge', () => {
  const user = { id: 'admin-1', clerkId: 'clerk-1' } as User;

  function makeController() {
    const mfa = {
      verifyTotp: jest.fn(),
      webauthnAuthVerify: jest.fn(),
      markSessionVerified: jest.fn().mockResolvedValue(undefined),
    } as unknown as MfaService;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    return { controller: new MfaController(mfa, auditLog), mfa };
  }

  describe('challengeTotp', () => {
    it('marks the session verified once the code checks out', async () => {
      const { controller, mfa } = makeController();
      (mfa.verifyTotp as jest.Mock).mockResolvedValue(true);

      const result = await controller.challengeTotp(user, 'sess_1', {
        code: '123456',
      });

      expect(mfa.markSessionVerified).toHaveBeenCalledWith('sess_1');
      expect(result).toEqual({ verified: true });
    });

    it('rejects an invalid code without marking the session verified', async () => {
      const { controller, mfa } = makeController();
      (mfa.verifyTotp as jest.Mock).mockResolvedValue(false);

      await expect(
        controller.challengeTotp(user, 'sess_1', { code: '000000' }),
      ).rejects.toThrow(BadRequestException);
      expect(mfa.markSessionVerified).not.toHaveBeenCalled();
    });
  });

  describe('webauthnAuthVerify', () => {
    it('marks the session verified once the credential checks out', async () => {
      const { controller, mfa } = makeController();
      (mfa.webauthnAuthVerify as jest.Mock).mockResolvedValue(true);

      const result = await controller.webauthnAuthVerify(user, 'sess_1', {
        response: {},
      });

      expect(mfa.markSessionVerified).toHaveBeenCalledWith('sess_1');
      expect(result).toEqual({ verified: true });
    });

    it('does not mark the session verified when the credential fails to verify', async () => {
      const { controller, mfa } = makeController();
      (mfa.webauthnAuthVerify as jest.Mock).mockResolvedValue(false);

      const result = await controller.webauthnAuthVerify(user, 'sess_1', {
        response: {},
      });

      expect(mfa.markSessionVerified).not.toHaveBeenCalled();
      expect(result).toEqual({ verified: false });
    });
  });
});
