import { TicketArchiveWorker } from './ticket-archive.worker';
import type { TicketArchiveService } from './ticket-archive.service';
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

jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({ on: jest.fn() })));

function makeJob(overrides: Partial<Job<any>> = {}): Job<any> {
  return {
    name: 'archive-ticket',
    data: { ticketId: 'ticket-1' },
    attemptsMade: 3,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<any>;
}

describe('TicketArchiveWorker', () => {
  let archiveService: { archiveTicket: jest.Mock; archiveAllResolved: jest.Mock };
  let failover: { getRedisMode: jest.Mock };
  let queue: { upsertJobScheduler: jest.Mock };
  let dlq: { add: jest.Mock };
  let worker: TicketArchiveWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    capturedHandlers.clear();
    archiveService = {
      archiveTicket: jest.fn().mockResolvedValue(true),
      archiveAllResolved: jest.fn().mockResolvedValue(0),
    };
    failover = { getRedisMode: jest.fn().mockReturnValue('primary') };
    queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
    dlq = { add: jest.fn().mockResolvedValue(undefined) };
    worker = new TicketArchiveWorker(
      archiveService as unknown as TicketArchiveService,
      failover as unknown as FailoverService,
      queue as unknown as Queue<any>,
      dlq as unknown as Queue<any>,
    );
    await worker.onModuleInit();
  });

  it('registers the periodic sweep job scheduler on init', () => {
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    const [schedulerId, repeatOpts] = queue.upsertJobScheduler.mock.calls[0];
    expect(schedulerId).toBe('ticket-archive-sweep-10min');
    expect(repeatOpts).toEqual({ pattern: '*/10 * * * *' });
  });

  // Regression: onModuleInit runs during Nest's module init phase, which
  // the whole app's bootstrap blocks on — an unhandled rejection here
  // (e.g. Redis unreachable) previously stalled bootstrap forever, so
  // the HTTP server never called app.listen(), even though no route
  // depends on this queue.
  it('does not reject onModuleInit when upsertJobScheduler fails, so app bootstrap is never blocked by this queue', async () => {
    const failingQueue = {
      upsertJobScheduler: jest.fn().mockRejectedValue(new Error('ERR max requests limit exceeded')),
    };
    const freshWorker = new TicketArchiveWorker(
      archiveService as unknown as TicketArchiveService,
      failover as unknown as FailoverService,
      failingQueue as unknown as Queue<any>,
      dlq as unknown as Queue<any>,
    );

    await expect(freshWorker.onModuleInit()).resolves.toBeUndefined();
  });

  describe('processor', () => {
    it('calls archiveTicket(ticketId) for a job carrying a ticketId', async () => {
      expect(capturedProcessor).toBeDefined();
      await capturedProcessor!(makeJob({ data: { ticketId: 'abc' } }));

      expect(archiveService.archiveTicket).toHaveBeenCalledWith('abc');
      expect(archiveService.archiveAllResolved).not.toHaveBeenCalled();
    });

    it('calls archiveAllResolved() for the periodic sweep job (no ticketId)', async () => {
      await capturedProcessor!(makeJob({ name: 'sweep-resolved-tickets', data: {} }));

      expect(archiveService.archiveAllResolved).toHaveBeenCalledTimes(1);
      expect(archiveService.archiveTicket).not.toHaveBeenCalled();
    });

    it('propagates a thrown error so BullMQ retries the job', async () => {
      archiveService.archiveTicket.mockRejectedValue(new Error('S3 down'));

      await expect(
        capturedProcessor!(makeJob({ data: { ticketId: 'x' } })),
      ).rejects.toThrow('S3 down');
    });
  });

  describe("'failed' handler", () => {
    it('moves an exhausted per-ticket job to the DLQ', () => {
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
