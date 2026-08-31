import { DbMirrorSyncWorker } from './db-mirror-sync.worker';
import type { DbMirrorSyncService } from './db-mirror-sync.service';
import type { FailoverService } from './failover.service';
import type { Queue, Job } from 'bullmq';

let capturedProcessor: (() => Promise<void>) | undefined;
const capturedHandlers = new Map<string, (...args: any[]) => void>();
const workerCloseMock = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name, processor, _opts) => {
    capturedProcessor = processor;
    return {
      on: jest.fn((event: string, handler: (...args: any[]) => void) => {
        capturedHandlers.set(event, handler);
      }),
      close: workerCloseMock,
    };
  }),
}));

jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({ on: jest.fn() })));

describe('DbMirrorSyncWorker', () => {
  let syncService: { syncAll: jest.Mock };
  let failover: { getPostgresMode: jest.Mock };
  let queue: { upsertJobScheduler: jest.Mock };
  let dlq: { add: jest.Mock };
  let worker: DbMirrorSyncWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    capturedHandlers.clear();
    syncService = { syncAll: jest.fn().mockResolvedValue([]) };
    failover = { getPostgresMode: jest.fn().mockReturnValue('primary') };
    queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    dlq = { add: jest.fn().mockResolvedValue(undefined) };
    worker = new DbMirrorSyncWorker(
      syncService as unknown as DbMirrorSyncService,
      failover as unknown as FailoverService,
      queue as unknown as Queue<any>,
      dlq as unknown as Queue<any>,
    );
    await worker.onModuleInit();
  });

  it('registers a repeatable job scheduler on init', () => {
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    const [schedulerId, repeatOpts] = queue.upsertJobScheduler.mock.calls[0];
    expect(schedulerId).toBe('db-mirror-sync-10min');
    expect(repeatOpts).toEqual({ pattern: '*/10 * * * *' });
  });

  it('runs syncAll() when Postgres is in primary mode', async () => {
    expect(capturedProcessor).toBeDefined();
    await capturedProcessor!();
    expect(syncService.syncAll).toHaveBeenCalledTimes(1);
  });

  it('skips syncAll() entirely while Postgres is in local-fallback mode', async () => {
    failover.getPostgresMode.mockReturnValue('local');
    await capturedProcessor!();
    expect(syncService.syncAll).not.toHaveBeenCalled();
  });

  it('moves an exhausted job to the DLQ', () => {
    const job = {
      name: 'sync-local-standby',
      data: {},
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as Job<any>;
    const handler = capturedHandlers.get('failed');
    handler!(job, new Error('sync failed'));
    expect(dlq.add).toHaveBeenCalledTimes(1);
  });

  it('closes the worker on destroy', async () => {
    await worker.onModuleDestroy();
    expect(workerCloseMock).toHaveBeenCalledTimes(1);
  });
});
