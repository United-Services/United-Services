import { AuditLogArchiveWorker } from './audit-log-archive.worker';
import type { AuditLogArchiveService } from './audit-log-archive.service';
import type { Queue, Job } from 'bullmq';

// Same mocking strategy as translation.worker.spec.ts: AuditLogArchiveWorker
// constructs a real BullMQ Worker (and an IORedis connection) in
// onModuleInit(), neither of which may touch real Redis in a unit test.
let capturedProcessor: ((job: Job<any>) => Promise<void>) | undefined;
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

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({}));
});

function makeJob(overrides: Partial<Job<any>> = {}): Job<any> {
  return {
    name: 'archive-audit-logs',
    data: {},
    attemptsMade: 3,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<any>;
}

describe('AuditLogArchiveWorker', () => {
  let archiveService: { archiveExpiredLogs: jest.Mock };
  let queue: { upsertJobScheduler: jest.Mock };
  let dlq: { add: jest.Mock };
  let failover: { getRedisMode: jest.Mock };
  let worker: AuditLogArchiveWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    capturedHandlers.clear();
    archiveService = { archiveExpiredLogs: jest.fn().mockResolvedValue(0) };
    queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    dlq = { add: jest.fn().mockResolvedValue(undefined) };
    failover = { getRedisMode: jest.fn().mockReturnValue('primary') };
    worker = new AuditLogArchiveWorker(
      archiveService as unknown as AuditLogArchiveService,
      failover as any,
      queue as unknown as Queue<any>,
      dlq as unknown as Queue<any>,
    );
  });

  describe('onModuleInit', () => {
    it('registers exactly one repeatable job scheduler with a stable id and a daily cron pattern', async () => {
      await worker.onModuleInit();

      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
      const [schedulerId, repeatOpts] = queue.upsertJobScheduler.mock.calls[0];
      expect(schedulerId).toBe('audit-log-archive-daily');
      expect(repeatOpts).toEqual({ pattern: '0 3 * * *' });
    });

    it('is safe to call twice (e.g. two app instances starting) — upserts rather than throwing on a duplicate scheduler', async () => {
      await worker.onModuleInit();
      await expect(worker.onModuleInit()).resolves.not.toThrow();
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    });
  });

  describe('processor', () => {
    it('calls archiveService.archiveExpiredLogs() with no arguments', async () => {
      await worker.onModuleInit();
      expect(capturedProcessor).toBeDefined();

      await capturedProcessor!(makeJob());

      expect(archiveService.archiveExpiredLogs).toHaveBeenCalledTimes(1);
      expect(archiveService.archiveExpiredLogs).toHaveBeenCalledWith();
    });

    it("propagates a thrown error from archiveExpiredLogs so BullMQ's own retry/backoff takes over", async () => {
      await worker.onModuleInit();
      archiveService.archiveExpiredLogs.mockRejectedValue(
        new Error('db unreachable'),
      );

      await expect(capturedProcessor!(makeJob())).rejects.toThrow(
        'db unreachable',
      );
    });
  });

  describe("'failed' handler", () => {
    it('pushes to the DLQ with the job name and data once retries are exhausted', async () => {
      await worker.onModuleInit();
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');
      expect(handler).toBeDefined();

      handler!(job, new Error('connection reset'));

      expect(dlq.add).toHaveBeenCalledTimes(1);
      expect(dlq.add).toHaveBeenCalledWith(
        job.name,
        job.data,
        expect.objectContaining({ removeOnComplete: expect.anything() }),
      );
    });

    it('does NOT push to the DLQ while retries remain', async () => {
      await worker.onModuleInit();
      const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');

      handler!(job, new Error('transient'));

      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('does not throw when BullMQ calls the handler with a null/undefined job', async () => {
      await worker.onModuleInit();
      const handler = capturedHandlers.get('failed');

      expect(() => handler!(null, new Error('boom'))).not.toThrow();
      expect(() => handler!(undefined, new Error('boom'))).not.toThrow();
      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('catches and logs a DLQ.add() rejection instead of throwing/crashing the process', async () => {
      await worker.onModuleInit();
      dlq.add.mockRejectedValue(new Error('Redis network blip'));
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');

      expect(() => handler!(job, new Error('permanent failure'))).not.toThrow();

      await new Promise((resolve) => setImmediate(resolve));

      expect(dlq.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('calls worker.close()', async () => {
      await worker.onModuleInit();
      await worker.onModuleDestroy();

      expect(workerCloseMock).toHaveBeenCalledTimes(1);
    });

    it('is safe to call even if onModuleInit never ran (worker still null)', async () => {
      await expect(worker.onModuleDestroy()).resolves.not.toThrow();
      expect(workerCloseMock).not.toHaveBeenCalled();
    });
  });
});
