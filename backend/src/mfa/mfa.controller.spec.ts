import { BadRequestException } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import type { MfaService } from './mfa.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

const updateUserMock = jest.fn();
jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ users: { updateUser: (...args: unknown[]) => updateUserMock(...args) } }),
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
    const mfa = { verifyTotp: jest.fn(), webauthnAuthVerify: jest.fn() } as unknown as MfaService;
    const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
    return { controller: new MfaController(mfa, auditLog), mfa, auditLog };
  }

  it('rejects the reset when the TOTP code fails verification, without touching Clerk', async () => {
    const { controller, mfa } = makeController();
    (mfa.verifyTotp as jest.Mock).mockResolvedValue(false);

    await expect(
      controller.resetPassword(user, { method: 'totp', totpCode: '000000', newPassword: 'newpw12345' } as any),
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

    expect(updateUserMock).toHaveBeenCalledWith('clerk-1', { password: 'newpw12345', signOutOfOtherSessions: true });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.password_reset' }));
    expect(result).toEqual({ success: true });
  });

  it('rejects the reset when WebAuthn verification fails', async () => {
    const { controller, mfa } = makeController();
    (mfa.webauthnAuthVerify as jest.Mock).mockResolvedValue(false);

    await expect(
      controller.resetPassword(user, { method: 'webauthn', webauthnResponse: {}, newPassword: 'newpw12345' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('resets via the WebAuthn branch once verified, without ever touching verifyTotp', async () => {
    const { controller, mfa } = makeController();
    (mfa.webauthnAuthVerify as jest.Mock).mockResolvedValue(true);

    await controller.resetPassword(user, { method: 'webauthn', webauthnResponse: {}, newPassword: 'newpw12345' } as any);

    expect(mfa.verifyTotp).not.toHaveBeenCalled();
    expect(updateUserMock).toHaveBeenCalled();
  });
});
