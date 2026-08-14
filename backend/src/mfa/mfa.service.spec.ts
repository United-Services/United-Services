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
  let prisma: {
    totpCredential: any;
    user: any;
    kekRegistry: any;
    $transaction: jest.Mock;
  };
  let auditLog: { record: jest.Mock };
  let kekStore: FakeKekKeyStore;
  let service: MfaService;
  // Real in-memory get/set/eval is enough to exercise the afterTimeStep
  // replay guard — no need for a full ioredis mock. `eval` replicates the
  // real atomic compare-and-set Lua script's semantics (synchronously, but
  // that's fine: these tests aren't exercising the concurrency guarantee
  // itself, just that the recorded-vs-not-recorded result is honored).
  let redisStore: Map<string, string>;
  let redis: { get: jest.Mock; set: jest.Mock; eval: jest.Mock };

  beforeEach(async () => {
    prisma = {
      totpCredential: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn() },
      kekRegistry: {
        findUnique: jest.fn().mockResolvedValue({ status: 'active' }),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    kekStore = await FakeKekKeyStore.create();
    kekStore.addActiveKey('kek-test-1');
    redisStore = new Map();
    redis = {
      get: jest.fn((key: string) =>
        Promise.resolve(redisStore.get(key) ?? null),
      ),
      set: jest.fn((key: string, value: string) => {
        redisStore.set(key, value);
        return Promise.resolve('OK');
      }),
      eval: jest.fn(
        (_script: string, _numKeys: number, key: string, value: string) => {
          const current = redisStore.get(key);
          if (!current || Number(value) > Number(current)) {
            redisStore.set(key, value);
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        },
      ),
    };
    service = new MfaService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
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

    await expect(service.confirmTotp(user, wrongCode)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('confirmTotp also rejects a replayed code (shares the same replay guard as verifyTotp)', async () => {
    const { secret } = await service.enrollTotp(user);
    const stored = prisma.totpCredential.upsert.mock.calls[0][0].update;
    prisma.totpCredential.findUnique.mockResolvedValue(stored);

    const validCode = await new TOTP({
      secret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate();

    await expect(service.confirmTotp(user, validCode)).resolves.toEqual({
      success: true,
    });
    await expect(service.confirmTotp(user, validCode)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects confirmation when no enrollment exists', async () => {
    prisma.totpCredential.findUnique.mockResolvedValue(null);
    await expect(service.confirmTotp(user, '123456')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('verifyTotp returns false for an unconfirmed credential', async () => {
    prisma.totpCredential.findUnique.mockResolvedValue({
      confirmedAt: null,
      totpKekKeyId: 'kek-test-1',
    });
    await expect(service.verifyTotp(user, '123456')).resolves.toBe(false);
  });

  it('re-wraps the secret under the active key on successful verify when the stored key is "retiring"', async () => {
    const { secret } = await service.enrollTotp(user);
    const stored = {
      ...prisma.totpCredential.upsert.mock.calls[0][0].update,
      confirmedAt: new Date(),
    };
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

  it('rejects a valid TOTP code the second time it is submitted (replay protection)', async () => {
    const { secret } = await service.enrollTotp(user);
    const stored = {
      ...prisma.totpCredential.upsert.mock.calls[0][0].update,
      confirmedAt: new Date(),
    };
    prisma.totpCredential.findUnique.mockResolvedValue(stored);

    const validCode = await new TOTP({
      secret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate();

    await expect(service.verifyTotp(user, validCode)).resolves.toBe(true);
    // Same code, same time step — must be rejected the second time even
    // though it would otherwise still be within the tolerance window.
    await expect(service.verifyTotp(user, validCode)).resolves.toBe(false);
  });

  it('rejects a replay even when both requests are genuinely concurrent (not sequential)', async () => {
    // A plain GET-then-SET (no atomic compare-and-set) would let both of
    // these resolve true: both calls read the same "nothing recorded yet"
    // state before either writes back. This is the realistic case a
    // double-submit/client-retry produces — not a contrived ordering.
    const { secret } = await service.enrollTotp(user);
    const stored = {
      ...prisma.totpCredential.upsert.mock.calls[0][0].update,
      confirmedAt: new Date(),
    };
    prisma.totpCredential.findUnique.mockResolvedValue(stored);

    const validCode = await new TOTP({
      secret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate();

    const [first, second] = await Promise.all([
      service.verifyTotp(user, validCode),
      service.verifyTotp(user, validCode),
    ]);

    // Exactly one of the two truly-parallel calls may succeed.
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it('replay protection is scoped per user, not global', async () => {
    const { secret } = await service.enrollTotp(user);
    const stored = {
      ...prisma.totpCredential.upsert.mock.calls[0][0].update,
      confirmedAt: new Date(),
    };
    prisma.totpCredential.findUnique.mockResolvedValue(stored);

    const validCode = await new TOTP({
      secret,
      label: user.email,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    }).generate();

    await expect(service.verifyTotp(user, validCode)).resolves.toBe(true);

    const otherUser = { id: 'admin-2', email: 'other@use-eg.com' } as User;
    // Same credential row looked up (mock doesn't differentiate by id),
    // but the replay-guard key is keyed by user.id, so a different user
    // submitting the same still-valid code must not be blocked by the
    // first user's usage record.
    await expect(service.verifyTotp(otherUser, validCode)).resolves.toBe(true);
  });

  it('does not re-wrap when the stored key is still active', async () => {
    const { secret } = await service.enrollTotp(user);
    const stored = {
      ...prisma.totpCredential.upsert.mock.calls[0][0].update,
      confirmedAt: new Date(),
    };
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

  // Distinct from enrollment (mfaEnrolled, a permanent fact about the
  // account): this tracks whether *this specific Clerk session* has
  // proven the second factor, so a new sign-in — a new session id — is
  // never treated as already verified just because the account enrolled
  // once in the past. See MfaSessionVerifiedGuard.
  describe('session verification', () => {
    it('is not verified for a session that has never been marked', async () => {
      await expect(service.isSessionVerified('sess_1')).resolves.toBe(false);
    });

    it('is verified after being marked', async () => {
      await service.markSessionVerified('sess_1');
      await expect(service.isSessionVerified('sess_1')).resolves.toBe(true);
    });

    it('scopes verification per session id — marking one session never verifies another', async () => {
      await service.markSessionVerified('sess_1');
      await expect(service.isSessionVerified('sess_2')).resolves.toBe(false);
    });

    it('sets an expiry on the verification record rather than storing it forever', async () => {
      await service.markSessionVerified('sess_1');
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('sess_1'),
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });
  });
});
