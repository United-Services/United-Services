import { TOTP } from '@otplib/totp';
import { NobleCryptoPlugin } from '@otplib/plugin-crypto-noble';
import { ScureBase32Plugin } from '@otplib/plugin-base32-scure';
import { BadRequestException } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { EncryptionService } from '../crypto/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { User } from '../generated/prisma';

// TOTP enrollment/confirmation is the primary MFA path for admin accounts.
// Encryption-at-rest of the secret must round-trip correctly, and a code
// generated from a *different* secret must never verify.
describe('MfaService — TOTP', () => {
  const user = { id: 'admin-1', email: 'admin@use-eg.com' } as User;
  let prisma: { totpCredential: any; user: any; $transaction: jest.Mock };
  let service: MfaService;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-only-encryption-key-not-for-prod';
  });

  beforeEach(() => {
    prisma = {
      totpCredential: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      user: { update: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new MfaService(
      prisma as unknown as PrismaService,
      {} as RedisService,
      new EncryptionService(),
    );
  });

  it('confirms enrollment with a code generated from the enrolled secret', async () => {
    const { secret } = await service.enrollTotp(user);
    expect(prisma.totpCredential.upsert).toHaveBeenCalled();

    const storedCiphertext = prisma.totpCredential.upsert.mock.calls[0][0].update.secretEncrypted;
    prisma.totpCredential.findUnique.mockResolvedValue({ secretEncrypted: storedCiphertext });

    const validCode = await new TOTP({
      secret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate();

    const result = await service.confirmTotp(user, validCode);

    expect(result).toEqual({ success: true });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects a code generated from an unrelated secret', async () => {
    const { secret } = await service.enrollTotp(user);
    const storedCiphertext = prisma.totpCredential.upsert.mock.calls[0][0].update.secretEncrypted;
    prisma.totpCredential.findUnique.mockResolvedValue({ secretEncrypted: storedCiphertext });
    void secret;

    const unrelated = new TOTP({
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
    const unrelatedSecret = unrelated.generateSecret();
    const wrongCode = await new TOTP({
      secret: unrelatedSecret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate(); // fresh random secret, unrelated to the enrolled one

    await expect(service.confirmTotp(user, wrongCode)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects confirmation when no enrollment exists', async () => {
    prisma.totpCredential.findUnique.mockResolvedValue(null);
    await expect(service.confirmTotp(user, '123456')).rejects.toThrow(BadRequestException);
  });

  it('verifyTotp returns false for an unconfirmed credential', async () => {
    prisma.totpCredential.findUnique.mockResolvedValue({ confirmedAt: null, secretEncrypted: 'irrelevant' });
    await expect(service.verifyTotp(user, '123456')).resolves.toBe(false);
  });
});
