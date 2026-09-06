import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sodium from 'libsodium-wrappers';
import { PrismaService } from '../prisma/prisma.service';
import { KekSsmBackup } from './kek-ssm-backup.service';

// Don't hit the database on every private-key miss: a genuinely retired
// or unknown keyId would otherwise trigger a registry re-read per call.
// One reload per window is plenty — a real rotation is a once-per-months
// event, and the window only bounds how quickly a replica notices it.
const RELOAD_MIN_INTERVAL_MS = 5_000;

// Holds KEK private key material for the process. See the docs comment
// on the TotpCredential / KekRegistry Prisma models for the envelope-
// encryption scheme.
//
// Originally loaded ONCE at boot and never again, while
// getActivePublicKey() read the registry live — so after a rotation a
// running process encrypted under the new key without being able to
// decrypt under it: TOTP enrollment 500'd on confirm, and a working
// credential was bricked by the act of verifying it (the successful
// verify re-wrapped it to a key this process couldn't read). Under
// automated rotation that would have fired on every replica.
//
// Now: reload() re-reads the registry and loads any key file not yet in
// memory; both lookups call it lazily on a miss; and getActivePublicKey()
// refuses to hand out a key whose private half isn't loaded here — it
// fails closed at ENCRYPT time rather than open at decrypt time, so a
// replica that can't read the new key rejects the operation instead of
// sealing a secret nobody can open.
@Injectable()
export class KekKeyStore implements OnModuleInit {
  private readonly logger = new Logger(KekKeyStore.name);
  private readonly privateKeys = new Map<string, Uint8Array>();
  private lastReloadAt = 0;
  private reloading: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backup: KekSsmBackup,
  ) {}

  private get keysDir(): string {
    const dir = process.env.KEK_KEYS_DIR;
    if (!dir)
      throw new InternalServerErrorException('KEK_KEYS_DIR is not configured');
    return dir;
  }

  async onModuleInit() {
    await sodium.ready;
    await this.reload();
  }

  // Loads every active/retiring key's private half that isn't already in
  // memory. Safe to call at any time; concurrent callers share one
  // in-flight reload. A key file that can't be read degrades THAT key
  // (logged at error) rather than throwing — this used to be an
  // unguarded readFile inside module init, so one missing file failed
  // Nest bootstrap and the entire HTTP API refused to start, not just
  // MFA. See docs/DISASTER_RECOVERY.md "KEK private keys".
  async reload(): Promise<void> {
    if (this.reloading) return this.reloading;
    this.reloading = this.doReload().finally(() => {
      this.reloading = null;
    });
    return this.reloading;
  }

  private async doReload(): Promise<void> {
    this.lastReloadAt = Date.now();
    const rows = await this.prisma.kekRegistry.findMany({
      where: { status: { in: ['active', 'retiring'] } },
    });
    for (const row of rows) {
      if (this.privateKeys.has(row.keyId)) continue;
      const keyPath = path.join(this.keysDir, `${row.keyId}.key`);
      try {
        const raw = await this.readOrRestoreKeyFile(row.keyId, keyPath);
        this.privateKeys.set(row.keyId, sodium.from_base64(raw.trim()));
      } catch (err) {
        this.logger.error(
          `Could not load private key for ${row.status} KEK "${row.keyId}" from ${keyPath} — ` +
            `credentials sealed to it cannot be decrypted by this process: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Local volume first; if the file is absent, the SSM backup (a fresh
  // volume, a new host, or a key another replica generated). A restored
  // file is written back at 0400 so the next reload is local again.
  private async readOrRestoreKeyFile(
    keyId: string,
    keyPath: string,
  ): Promise<string> {
    try {
      return (await fs.readFile(keyPath)).toString('utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const fromBackup = await this.backup.getKey(keyId);
    if (!fromBackup) {
      throw new Error(
        `key file missing and no SSM backup available (KEK_SSM_BACKUP_ENABLED=${process.env.KEK_SSM_BACKUP_ENABLED ?? 'unset'})`,
      );
    }
    await fs.mkdir(path.dirname(keyPath), { recursive: true });
    await fs.writeFile(keyPath, fromBackup, { mode: 0o400 });
    await fs.chmod(keyPath, 0o400);
    this.logger.warn(`KEK "${keyId}" private key restored from SSM to ${keyPath}`);
    return fromBackup;
  }

  private async reloadIfStale(): Promise<void> {
    if (Date.now() - this.lastReloadAt < RELOAD_MIN_INTERVAL_MS) return;
    await this.reload();
  }

  async getPrivateKey(keyId: string): Promise<Uint8Array> {
    let key = this.privateKeys.get(keyId);
    if (!key) {
      // Most likely a key generated after this process booted (rotation
      // on another replica, or the CLI) — pick it up rather than demand
      // a restart.
      await this.reloadIfStale();
      key = this.privateKeys.get(keyId);
    }
    if (!key) {
      throw new InternalServerErrorException(
        `No private key loaded for KEK "${keyId}" — it may be retired, or its key file is missing from KEK_KEYS_DIR`,
      );
    }
    return key;
  }

  async getPublicKey(keyId: string): Promise<Uint8Array> {
    const row = await this.prisma.kekRegistry.findUnique({ where: { keyId } });
    if (!row) throw new InternalServerErrorException(`Unknown KEK "${keyId}"`);
    return sodium.from_base64(row.publicKey);
  }

  async getActivePublicKey(): Promise<{
    keyId: string;
    publicKey: Uint8Array;
  }> {
    const row = await this.prisma.kekRegistry.findFirst({
      where: { status: 'active' },
      // Deterministic if the one-active invariant is ever violated
      // (KekRegistry_one_active_idx makes that a constraint, but a
      // findFirst with no ordering is still a latent surprise).
      orderBy: { createdAt: 'desc' },
    });
    if (!row)
      throw new InternalServerErrorException(
        'No active KEK — run `pnpm run kek:generate`',
      );

    // Fail closed: never seal a new secret to a key this process can't
    // open. A miss here means a rotation happened since the last load —
    // reload once, and only if the private half is genuinely absent
    // refuse the operation.
    if (!this.privateKeys.has(row.keyId)) {
      await this.reloadIfStale();
      if (!this.privateKeys.has(row.keyId)) {
        throw new InternalServerErrorException(
          `Active KEK "${row.keyId}" has no private key loaded in this process — refusing to encrypt under a key that could not be decrypted here`,
        );
      }
    }

    return { keyId: row.keyId, publicKey: sodium.from_base64(row.publicKey) };
  }

  // Which keys this process can currently decrypt under — used by the
  // rotation worker to confirm a retiring key is loaded before it
  // attempts a bulk re-wrap off it.
  hasPrivateKey(keyId: string): boolean {
    return this.privateKeys.has(keyId);
  }
}
