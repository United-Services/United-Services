import { DbMirrorSyncService, SYNC_BATCH_SIZE } from './db-mirror-sync.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PrismaClient } from '../generated/prisma';

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
// syncAll()'s full 20-model loop completes quickly while still letting
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
  'ticketArchive',
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
    // Regression test for a real production incident: totpCredential
    // references kekRegistry (TotpCredential_totpKekKeyId_fkey) — when
    // MIRRORED_MODELS listed totpCredential before kekRegistry, the
    // mirror-sync job hit "Foreign key constraint violated" on every
    // run and moved straight to the DLQ. Upserts must happen in
    // parent-before-child order; delete-reconciliation must happen in
    // the reverse (child-before-parent), or deleting a still-referenced
    // parent locally would hit the same kind of FK violation.
    it('upserts parent models (kekRegistry) before the children that reference them (totpCredential)', async () => {
      const results = await service.syncAll();

      const kekCallOrder = (primaryReader.kekRegistry as any).findMany.mock
        .invocationCallOrder[0];
      const totpCallOrder = (primaryReader.totpCredential as any).findMany.mock
        .invocationCallOrder[0];
      expect(kekCallOrder).toBeLessThan(totpCallOrder);
      // 'kekRegistry' appears before 'totpCredential' in the results
      // array too, confirming the model list itself is ordered this way.
      expect(results.findIndex((r) => r.model === 'kekRegistry')).toBeLessThan(
        results.findIndex((r) => r.model === 'totpCredential'),
      );
    });

    it('runs delete-reconciliation in the reverse order — children (totpCredential) before their parents (kekRegistry)', async () => {
      await service.syncAll();

      // deleteStaleLocalRows reads the *local writer's* findMany for
      // each model — the call order there is what actually determines
      // delete-reconciliation order.
      const localWriterClient = (PrismaClient as unknown as jest.Mock).mock
        .results[0].value;
      const kekDeleteOrder =
        localWriterClient.kekRegistry.findMany.mock.invocationCallOrder[0];
      const totpDeleteOrder =
        localWriterClient.totpCredential.findMany.mock.invocationCallOrder[0];
      expect(totpDeleteOrder).toBeLessThan(kekDeleteOrder);
    });

    it('returns one result per mirrored model (20 total)', async () => {
      const results = await service.syncAll();
      expect(results).toHaveLength(20);
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

    it('stops after an exact-batch-size final page instead of looping forever (queries once more, finds nothing)', async () => {
      const fullPage = Array.from({ length: SYNC_BATCH_SIZE }, (_, i) =>
        row(`u${String(i).padStart(4, '0')}`),
      );
      primaryUserModel.findMany
        .mockResolvedValueOnce(fullPage)
        .mockResolvedValueOnce([]);

      const results = await service.syncAll();

      expect(primaryUserModel.findMany).toHaveBeenCalledTimes(2);
      const userResult = results.find((r) => r.model === 'user')!;
      expect(userResult.upserted).toBe(SYNC_BATCH_SIZE);
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

    it('paginates delete-reconciliation across multiple local pages, not just the sync side', async () => {
      primaryUserModel.findMany.mockResolvedValueOnce([row('u1')]);
      const fullLocalPage = Array.from({ length: SYNC_BATCH_SIZE }, (_, i) => ({
        id: `stale-${String(i).padStart(4, '0')}`,
      }));
      localUserModel.findMany
        .mockResolvedValueOnce(fullLocalPage)
        .mockResolvedValueOnce([{ id: 'u1' }, { id: 'stale-last' }]);

      const results = await service.syncAll();

      expect(localUserModel.findMany).toHaveBeenCalledTimes(2);
      expect(localUserModel.deleteMany).toHaveBeenCalledTimes(2);
      const userResult = results.find((r) => r.model === 'user')!;
      // Every id from the full page (all stale) plus 'stale-last' from
      // the second page — 'u1' from that second page is preserved.
      expect(userResult.deleted).toBe(SYNC_BATCH_SIZE + 1);
    });

    it('an empty primary table with existing local rows deletes everything locally (primary fully cleared)', async () => {
      primaryUserModel.findMany.mockResolvedValueOnce([]);
      localUserModel.findMany.mockResolvedValueOnce([
        { id: 'orphan-1' },
        { id: 'orphan-2' },
      ]);

      const results = await service.syncAll();

      expect(localUserModel.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['orphan-1', 'orphan-2'] } },
      });
      const userResult = results.find((r) => r.model === 'user')!;
      expect(userResult.upserted).toBe(0);
      expect(userResult.deleted).toBe(2);
    });
  });
});
