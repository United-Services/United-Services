import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { KekKeyStore } from './kek-key-store.service';
import { KekSsmBackup } from './kek-ssm-backup.service';
import { TotpCryptoService } from './totp-crypto.service';

const DEFAULT_MAX_AGE_DAYS = 90;
const REWRAP_BATCH = 100;

export interface KekRotationSummary {
  rotated: string | null;
  rewrapped: number;
  retired: string[];
  skippedRetiring: string[];
}

// The automatic KEK lifecycle. Before this, rotation was a human
// running `kek:generate`, and COMPLETING one additionally needed a
// human to run `kek:retire` after every TOTP-enrolled admin had
// happened to sign in (the re-wrap was opportunistic, on successful
// verify only). Nothing scheduled any of it, nothing alerted when it
// was overdue, and the live registry showed exactly that: an 8-day-old
// key with no successor and no rotation ever completed.
//
// rotateIfDue(), run daily by KekRotationWorker, does the whole cycle:
//
//   1. generate  — if the active key is older than
//                  KEK_ROTATION_MAX_AGE_DAYS: new keypair, file at 0400,
//                  registry flip in one transaction (the partial unique
//                  index KekRegistry_one_active_idx rejects a concurrent
//                  duplicate outright), SSM backup, key-store reload.
//   2. re-wrap   — every TotpCredential still sealed to a retiring key
//                  is decrypted under it and re-sealed under the active
//                  key, in batches. Forced, not opportunistic — this is
//                  what lets a rotation finish without every admin
//                  logging in.
//   3. retire    — a retiring key with zero remaining references is
//                  marked retired (Serializable, re-counting inside the
//                  transaction) and its file shredded.
//
// Every step is idempotent and resumable: a crash mid-re-wrap leaves
// some rows on the old key and some on the new, and the next run's
// `where: { totpKekKeyId: retiring }` simply picks up the remainder.
//
// Multi-replica safety comes from BullMQ (one scheduler id, concurrency
// 1 — the job fires on one replica), and from KekKeyStore's lazy reload
// on the OTHER replicas: they notice the new active key on their next
// encrypt/decrypt miss rather than needing a restart, and fail closed
// (refuse to encrypt) if they genuinely can't load it.
@Injectable()
export class KekRotationService {
  private readonly logger = new Logger(KekRotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyStore: KekKeyStore,
    private readonly backup: KekSsmBackup,
    private readonly totpCrypto: TotpCryptoService,
    private readonly auditLog: AuditLogService,
  ) {}

  // 0 is a legitimate value — "rotate on the next run, whatever the
  // age" — used to force a rotation without waiting out the policy
  // (and by the e2e test). Only a negative or non-numeric value falls
  // back to the default.
  private get maxAgeDays(): number {
    const raw = process.env.KEK_ROTATION_MAX_AGE_DAYS;
    if (raw === undefined || raw === '') return DEFAULT_MAX_AGE_DAYS;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_AGE_DAYS;
  }

  private get keysDir(): string {
    const dir = process.env.KEK_KEYS_DIR;
    if (!dir) throw new Error('KEK_KEYS_DIR is not configured');
    return dir;
  }

  async rotateIfDue(): Promise<KekRotationSummary> {
    await sodium.ready;
    const summary: KekRotationSummary = {
      rotated: null,
      rewrapped: 0,
      retired: [],
      skippedRetiring: [],
    };

    if (!this.backup.enabled) {
      // Not fatal — rotation is still safer than no rotation — but the
      // operator must know the only copy of every key is one volume.
      this.logger.error(
        'KEK_SSM_BACKUP_ENABLED is not "true": KEK private keys are NOT backed up off-host. Set it in production.',
      );
    }

    const active = await this.prisma.kekRegistry.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) {
      // First-boot bootstrap is docker-entrypoint.sh's job (it runs
      // kek-generate when the registry is empty); never silently create
      // the very first key from a background job.
      this.logger.error('No active KEK in the registry — nothing to rotate.');
      return summary;
    }

    const ageDays =
      (Date.now() - active.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays >= this.maxAgeDays) {
      summary.rotated = await this.generate(active.keyId, ageDays);
    } else {
      this.logger.log(
        `Active KEK "${active.keyId}" is ${ageDays.toFixed(1)} days old (limit ${this.maxAgeDays}) — no rotation needed.`,
      );
    }

    // Steps 2 and 3 run on every invocation regardless, so a rotation
    // that was interrupted (or a manual kek:generate) is always driven to
    // completion by the next scheduled run.
    const retiring = await this.prisma.kekRegistry.findMany({
      where: { status: 'retiring' },
      orderBy: { createdAt: 'asc' },
    });
    for (const key of retiring) {
      if (!this.keyStore.hasPrivateKey(key.keyId)) {
        await this.keyStore.reload();
      }
      if (!this.keyStore.hasPrivateKey(key.keyId)) {
        // Can't decrypt off it here, so can't re-wrap and must not
        // retire (that would shred a key with live references).
        this.logger.error(
          `Retiring KEK "${key.keyId}" has no private key loaded — its credentials cannot be re-wrapped by this process.`,
        );
        summary.skippedRetiring.push(key.keyId);
        continue;
      }
      summary.rewrapped += await this.rewrapAll(key.keyId);
      if (await this.retireIfUnreferenced(key.keyId)) {
        summary.retired.push(key.keyId);
      }
    }

    this.logger.warn(
      `KEK rotation run complete: ${JSON.stringify(summary)}`,
    );
    return summary;
  }

  private async generate(
    previousKeyId: string,
    previousAgeDays: number,
  ): Promise<string> {
    const dir = this.keysDir;
    await fs.mkdir(dir, { recursive: true });
    const keyId = `kek-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const { publicKey, privateKey } = sodium.crypto_box_keypair();
    const privateKeyBase64 = sodium.to_base64(privateKey);
    const keyPath = path.join(dir, `${keyId}.key`);

    await fs.writeFile(keyPath, privateKeyBase64, { mode: 0o400 });
    await fs.chmod(keyPath, 0o400);

    try {
      await this.prisma.$transaction([
        this.prisma.kekRegistry.updateMany({
          where: { status: 'active' },
          data: { status: 'retiring' },
        }),
        this.prisma.kekRegistry.create({
          data: { keyId, publicKey: sodium.to_base64(publicKey), status: 'active' },
        }),
      ]);
    } catch (err) {
      // Never leave an unregistered private key on disk.
      await this.shredFile(keyPath).catch(() => undefined);
      throw err;
    } finally {
      sodium.memzero(privateKey);
    }

    await this.backup.putKey(keyId, privateKeyBase64);
    await this.keyStore.reload();

    await this.auditLog.record({
      action: 'kek.rotated',
      targetType: 'KekRegistry',
      targetId: keyId,
      metadata: {
        fromKeyId: previousKeyId,
        previousKeyAgeDays: Math.round(previousAgeDays),
      },
    });
    this.logger.warn(
      `Rotated KEK: "${previousKeyId}" (${previousAgeDays.toFixed(1)} days) → "${keyId}" now active`,
    );
    return keyId;
  }

  // Re-seals every credential on `retiringKeyId` under the active key.
  // Each row is its own update, so a crash loses at most one row's
  // worth of progress and the next run resumes from the remainder.
  private async rewrapAll(retiringKeyId: string): Promise<number> {
    let done = 0;
    for (;;) {
      const rows = await this.prisma.totpCredential.findMany({
        where: { totpKekKeyId: retiringKeyId },
        take: REWRAP_BATCH,
        orderBy: { userId: 'asc' },
      });
      if (rows.length === 0) return done;

      for (const row of rows) {
        const plain = await this.totpCrypto.decryptSecret(row);
        const envelope = await this.totpCrypto.encryptSecret(plain);
        // Guard on the key we read, so a concurrent verify-triggered
        // re-wrap (MfaService.rewrapIfKekRetiring) that beat us to this
        // row is not overwritten with a second, redundant envelope.
        const result = await this.prisma.totpCredential.updateMany({
          where: { userId: row.userId, totpKekKeyId: retiringKeyId },
          data: envelope,
        });
        if (result.count === 0) continue;
        done += 1;
        await this.auditLog.record({
          action: 'mfa.totp_rewrapped',
          targetType: 'TotpCredential',
          targetId: row.userId,
          metadata: {
            fromKeyId: retiringKeyId,
            toKeyId: envelope.totpKekKeyId,
            trigger: 'rotation-worker',
          },
        });
      }
      if (rows.length < REWRAP_BATCH) return done;
    }
  }

  // Same guards as kek-retire.ts, in-process: re-count inside a
  // Serializable transaction and shred only after it commits.
  private async retireIfUnreferenced(keyId: string): Promise<boolean> {
    const retired = await this.prisma.$transaction(
      async (tx) => {
        const row = await tx.kekRegistry.findUnique({ where: { keyId } });
        if (!row || row.status !== 'retiring') return false;
        const stillInUse = await tx.totpCredential.count({
          where: { totpKekKeyId: keyId },
        });
        if (stillInUse > 0) return false;
        await tx.kekRegistry.update({
          where: { keyId },
          data: { status: 'retired', retiredAt: new Date() },
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
    if (!retired) return false;

    await this.shredFile(path.join(this.keysDir, `${keyId}.key`));
    await this.auditLog.record({
      action: 'kek.retired',
      targetType: 'KekRegistry',
      targetId: keyId,
    });
    this.logger.warn(`Retired KEK "${keyId}" and shredded its private key file`);
    return true;
  }

  private async shredFile(keyPath: string): Promise<void> {
    try {
      const stat = await fs.stat(keyPath);
      await fs.chmod(keyPath, 0o600);
      await fs.writeFile(keyPath, randomBytes(stat.size));
      await fs.unlink(keyPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }
}
