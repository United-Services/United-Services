import { AnalyticsWriteWorker } from './analytics-write.worker';
import type { PrismaService } from '../prisma/prisma.service';
import type { FailoverService } from '../failover/failover.service';
import type { Queue, Job } from 'bullmq';

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

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({ on: jest.fn() })),
);

function makeJob(overrides: Partial<Job<any>> = {}): Job<any> {
  return {
    name: 'page_view',
    data: { eventType: 'page_view', metadata: { page: 'home' }, country: 'EG' },
    attemptsMade: 3,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<any>;
}

describe('AnalyticsWriteWorker', () => {
  let prisma: { analyticsEvent: { create: jest.Mock } };
  let failover: { getRedisMode: jest.Mock };
  let dlq: { add: jest.Mock };
  let worker: AnalyticsWriteWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    capturedHandlers.clear();
    prisma = { analyticsEvent: { create: jest.fn().mockResolvedValue({}) } };
    failover = { getRedisMode: jest.fn().mockReturnValue('primary') };
    dlq = { add: jest.fn().mockResolvedValue(undefined) };
    worker = new AnalyticsWriteWorker(
      prisma as unknown as PrismaService,
      failover as unknown as FailoverService,
      dlq as unknown as Queue<any>,
    );
    worker.onModuleInit();
  });

  describe('processor', () => {
    it('writes the job data to Postgres via analyticsEvent.create', async () => {
      expect(capturedProcessor).toBeDefined();
      await capturedProcessor!(
        makeJob({
          data: {
            eventType: 'cta_click_hero',
            metadata: { page: 'home' },
            country: 'DE',
          },
        }),
      );

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'cta_click_hero',
          metadata: { page: 'home' },
          country: 'DE',
        },
      });
    });

    it('propagates a thrown error so BullMQ retries the job', async () => {
      prisma.analyticsEvent.create.mockRejectedValue(
        new Error('Supabase pooler exhausted'),
      );

      await expect(capturedProcessor!(makeJob())).rejects.toThrow(
        'Supabase pooler exhausted',
      );
    });
  });

  describe("'failed' handler", () => {
    it('moves a permanently-failed job to the DLQ once attempts are exhausted', () => {
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');
      expect(handler).toBeDefined();

      handler!(job, new Error('permanent failure'));

      expect(dlq.add).toHaveBeenCalledTimes(1);
      expect(dlq.add).toHaveBeenCalledWith(
        job.name,
        job.data,
        expect.objectContaining({ removeOnComplete: expect.anything() }),
      );
    });

    it('does NOT move a job to the DLQ while retries remain', () => {
      const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');

      handler!(job, new Error('transient'));

      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('does not throw for a null/undefined job', () => {
      const handler = capturedHandlers.get('failed');
      expect(() => handler!(null, new Error('boom'))).not.toThrow();
      expect(() => handler!(undefined, new Error('boom'))).not.toThrow();
      expect(dlq.add).not.toHaveBeenCalled();
    });

    // Same reasoning as every other worker's DLQ-write guard in this
    // codebase: a Redis blip at the exact moment of DLQ transfer must
    // not throw out of an event handler (which BullMQ's EventEmitter has
    // no caller to catch) — it's logged and swallowed instead.
    it('catches a DLQ.add() rejection instead of throwing', async () => {
      dlq.add.mockRejectedValue(new Error('Redis blip'));
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');

      expect(() => handler!(job, new Error('permanent'))).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));

      expect(dlq.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('closes the worker', async () => {
      await worker.onModuleDestroy();
      expect(workerCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
