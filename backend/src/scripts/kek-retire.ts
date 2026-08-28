import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

// `pnpm run kek:retire -- --keyId=<id>` — permanently retires a KEK.
// Refuses if any TotpCredential still references it (rewrap first — every
// admin re-wraps automatically on their next successful TOTP verification
// once the key is "retiring"; force it sooner by asking them to sign in).
// Once retired, the private key file is overwritten before deletion so it
// isn't trivially recoverable from disk, and the row becomes historical
// only (kept for audit trail, never usable again).
async function main() {
  const arg = process.argv.find((a) => a.startsWith('--keyId='));
  const keyId = arg?.split('=')[1];
  if (!keyId) throw new Error('Usage: pnpm run kek:retire -- --keyId=<id>');

  const dir = process.env.KEK_KEYS_DIR;
  if (!dir) throw new Error('KEK_KEYS_DIR is not set');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const row = await prisma.kekRegistry.findUnique({ where: { keyId } });
    if (!row) throw new Error(`No KEK "${keyId}" in the registry`);
    if (row.status === 'retired') {
      console.log(`KEK "${keyId}" is already retired.`);
      return;
    }

    const stillInUse = await prisma.totpCredential.count({
      where: { totpKekKeyId: keyId },
    });
    if (stillInUse > 0) {
      throw new Error(
        `Refusing to retire "${keyId}" — ${stillInUse} TOTP credential(s) still reference it. ` +
          `They rewrap automatically to the active key on the admin's next successful verification; ` +
          `wait for that (or ask them to sign in) before retiring.`,
      );
    }

    await prisma.kekRegistry.update({
      where: { keyId },
      data: { status: 'retired', retiredAt: new Date() },
    });

    const keyPath = path.join(dir, `${keyId}.key`);
    try {
      const stat = await fs.stat(keyPath);
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

    console.log(`Retired KEK "${keyId}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
