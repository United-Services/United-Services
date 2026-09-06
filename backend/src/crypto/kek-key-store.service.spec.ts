import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import sodium from 'libsodium-wrappers';
import { KekKeyStore } from './kek-key-store.service';
import { KekSsmBackup } from './kek-ssm-backup.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('KekKeyStore', () => {
  function makeStore() {
    const prisma = {
      kekRegistry: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
    // KEK_SSM_BACKUP_ENABLED is unset under test, so this is a no-op
    // backup: getKey() resolves null, putKey() returns immediately.
    return { store: new KekKeyStore(prisma, new KekSsmBackup()), prisma };
  }

  it('does not fail boot when a registry row has no key file — degrades that one key and logs', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kek-test-'));
    const original = process.env.KEK_KEYS_DIR;
    process.env.KEK_KEYS_DIR = dir;
    try {
      const { store, prisma } = makeStore();
      (prisma.kekRegistry.findMany as jest.Mock).mockResolvedValue([
        { keyId: 'kek-missing-file', status: 'retiring' },
      ]);

      // Used to throw ENOENT out of onModuleInit and take the whole API
      // down with it; now the key is simply unavailable.
      await expect(store.onModuleInit()).resolves.toBeUndefined();
      expect(store.hasPrivateKey('kek-missing-file')).toBe(false);
    } finally {
      if (original) process.env.KEK_KEYS_DIR = original;
      else delete process.env.KEK_KEYS_DIR;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('getActivePublicKey refuses (fails closed) an active key whose private half is not loaded here', async () => {
    const { store, prisma } = makeStore();
    (prisma.kekRegistry.findFirst as jest.Mock).mockResolvedValue({
      keyId: 'kek-2',
      publicKey: 'AAAA',
      status: 'active',
    });
    (prisma.kekRegistry.findMany as jest.Mock).mockResolvedValue([]);

    await expect(store.getActivePublicKey()).rejects.toThrow(
      /refusing to encrypt/,
    );
  });

  it('throws a clear error when a keyId is not loaded and a reload does not find it either', async () => {
    const { store, prisma } = makeStore();
    (prisma.kekRegistry.findMany as jest.Mock).mockResolvedValue([]);
    await expect(store.getPrivateKey('kek-never-loaded')).rejects.toThrow(
      InternalServerErrorException,
    );
    // The miss path re-read the registry rather than demanding a restart.
    expect(prisma.kekRegistry.findMany).toHaveBeenCalled();
  });

  it('throws when KEK_KEYS_DIR is not configured at all', async () => {
    const original = process.env.KEK_KEYS_DIR;
    delete process.env.KEK_KEYS_DIR;
    const { store, prisma } = makeStore();
    (prisma.kekRegistry.findMany as jest.Mock).mockResolvedValue([
      { keyId: 'kek-1', status: 'active' },
    ]);

    await expect(store.onModuleInit()).rejects.toThrow(
      InternalServerErrorException,
    );

    if (original) process.env.KEK_KEYS_DIR = original;
  });

  it('getPublicKey throws for an unknown keyId rather than returning undefined', async () => {
    const { store, prisma } = makeStore();
    (prisma.kekRegistry.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(store.getPublicKey('kek-unknown')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('getActivePublicKey throws with guidance when there is no active KEK', async () => {
    const { store, prisma } = makeStore();
    (prisma.kekRegistry.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(store.getActivePublicKey()).rejects.toThrow(/kek:generate/);
  });

  // The four tests above only cover error/edge paths. This exercises the
  // actual happy path — reading a real key file off disk from KEK_KEYS_DIR
  // and base64-decoding it via libsodium — which was previously only ever
  // exercised end-to-end (via `pnpm run kek:generate` in the e2e job), never
  // in a fast unit test.
  it('loads a real private key file from KEK_KEYS_DIR on module init and returns it', async () => {
    await sodium.ready;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kek-test-'));
    const original = process.env.KEK_KEYS_DIR;
    process.env.KEK_KEYS_DIR = dir;
    try {
      const keyPair = sodium.crypto_box_keypair();
      await fs.writeFile(
        path.join(dir, 'kek-1.key'),
        sodium.to_base64(keyPair.privateKey),
      );

      const { store, prisma } = makeStore();
      (prisma.kekRegistry.findMany as jest.Mock).mockResolvedValue([
        { keyId: 'kek-1', status: 'active' },
      ]);

      await store.onModuleInit();

      await expect(store.getPrivateKey('kek-1')).resolves.toEqual(
        keyPair.privateKey,
      );
    } finally {
      if (original) process.env.KEK_KEYS_DIR = original;
      else delete process.env.KEK_KEYS_DIR;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
