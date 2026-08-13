import { InternalServerErrorException } from '@nestjs/common';
import { KekKeyStore } from './kek-key-store.service';
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
    return { store: new KekKeyStore(prisma), prisma };
  }

  it('throws a clear error asking for a restart when a keyId was never loaded', () => {
    const { store } = makeStore();
    expect(() => store.getPrivateKey('kek-never-loaded')).toThrow(
      InternalServerErrorException,
    );
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
});
