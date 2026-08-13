import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sodium from 'libsodium-wrappers';
import { PrismaService } from '../prisma/prisma.service';

// Loads every active/retiring KEK private key from disk once at process
// start (never per-request — these are read from KEK_KEYS_DIR, one file
// per keyId, permissions 0400). Public keys are not secret and live on
// the KekRegistry row instead. See docs comment on the TotpCredential /
// KekRegistry Prisma models for the full envelope-encryption scheme.
@Injectable()
export class KekKeyStore implements OnModuleInit {
  private readonly privateKeys = new Map<string, Uint8Array>();

  constructor(private readonly prisma: PrismaService) {}

  private get keysDir(): string {
    const dir = process.env.KEK_KEYS_DIR;
    if (!dir)
      throw new InternalServerErrorException('KEK_KEYS_DIR is not configured');
    return dir;
  }

  async onModuleInit() {
    await sodium.ready;
    const rows = await this.prisma.kekRegistry.findMany({
      where: { status: { in: ['active', 'retiring'] } },
    });
    for (const row of rows) {
      const raw = await fs.readFile(
        path.join(this.keysDir, `${row.keyId}.key`),
      );
      this.privateKeys.set(
        row.keyId,
        sodium.from_base64(raw.toString('utf8').trim()),
      );
    }
  }

  getPrivateKey(keyId: string): Uint8Array {
    const key = this.privateKeys.get(keyId);
    if (!key) {
      throw new InternalServerErrorException(
        `No private key loaded for KEK "${keyId}" — it may be retired, or the process needs a restart after key generation`,
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
    });
    if (!row)
      throw new InternalServerErrorException(
        'No active KEK — run `pnpm run kek:generate`',
      );
    return { keyId: row.keyId, publicKey: sodium.from_base64(row.publicKey) };
  }
}
