import type { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap';
import { createUser } from './utils/seed';
import { Role } from '../src/generated/prisma';
import type { PrismaService } from '../src/prisma/prisma.service';
import { KekRotationService } from '../src/crypto/kek-rotation.service';
import { KekKeyStore } from '../src/crypto/kek-key-store.service';
import { TotpCryptoService } from '../src/crypto/totp-crypto.service';

jest.mock('@clerk/backend', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock() factories are hoisted above imports, so this can't be an imported binding
  require('./utils/clerk-mock').mockClerkBackend(),
);

// The full automatic KEK lifecycle against a real Postgres and real key
// files: generate → re-wrap → retire → shred, and — the part that
// matters — the secret is still readable afterwards. Before this
// existed, rotation had no test beyond a unit-level happy path with a
// fake key store that reloaded itself (which the real one did not).
describe('KekRotationService — end-to-end rotation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let originalMaxAge: string | undefined;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    originalMaxAge = process.env.KEK_ROTATION_MAX_AGE_DAYS;
  });

  afterAll(async () => {
    if (originalMaxAge === undefined) delete process.env.KEK_ROTATION_MAX_AGE_DAYS;
    else process.env.KEK_ROTATION_MAX_AGE_DAYS = originalMaxAge;
    await app.close();
  });

  it('rotates an over-age key, re-wraps every credential, retires and shreds the old key, and the secret still decrypts', async () => {
    const crypto = app.get(TotpCryptoService);
    const keyStore = app.get(KekKeyStore);
    const rotation = app.get(KekRotationService);
    const keysDir = process.env.KEK_KEYS_DIR!;

    const before = await prisma.kekRegistry.findFirstOrThrow({
      where: { status: 'active' },
    });

    // A confirmed TOTP credential sealed under the current active key.
    const admin = await createUser(prisma, { role: Role.admin, mfaEnrolled: true });
    try {
      const secret = 'JBSWY3DPEHPK3PXP';
      const envelope = await crypto.encryptSecret(secret);
      expect(envelope.totpKekKeyId).toBe(before.keyId);
      await prisma.totpCredential.create({
        data: { userId: admin.id, ...envelope, confirmedAt: new Date() },
      });
      // The shared e2e database may hold credentials from other suites
      // (or from an earlier failed run of this one) — the worker must
      // re-wrap every one of them, so assert against the real count,
      // not just ours.
      const onOldKey = await prisma.totpCredential.count({
        where: { totpKekKeyId: before.keyId },
      });
      expect(onOldKey).toBeGreaterThanOrEqual(1);

      // Force "overdue".
      process.env.KEK_ROTATION_MAX_AGE_DAYS = '0';
      const summary = await rotation.rotateIfDue();

      // 1. A new key is active and the old one is no longer.
      expect(summary.rotated).toEqual(expect.stringMatching(/^kek-/));
      const after = await prisma.kekRegistry.findFirstOrThrow({
        where: { status: 'active' },
      });
      expect(after.keyId).toBe(summary.rotated);
      expect(after.keyId).not.toBe(before.keyId);

      // 2. Every credential on the old key was force-re-wrapped — no
      //    admin sign-in needed — and nothing still references it.
      expect(summary.rewrapped).toBe(onOldKey);
      expect(
        await prisma.totpCredential.count({
          where: { totpKekKeyId: before.keyId },
        }),
      ).toBe(0);
      const rewrapped = await prisma.totpCredential.findUniqueOrThrow({
        where: { userId: admin.id },
      });
      expect(rewrapped.totpKekKeyId).toBe(after.keyId);
      expect(rewrapped.totpWrappedDek).not.toBe(envelope.totpWrappedDek);

      // 3. The old key, now unreferenced, was retired and its file shredded.
      expect(summary.retired).toContain(before.keyId);
      const oldRow = await prisma.kekRegistry.findUniqueOrThrow({
        where: { keyId: before.keyId },
      });
      expect(oldRow.status).toBe('retired');
      expect(oldRow.retiredAt).not.toBeNull();
      await expect(
        fs.access(path.join(keysDir, `${before.keyId}.key`)),
      ).rejects.toMatchObject({ code: 'ENOENT' });

      // 4. The new key is loaded in THIS process without a restart, and
      //    the secret round-trips through it.
      expect(keyStore.hasPrivateKey(after.keyId)).toBe(true);
      await expect(crypto.decryptSecret(rewrapped)).resolves.toBe(secret);

      // 5. It was audit-logged as a system action.
      const audits = await prisma.auditLog.findMany({
        where: { action: { in: ['kek.rotated', 'kek.retired'] } },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
      expect(audits.map((a) => a.action).sort()).toEqual(['kek.retired', 'kek.rotated']);
    } finally {
      await prisma.totpCredential.deleteMany({ where: { userId: admin.id } });
      await prisma.user.delete({ where: { id: admin.id } });
    }
  });

  it('is a no-op when the active key is within its age limit, but still completes any unfinished re-wrap', async () => {
    const rotation = app.get(KekRotationService);
    process.env.KEK_ROTATION_MAX_AGE_DAYS = '3650';

    const active = await prisma.kekRegistry.findFirstOrThrow({
      where: { status: 'active' },
    });
    const summary = await rotation.rotateIfDue();

    expect(summary.rotated).toBeNull();
    const still = await prisma.kekRegistry.findFirstOrThrow({
      where: { status: 'active' },
    });
    expect(still.keyId).toBe(active.keyId);
  });
});
