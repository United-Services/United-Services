import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sodium from 'libsodium-wrappers';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';

// `pnpm run kek:generate` — generates a new KEK keypair, writes the
// private key to disk (0400), registers the public key in KekRegistry as
// "active", and demotes any previous active key to "retiring" (its
// private key file is left in place — TotpCryptoService still needs it to
// decrypt secrets wrapped under it until they're rewrapped, which happens
// automatically the next time each admin verifies a TOTP code; see
// MfaService.rewrapIfKekRetiring).
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
  } finally {
    await prisma.$disconnect();
  }

  console.log(`Generated KEK "${keyId}"`);
  console.log(`  private key: ${keyPath} (0400)`);
  console.log(`  public key registered as active in KekRegistry`);
  console.log(`Restart the app so KekKeyStore picks up the new key.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
