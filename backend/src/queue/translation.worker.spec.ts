import { TranslationWorker } from './translation.worker';
import type { TranslationService } from '../translations/translation.service';
import type { Queue, Job } from 'bullmq';

// TranslationWorker constructs a real BullMQ Worker (and an IORedis
// connection) in onModuleInit(). Neither may touch a real Redis instance in
// a unit test, so both are mocked — the Worker mock just records the
// processor function and event handlers it was given so tests can invoke
// them directly, exercising the worker's own logic without any real queue.
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
    name: 'service:svc-1:ar',
    data: { contentType: 'service', contentId: 'svc-1', locale: 'ar' },
    attemptsMade: 3,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<any>;
}

describe('TranslationWorker', () => {
  let translations: { processQueuedJob: jest.Mock };
  let dlq: { add: jest.Mock };
  let worker: TranslationWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    capturedHandlers.clear();
    translations = { processQueuedJob: jest.fn().mockResolvedValue(undefined) };
    dlq = { add: jest.fn().mockResolvedValue(undefined) };
    worker = new TranslationWorker(
      translations as unknown as TranslationService,
      dlq as unknown as Queue<any>,
    );
    worker.onModuleInit();
  });

  describe('processor', () => {
    it('calls translationService.processQueuedJob with the exact job.data', async () => {
      const job = makeJob({
        data: {
          contentType: 'open_position',
          contentId: 'pos-9',
          locale: 'zh',
        },
      });
      expect(capturedProcessor).toBeDefined();

      await capturedProcessor!(job);

      expect(translations.processQueuedJob).toHaveBeenCalledTimes(1);
      expect(translations.processQueuedJob).toHaveBeenCalledWith(job.data);
    });
  });

  describe("'failed' handler", () => {
    it('pushes to the DLQ with the job name and data when retries are exhausted (attemptsMade >= attempts)', () => {
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');
      expect(handler).toBeDefined();

      handler!(job, new Error('LibreTranslate unreachable'));

      expect(dlq.add).toHaveBeenCalledTimes(1);
      expect(dlq.add).toHaveBeenCalledWith(
        job.name,
        job.data,
        expect.objectContaining({ removeOnComplete: expect.anything() }),
      );
    });

    it('does NOT push to the DLQ when the job still has retries left (attemptsMade one less than attempts)', () => {
      const job = makeJob({ attemptsMade: 2, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');

      handler!(job, new Error('transient'));

      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('does NOT push to the DLQ on the very first failed attempt (attemptsMade 1 of 3)', () => {
      const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');

      handler!(job, new Error('transient'));

      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('does not throw when BullMQ calls the handler with a null/undefined job', () => {
      const handler = capturedHandlers.get('failed');

      expect(() => handler!(null, new Error('boom'))).not.toThrow();
      expect(() => handler!(undefined, new Error('boom'))).not.toThrow();
      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('catches and logs a DLQ.add() rejection instead of throwing/crashing the process', async () => {
      dlq.add.mockRejectedValue(new Error('Redis network blip'));
      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });
      const handler = capturedHandlers.get('failed');

      expect(() => handler!(job, new Error('permanent failure'))).not.toThrow();

      // Let the rejected promise's .catch() microtask run before asserting
      // nothing propagated as an unhandled rejection.
      await new Promise((resolve) => setImmediate(resolve));

      expect(dlq.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('calls worker.close()', async () => {
      await worker.onModuleDestroy();

      expect(workerCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
