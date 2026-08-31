import { FailoverReconciliationWorker } from './failover-reconciliation.worker';
import type { FailoverReconciliationService } from './failover-reconciliation.service';
import { EventEmitter } from 'events';
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

describe('FailoverReconciliationWorker', () => {
  let reconciliationService: { reconcileAll: jest.Mock };
  let failover: EventEmitter;
  let queue: { add: jest.Mock };
  let dlq: { add: jest.Mock };
  let worker: FailoverReconciliationWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedProcessor = undefined;
    capturedHandlers.clear();
    reconciliationService = { reconcileAll: jest.fn().mockResolvedValue({ replayed: 0, conflicts: 0 }) };
    failover = new EventEmitter();
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    dlq = { add: jest.fn().mockResolvedValue(undefined) };
    worker = new FailoverReconciliationWorker(
      reconciliationService as unknown as FailoverReconciliationService,
      failover as any,
      queue as unknown as Queue<any>,
      dlq as unknown as Queue<any>,
    );
    worker.onModuleInit();
  });

  it('does not enqueue anything on its own — only in reaction to postgres:recovered', () => {
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues a reconcile job when FailoverService emits postgres:recovered', () => {
    failover.emit('postgres:recovered');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'reconcile',
      {},
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it('enqueues a separate job for each recovery event', () => {
    failover.emit('postgres:recovered');
    failover.emit('postgres:recovered');
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('the processor calls reconciliationService.reconcileAll()', async () => {
    expect(capturedProcessor).toBeDefined();
    await capturedProcessor!();
    expect(reconciliationService.reconcileAll).toHaveBeenCalledTimes(1);
  });

  it('moves an exhausted job to the DLQ', () => {
    const job = {
      name: 'reconcile',
      data: {},
      attemptsMade: 5,
      opts: { attempts: 5 },
    } as Job<any>;
    const handler = capturedHandlers.get('failed');
    handler!(job, new Error('reconcile failed'));
    expect(dlq.add).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from postgres:recovered on destroy, so a later event no longer enqueues', async () => {
    await worker.onModuleDestroy();
    failover.emit('postgres:recovered');
    expect(queue.add).not.toHaveBeenCalled();
    expect(workerCloseMock).toHaveBeenCalledTimes(1);
  });
});
