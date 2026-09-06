import type { ThrottlerStorage } from '@nestjs/throttler';
import { FailOpenThrottlerStorage } from './fail-open-throttler-storage';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

const args = ['k', 60_000, 100, 0, 'default'] as const;

describe('FailOpenThrottlerStorage', () => {
  it('passes a healthy storage result through unchanged', async () => {
    const record: ThrottlerStorageRecord = {
      totalHits: 7,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
    const inner: ThrottlerStorage = {
      increment: jest.fn().mockResolvedValue(record),
    };
    const storage = new FailOpenThrottlerStorage(inner);

    await expect(storage.increment(...args)).resolves.toEqual(record);
    expect(inner.increment).toHaveBeenCalledWith(...args);
  });

  it('still reports a blocked client as blocked — failing open must not disable limiting while storage is healthy', async () => {
    const blocked: ThrottlerStorageRecord = {
      totalHits: 101,
      timeToExpire: 10,
      isBlocked: true,
      timeToBlockExpire: 10,
    };
    const inner: ThrottlerStorage = {
      increment: jest.fn().mockResolvedValue(blocked),
    };

    const result = await new FailOpenThrottlerStorage(inner).increment(
      ...args,
    );
    expect(result.isBlocked).toBe(true);
  });

  it('allows the request when storage throws, instead of propagating the error into a 500', async () => {
    const inner: ThrottlerStorage = {
      increment: jest
        .fn()
        .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379')),
    };
    const storage = new FailOpenThrottlerStorage(inner);

    const result = await storage.increment(...args);
    expect(result).toEqual({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });
});
