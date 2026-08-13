import { BadRequestException, ConflictException } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { TotpCryptoService } from '../crypto/totp-crypto.service';
import { FakeKekKeyStore } from '../crypto/testing/fake-kek-key-store';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

const generateRegistrationOptionsMock = jest.fn();
const verifyRegistrationResponseMock = jest.fn();
const generateAuthenticationOptionsMock = jest.fn();
const verifyAuthenticationResponseMock = jest.fn();
jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: (...args: unknown[]) => generateRegistrationOptionsMock(...args),
  verifyRegistrationResponse: (...args: unknown[]) => verifyRegistrationResponseMock(...args),
  generateAuthenticationOptions: (...args: unknown[]) => generateAuthenticationOptionsMock(...args),
  verifyAuthenticationResponse: (...args: unknown[]) => verifyAuthenticationResponseMock(...args),
}));

// WebAuthn is the biometric MFA path for admins. @simplewebauthn/server
// itself (the real cryptographic attestation/assertion verification) is
// mocked at the boundary — everything around it (challenge storage in
// Redis with a TTL, one-time consumption, credential-ownership checks) is
// real MfaService logic under test.
describe('MfaService — WebAuthn', () => {
  const user = { id: 'admin-1', email: 'admin@use-eg.com', firstName: 'Ad', lastName: 'Min' } as User;
  let prisma: any;
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: MfaService;

  beforeEach(async () => {
    generateRegistrationOptionsMock.mockReset();
    verifyRegistrationResponseMock.mockReset();
    generateAuthenticationOptionsMock.mockReset();
    verifyAuthenticationResponseMock.mockReset();

    prisma = {
      webAuthnCredential: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      user: { update: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    const kekStore = await FakeKekKeyStore.create();
    kekStore.addActiveKey('kek-test-1');
    service = new MfaService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      new TotpCryptoService(kekStore.asKekKeyStore()),
      { record: jest.fn() } as unknown as AuditLogService,
    );
  });

  describe('webauthnRegisterOptions', () => {
    it('stores the challenge in Redis with a TTL so it can be verified later', async () => {
      generateRegistrationOptionsMock.mockResolvedValue({ challenge: 'chal-1' });

      await service.webauthnRegisterOptions(user);

      expect(redis.set).toHaveBeenCalledWith('webauthn:reg:admin-1', 'chal-1', 'EX', 300);
    });
  });

  describe('webauthnRegisterVerify', () => {
    it('rejects when the registration challenge has expired (or was never issued)', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.webauthnRegisterVerify(user, {} as any)).rejects.toThrow(BadRequestException);
    });

    it('creates the credential and marks the user mfaEnrolled on success', async () => {
      redis.get.mockResolvedValue('chal-1');
      verifyRegistrationResponseMock.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      });

      const result = await service.webauthnRegisterVerify(user, {} as any, 'My laptop');

      expect(result).toEqual({ success: true });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('webauthn:reg:admin-1'); // challenge is single-use
    });

    it('surfaces a duplicate-credential DB error as a 409, not a 500', async () => {
      redis.get.mockResolvedValue('chal-1');
      verifyRegistrationResponseMock.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: 'cred-1', publicKey: new Uint8Array(), counter: 0, transports: [] },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      });
      prisma.$transaction.mockRejectedValue(new Error('unique constraint'));

      await expect(service.webauthnRegisterVerify(user, {} as any)).rejects.toThrow(ConflictException);
      expect(redis.del).toHaveBeenCalledWith('webauthn:reg:admin-1'); // still consumed even on failure
    });

    it('rejects when the attestation itself does not verify', async () => {
      redis.get.mockResolvedValue('chal-1');
      verifyRegistrationResponseMock.mockResolvedValue({ verified: false });

      await expect(service.webauthnRegisterVerify(user, {} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('webauthnAuthOptions', () => {
    it('refuses to start a challenge for a user with no registered credentials', async () => {
      prisma.webAuthnCredential.findMany.mockResolvedValue([]);
      await expect(service.webauthnAuthOptions(user)).rejects.toThrow(BadRequestException);
    });
  });

  describe('webauthnAuthVerify', () => {
    it('returns false (not an error) when the auth challenge has expired', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.webauthnAuthVerify(user, { id: 'cred-1' } as any)).resolves.toBe(false);
    });

    it('returns false when the credential belongs to a different user — never trust the response id alone', async () => {
      redis.get.mockResolvedValue('chal-1');
      prisma.webAuthnCredential.findUnique.mockResolvedValue({ id: 'row-1', userId: 'someone-else', credentialId: 'cred-1' });

      await expect(service.webauthnAuthVerify(user, { id: 'cred-1' } as any)).resolves.toBe(false);
      expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
    });

    it('bumps the stored counter after a successful verification (replay-attack detection)', async () => {
      redis.get.mockResolvedValue('chal-1');
      prisma.webAuthnCredential.findUnique.mockResolvedValue({
        id: 'row-1', userId: user.id, credentialId: 'cred-1', publicKey: Buffer.from([1, 2]), counter: 5n, transports: [],
      });
      verifyAuthenticationResponseMock.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 6 } });

      const result = await service.webauthnAuthVerify(user, { id: 'cred-1' } as any);

      expect(result).toBe(true);
      expect(prisma.webAuthnCredential.update).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { counter: 6n } });
    });

    it('always consumes the one-time challenge, even when verification throws', async () => {
      redis.get.mockResolvedValue('chal-1');
      prisma.webAuthnCredential.findUnique.mockResolvedValue({ id: 'row-1', userId: user.id, credentialId: 'cred-1', publicKey: Buffer.from([1]), counter: 0n, transports: [] });
      verifyAuthenticationResponseMock.mockRejectedValue(new Error('boom'));

      await expect(service.webauthnAuthVerify(user, { id: 'cred-1' } as any)).rejects.toThrow('boom');
      expect(redis.del).toHaveBeenCalledWith('webauthn:auth:admin-1');
    });
  });
});
