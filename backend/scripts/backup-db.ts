import 'dotenv/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../src/generated/prisma';

// `npm run backup:db` — dumps every table to a single timestamped JSON
// file on disk, meant to be run on a schedule (e.g. `0 */6 * * *` via
// cron) rather than only by hand. Walks Prisma's own DMMF for the model
// list instead of a hardcoded array, so a new model added to
// schema.prisma is backed up automatically without this script needing
// to be touched.
//
// This is a full, unfiltered snapshot — every row of every table,
// including things like WebAuthnCredential public keys and TOTP
// ciphertext (already encrypted at rest; useless without the private KEK
// file this script does NOT copy). Treat BACKUP_DIR like any other
// secret-adjacent path: outside the repo, not world-readable, not
// synced anywhere public.
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), 'backups');
const DEFAULT_RETENTION = 28; // 7 days of 6-hourly backups

// JSON has no BigInt/Buffer/Date literal — without this, JSON.stringify
// throws outright on BigInt (WebAuthnCredential.counter) and silently
// mangles Buffer (WebAuthnCredential.publicKey) into a giant {0:.., 1:..}
// object instead of something restorable.
function serialize(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (Buffer.isBuffer(value)) return { $buffer: value.toString('base64') };
  return value;
}

async function pruneOldBackups(dir: string, keep: number) {
  const entries = await fs.readdir(dir);
  const backups = entries.filter((f) => /^backup-.*\.json$/.test(f)).sort(); // ISO timestamps in the filename sort chronologically as strings
  const toDelete = backups.slice(0, Math.max(0, backups.length - keep));
  await Promise.all(toDelete.map((f) => fs.unlink(path.join(dir, f))));
  if (toDelete.length > 0) {
    console.log(
      `Pruned ${toDelete.length} backup(s) older than the last ${keep}.`,
    );
  }
}

async function main() {
  const outDir = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;
  const retention = process.env.BACKUP_RETENTION_COUNT
    ? parseInt(process.env.BACKUP_RETENTION_COUNT, 10)
    : DEFAULT_RETENTION;
  await fs.mkdir(outDir, { recursive: true });

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const snapshot: Record<string, unknown[]> = {};
  try {
    const models = Prisma.dmmf.datamodel.models;
    for (const model of models) {
      // Prisma exposes each model as a client property named in
      // camelCase from the model's PascalCase name (e.g. `Ticket` ->
      // `prisma.ticket`) — same convention the generated client itself
      // uses everywhere else in this codebase.
      const clientKey =
        model.name.charAt(0).toLowerCase() + model.name.slice(1);
      const delegate = (
        prisma as unknown as Record<
          string,
          { findMany: () => Promise<unknown[]> }
        >
      )[clientKey];
      if (!delegate || typeof delegate.findMany !== 'function') {
        console.warn(
          `Skipping "${model.name}" — no matching client delegate found.`,
        );
        continue;
      }
      snapshot[model.name] = await delegate.findMany();
    }
  } finally {
    await prisma.$disconnect();
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(outDir, `backup-${timestamp}.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    tables: snapshot,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, serialize, 2), {
    mode: 0o600,
  });

  const rowCount = Object.values(snapshot).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );
  console.log(`Backup written to ${filePath}`);
  console.log(
    `  ${Object.keys(snapshot).length} tables, ${rowCount} total rows`,
  );

  await pruneOldBackups(outDir, retention);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
