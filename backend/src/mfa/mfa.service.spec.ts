import { TOTP } from '@otplib/totp';
import { NobleCryptoPlugin } from '@otplib/plugin-crypto-noble';
import { ScureBase32Plugin } from '@otplib/plugin-base32-scure';
import { BadRequestException } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { TotpCryptoService } from '../crypto/totp-crypto.service';
import { FakeKekKeyStore } from '../crypto/testing/fake-kek-key-store';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { User } from '../generated/prisma';

// TOTP enrollment/confirmation is the primary MFA path for admin accounts.
// Envelope encryption-at-rest of the secret must round-trip correctly
// (exercised for real in totp-crypto.service.spec.ts), and a code
// generated from a *different* secret must never verify.
describe('MfaService — TOTP', () => {
  const user = { id: 'admin-1', email: 'admin@use-eg.com' } as User;
  let prisma: { totpCredential: any; user: any; kekRegistry: any; $transaction: jest.Mock };
  let auditLog: { record: jest.Mock };
  let kekStore: FakeKekKeyStore;
  let service: MfaService;

  beforeEach(async () => {
    prisma = {
      totpCredential: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      user: { update: jest.fn() },
      kekRegistry: { findUnique: jest.fn().mockResolvedValue({ status: 'active' }) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    kekStore = await FakeKekKeyStore.create();
    kekStore.addActiveKey('kek-test-1');
    service = new MfaService(
      prisma as unknown as PrismaService,
      {} as RedisService,
      new TotpCryptoService(kekStore.asKekKeyStore()),
      auditLog as unknown as AuditLogService,
    );
  });

  it('confirms enrollment with a code generated from the enrolled secret', async () => {
    const { secret } = await service.enrollTotp(user);
    expect(prisma.totpCredential.upsert).toHaveBeenCalled();

    const stored = prisma.totpCredential.upsert.mock.calls[0][0].update;
    prisma.totpCredential.findUnique.mockResolvedValue(stored);

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
    await service.enrollTotp(user);
    const stored = prisma.totpCredential.upsert.mock.calls[0][0].update;
    prisma.totpCredential.findUnique.mockResolvedValue(stored);

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
    prisma.totpCredential.findUnique.mockResolvedValue({ confirmedAt: null, totpKekKeyId: 'kek-test-1' });
    await expect(service.verifyTotp(user, '123456')).resolves.toBe(false);
  });

  it('re-wraps the secret under the active key on successful verify when the stored key is "retiring"', async () => {
    const { secret } = await service.enrollTotp(user);
    const stored = { ...prisma.totpCredential.upsert.mock.calls[0][0].update, confirmedAt: new Date() };
    prisma.totpCredential.findUnique.mockResolvedValue(stored);
    prisma.kekRegistry.findUnique.mockResolvedValue({ status: 'retiring' });

    const validCode = await new TOTP({
      secret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate();

    // A second, now-active key must exist so re-encryption has somewhere
    // to wrap the DEK to (the old key stays loaded for decrypting the
    // secret we're about to re-wrap).
    kekStore.addActiveKey('kek-test-2');

    const result = await service.verifyTotp(user, validCode);

    expect(result).toBe(true);
    expect(prisma.totpCredential.update).toHaveBeenCalled();
    const rewrapped = prisma.totpCredential.update.mock.calls[0][0].data;
    expect(rewrapped.totpKekKeyId).toBe('kek-test-2');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'mfa.totp_rewrapped',
        metadata: { fromKeyId: 'kek-test-1', toKeyId: 'kek-test-2' },
      }),
    );
  });

  it('does not re-wrap when the stored key is still active', async () => {
    const { secret } = await service.enrollTotp(user);
    const stored = { ...prisma.totpCredential.upsert.mock.calls[0][0].update, confirmedAt: new Date() };
    prisma.totpCredential.findUnique.mockResolvedValue(stored);
    prisma.kekRegistry.findUnique.mockResolvedValue({ status: 'active' });

    const validCode = await new TOTP({
      secret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate();

    await service.verifyTotp(user, validCode);

    expect(prisma.totpCredential.update).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });
});
