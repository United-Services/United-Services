import { DbMirrorSyncService, SYNC_BATCH_SIZE } from './db-mirror-sync.service';
import type { PrismaService } from '../prisma/prisma.service';

const execFileMock = jest.fn((...args: unknown[]) => {
  const cb = args[args.length - 1] as (
    err: Error | null,
    result?: { stdout: string; stderr: string },
  ) => void;
  cb(null, { stdout: '', stderr: '' });
});
jest.mock('child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

// One controllable mock model ('user') plus 18 inert no-op models, so
// syncAll()'s full 19-model loop completes quickly while still letting
// tests assert precisely on one model's batching/delete-reconciliation
// behavior.
const OTHER_MODELS = [
  'totpCredential',
  'kekRegistry',
  'webAuthnCredential',
  'service',
  'serviceFile',
  'fileAccessRequest',
  'serviceRequest',
  'appointmentSlot',
  'appointment',
  'openPosition',
  'candidateApplication',
  'candidateDocument',
  'auditLog',
  'auditLogArchive',
  'allowedOrigin',
  'analyticsEvent',
  'ticket',
  'contentTranslation',
];

function makeInertModel() {
  return { findMany: jest.fn().mockResolvedValue([]) };
}

let localUserModel: {
  findMany: jest.Mock;
  upsert: jest.Mock;
  deleteMany: jest.Mock;
};
let localTransactionMock: jest.Mock;

jest.mock('../generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => {
    const client: Record<string, unknown> = {
      user: localUserModel,
      $transaction: localTransactionMock,
    };
    for (const m of OTHER_MODELS) client[m] = makeInertModel();
    return client;
  }),
}));

function row(id: string) {
  return { id, email: `${id}@example.com` };
}

describe('DbMirrorSyncService', () => {
  let primaryUserModel: { findMany: jest.Mock };
  let primaryReader: Record<string, unknown>;
  let service: DbMirrorSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (
        err: Error | null,
        result?: { stdout: string; stderr: string },
      ) => void;
      cb(null, { stdout: '', stderr: '' });
    });

    primaryUserModel = { findMany: jest.fn().mockResolvedValue([]) };
    primaryReader = { user: primaryUserModel };
    for (const m of OTHER_MODELS) primaryReader[m] = makeInertModel();

    localUserModel = {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    localTransactionMock = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));

    service = new DbMirrorSyncService(primaryReader as unknown as PrismaService);
  });

  describe('ensureLocalSchema', () => {
    it('runs `prisma migrate deploy` against LOCAL_DATABASE_URL via DIRECT_URL', async () => {
      process.env.LOCAL_DATABASE_URL = 'postgresql://local/db';
      await service.ensureLocalSchema();

      expect(execFileMock).toHaveBeenCalledWith(
        'node_modules/.bin/prisma',
        ['migrate', 'deploy'],
        expect.objectContaining({
          env: expect.objectContaining({ DIRECT_URL: 'postgresql://local/db' }),
        }),
        expect.any(Function),
      );
      delete process.env.LOCAL_DATABASE_URL;
    });
  });

  describe('syncAll', () => {
    it('returns one result per mirrored model (19 total)', async () => {
      const results = await service.syncAll();
      expect(results).toHaveLength(19);
      expect(results.map((r) => r.model)).toContain('user');
    });

    it('does nothing for a model with no primary rows', async () => {
      const results = await service.syncAll();
      const userResult = results.find((r) => r.model === 'user')!;
      expect(userResult.upserted).toBe(0);
      expect(userResult.deleted).toBe(0);
      expect(localUserModel.upsert).not.toHaveBeenCalled();
    });

    it('upserts every row from a single under-batch-size page', async () => {
      primaryUserModel.findMany.mockResolvedValueOnce([row('u1'), row('u2')]);

      const results = await service.syncAll();

      expect(localTransactionMock).toHaveBeenCalledTimes(1);
      expect(localUserModel.upsert).toHaveBeenCalledWith({
        where: { id: 'u1' },
        create: row('u1'),
        update: row('u1'),
      });
      const userResult = results.find((r) => r.model === 'user')!;
      expect(userResult.upserted).toBe(2);
    });

    it('paginates by id cursor across multiple full pages until a short final page', async () => {
      const fullPage = Array.from({ length: SYNC_BATCH_SIZE }, (_, i) =>
        row(`u${String(i).padStart(4, '0')}`),
      );
      primaryUserModel.findMany
        .mockResolvedValueOnce(fullPage)
        .mockResolvedValueOnce([row('u-last')]);

      const results = await service.syncAll();

      expect(primaryUserModel.findMany).toHaveBeenCalledTimes(2);
      // Second call cursors off the last id of the first page.
      expect(primaryUserModel.findMany.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          where: { id: { gt: fullPage[fullPage.length - 1].id } },
        }),
      );
      const userResult = results.find((r) => r.model === 'user')!;
      expect(userResult.upserted).toBe(SYNC_BATCH_SIZE + 1);
    });

    it('deletes local rows no longer present on primary (delete-reconciliation)', async () => {
      primaryUserModel.findMany.mockResolvedValueOnce([row('u1')]);
      localUserModel.findMany.mockResolvedValueOnce([
        { id: 'u1' },
        { id: 'u-stale' },
      ]);

      const results = await service.syncAll();

      expect(localUserModel.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['u-stale'] } },
      });
      const userResult = results.find((r) => r.model === 'user')!;
      expect(userResult.deleted).toBe(1);
    });

    it('never deletes a row that still exists on primary', async () => {
      primaryUserModel.findMany.mockResolvedValueOnce([row('u1'), row('u2')]);
      localUserModel.findMany.mockResolvedValueOnce([
        { id: 'u1' },
        { id: 'u2' },
      ]);

      await service.syncAll();

      expect(localUserModel.deleteMany).not.toHaveBeenCalled();
    });
  });
});
