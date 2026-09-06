import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';
import { KekSsmBackup } from '../crypto/kek-ssm-backup.service';

// `pnpm run kek:generate` — generates a new KEK keypair, writes the
// private key to disk (0400), backs it up to SSM (when
// KEK_SSM_BACKUP_ENABLED=true — see KekSsmBackup), registers the public
// key in KekRegistry as "active", and demotes any previous active key to
// "retiring" (its private key file is left in place — TotpCryptoService
// still needs it to decrypt secrets wrapped under it until they're
// rewrapped; the KekRotationWorker force-rewraps them on its next run,
// and each admin also re-wraps on their next successful verification).
//
// This is the manual/bootstrap path (docker-entrypoint.sh runs it on an
// empty registry). Scheduled rotation is KekRotationService, which does
// the same generate step in-process and then completes the cycle.
async function main() {
  await sodium.ready;

  const dir = process.env.KEK_KEYS_DIR;
  if (!dir) throw new Error('KEK_KEYS_DIR is not set');
  await fs.mkdir(dir, { recursive: true });

  // Full timestamp (not just the date) so an intentional same-day
  // rotation never collides with the previous key's filename — a
  // date-only id would try to overwrite that day's already-0400 file and
  // fail with EACCES.
  const keyId = `kek-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const { publicKey, privateKey } = sodium.crypto_box_keypair();

  const keyPath = path.join(dir, `${keyId}.key`);
  await fs.writeFile(keyPath, sodium.to_base64(privateKey), { mode: 0o400 });
  await fs.chmod(keyPath, 0o400); // writeFile's mode is subject to umask — enforce it explicitly

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$transaction([
      prisma.kekRegistry.updateMany({
        where: { status: 'active' },
        data: { status: 'retiring' },
      }),
      prisma.kekRegistry.create({
        data: {
          keyId,
          publicKey: sodium.to_base64(publicKey),
          status: 'active',
        },
      }),
    ]);
  } catch (err) {
    // The key file was written BEFORE the registry transaction. If the
    // transaction fails (database unreachable, unique-index violation
    // from a concurrent run), a 0400 private key with no registry row is
    // left on disk permanently — the audit found two such orphans. Shred
    // it before surfacing the error.
    try {
      await fs.chmod(keyPath, 0o600);
      await fs.writeFile(keyPath, randomBytes(privateKey.length * 2));
      await fs.unlink(keyPath);
    } catch {
      // Best effort — the original failure is the one worth reporting.
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }

  // After the registry commit, so an SSM copy can never exist for a key
  // that isn't registered.
  const backup = new KekSsmBackup();
  await backup.putKey(keyId, sodium.to_base64(privateKey));

  console.log(`Generated KEK "${keyId}"`);
  console.log(`  private key: ${keyPath} (0400)`);
  console.log(
    backup.enabled
      ? `  private key backed up to SSM`
      : `  WARNING: KEK_SSM_BACKUP_ENABLED is not "true" — no off-host backup of this key was made`,
  );
  console.log(`  public key registered as active in KekRegistry`);
  console.log(
    `Running app instances pick the new key up automatically (KekKeyStore reloads on its next miss); no restart needed.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
