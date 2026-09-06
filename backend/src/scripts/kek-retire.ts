import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

// `pnpm run kek:retire -- --keyId=<id>` — permanently retires a KEK.
// Refuses if any TotpCredential still references it (rewrap first — the
// KekRotationWorker force-rewraps every credential off a retiring key,
// and each admin also re-wraps on their next successful TOTP
// verification). Once retired, the private key file is overwritten
// before deletion so it isn't trivially recoverable from disk, and the
// row becomes historical only (kept for audit trail, never usable again).
//
// Two guards this script did not originally have, both found in the
// pre-production audit:
//
// 1. It never checked that the key wasn't ACTIVE. The in-use count is 0
//    whenever no admin has enrolled TOTP yet — the normal state of a
//    fresh deployment — so `--keyId=<the active key>` would retire and
//    shred the one key every new enrollment seals to, and
//    getActivePublicKey() would then throw on every MFA operation until
//    someone ran kek:generate. The live registry showed exactly this
//    sequence having happened once (a key retired five minutes after
//    creation, then hand-rolled back in the database).
//
// 2. The in-use count, the status flip and the file shred were three
//    separate, unlocked steps. A credential enrolled between the count
//    and the shred was sealed to a key that no longer existed —
//    permanently undecryptable. The count and the flip are now one
//    Serializable transaction, and the shred happens only after it
//    commits.
async function main() {
  const arg = process.argv.find((a) => a.startsWith('--keyId='));
  const keyId = arg?.split('=')[1];
  if (!keyId) throw new Error('Usage: pnpm run kek:retire -- --keyId=<id>');

  const dir = process.env.KEK_KEYS_DIR;
  if (!dir) throw new Error('KEK_KEYS_DIR is not set');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const row = await tx.kekRegistry.findUnique({ where: { keyId } });
        if (!row) throw new Error(`No KEK "${keyId}" in the registry`);
        if (row.status === 'retired') return 'already-retired' as const;
        if (row.status === 'active') {
          throw new Error(
            `Refusing to retire "${keyId}" — it is the ACTIVE key. ` +
              `Run kek:generate first so a successor becomes active and this one is demoted to "retiring".`,
          );
        }

        const stillInUse = await tx.totpCredential.count({
          where: { totpKekKeyId: keyId },
        });
        if (stillInUse > 0) {
          throw new Error(
            `Refusing to retire "${keyId}" — ${stillInUse} TOTP credential(s) still reference it. ` +
              `The rotation worker re-wraps them to the active key automatically; wait for that ` +
              `(or run the rotation manually) before retiring.`,
          );
        }

        await tx.kekRegistry.update({
          where: { keyId },
          data: { status: 'retired', retiredAt: new Date() },
        });
        return 'retired' as const;
      },
      // Serializable so a concurrent enrollment that reads this key as
      // "retiring" and seals a new credential to it can't interleave
      // between the count above and the status flip.
      { isolationLevel: 'Serializable' },
    );

    if (outcome === 'already-retired') {
      console.log(`KEK "${keyId}" is already retired.`);
    } else {
      console.log(`Retired KEK "${keyId}".`);
    }

    // Shred regardless of which branch we took: an earlier run that
    // committed the status flip but crashed before the unlink would have
    // left live key material on disk under a "retired" row — the exact
    // orphan state the audit found two examples of.
    await shredKeyFile(path.join(dir, `${keyId}.key`));
  } finally {
    await prisma.$disconnect();
  }
}

async function shredKeyFile(keyPath: string) {
  try {
    const stat = await fs.stat(keyPath);
    await fs.chmod(keyPath, 0o600); // the file is 0400; make it writable to overwrite
    await fs.writeFile(keyPath, randomBytes(stat.size)); // overwrite before unlink
    await fs.unlink(keyPath);
    console.log(`Deleted private key file: ${keyPath}`);
  } catch (err) {
    if (
      !(err instanceof Error) ||
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
    console.log(`(private key file already absent: ${keyPath})`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
