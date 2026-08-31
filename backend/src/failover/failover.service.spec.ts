import { FailoverService } from './failover.service';

const queryRawMock = jest.fn();
jest.mock('../generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

const redisConnectMock = jest.fn();
const redisPingMock = jest.fn();
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: (...args: unknown[]) => redisConnectMock(...args),
    ping: (...args: unknown[]) => redisPingMock(...args),
    disconnect: jest.fn(),
  }));
});

describe('FailoverService', () => {
  let service: FailoverService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRawMock.mockResolvedValue([{ '?column?': 1 }]);
    redisConnectMock.mockResolvedValue(undefined);
    redisPingMock.mockResolvedValue('PONG');
    service = new FailoverService();
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // Access the private per-tick check methods directly rather than
  // waiting on the real setInterval — deterministic and fast.
  const checkPostgres = (s: FailoverService) => (s as any).checkPostgres();
  const checkRedis = (s: FailoverService) => (s as any).checkRedis();

  describe('initial state', () => {
    it('starts in primary mode for both Postgres and Redis', () => {
      expect(service.getPostgresMode()).toBe('primary');
      expect(service.getRedisMode()).toBe('primary');
    });
  });

  describe('Postgres failover', () => {
    it('does not fail over on 1 or 2 consecutive failures', async () => {
      queryRawMock.mockRejectedValue(new Error('connection refused'));
      await checkPostgres(service);
      await checkPostgres(service);
      expect(service.getPostgresMode()).toBe('primary');
    });

    it('fails over to local after 3 consecutive failures, emitting postgres:failover', async () => {
      const handler = jest.fn();
      service.on('postgres:failover', handler);
      queryRawMock.mockRejectedValue(new Error('connection refused'));

      await checkPostgres(service);
      await checkPostgres(service);
      await checkPostgres(service);

      expect(service.getPostgresMode()).toBe('local');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('a single success in between resets the failure count (no failover on 2+1+2 failures)', async () => {
      queryRawMock.mockRejectedValue(new Error('boom'));
      await checkPostgres(service);
      await checkPostgres(service);
      queryRawMock.mockResolvedValue([{}]);
      await checkPostgres(service);
      queryRawMock.mockRejectedValue(new Error('boom'));
      await checkPostgres(service);
      await checkPostgres(service);
      expect(service.getPostgresMode()).toBe('primary');
    });

    it('recovers back to primary after 3 consecutive successes while in local mode, emitting postgres:recovered', async () => {
      queryRawMock.mockRejectedValue(new Error('down'));
      await checkPostgres(service);
      await checkPostgres(service);
      await checkPostgres(service);
      expect(service.getPostgresMode()).toBe('local');

      const handler = jest.fn();
      service.on('postgres:recovered', handler);
      queryRawMock.mockResolvedValue([{}]);
      await checkPostgres(service);
      await checkPostgres(service);
      expect(service.getPostgresMode()).toBe('local');
      await checkPostgres(service);

      expect(service.getPostgresMode()).toBe('primary');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not emit postgres:failover again while already in local mode', async () => {
      const handler = jest.fn();
      service.on('postgres:failover', handler);
      queryRawMock.mockRejectedValue(new Error('down'));
      await checkPostgres(service);
      await checkPostgres(service);
      await checkPostgres(service);
      await checkPostgres(service);
      await checkPostgres(service);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    // Reentrancy: a check slower than CHECK_INTERVAL_MS must not let a
    // second tick start concurrently and double-count toward the
    // threshold — otherwise 2 real failed checks could look like 4 and
    // trigger a failover a tick early, or worse, race the counter reset
    // on a mixed success/failure overlap.
    it('ignores an overlapping tick while a check is still in flight, so two ticks never double-count one failure', async () => {
      let resolveQuery!: () => void;
      queryRawMock.mockReturnValue(
        new Promise((resolve) => {
          resolveQuery = () => resolve([{ '?column?': 1 }]);
        }),
      );

      const first = checkPostgres(service);
      const second = checkPostgres(service); // fires while `first` is still pending
      resolveQuery();
      await first;
      await second;

      // Only one real check ran to completion — $queryRaw itself was
      // only ever asked for once, not twice, proving the second tick
      // returned immediately instead of starting its own query.
      expect(queryRawMock).toHaveBeenCalledTimes(1);
    });

    // A rejection doesn't have to be an Error instance — this must not
    // itself throw (e.g. from `err.message` on a non-Error) while
    // building the log message, which would crash the whole check.
    it('handles a non-Error rejection (e.g. a plain string) without throwing', async () => {
      queryRawMock.mockRejectedValue('plain string rejection');

      await expect(checkPostgres(service)).resolves.not.toThrow();
      await checkPostgres(service);
      await checkPostgres(service);

      expect(service.getPostgresMode()).toBe('local');
    });
  });

  describe('Redis failover', () => {
    it('fails over to local after 3 consecutive failures, emitting redis:failover', async () => {
      const handler = jest.fn();
      service.on('redis:failover', handler);
      redisPingMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await checkRedis(service);
      await checkRedis(service);
      await checkRedis(service);

      expect(service.getRedisMode()).toBe('local');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('recovers back to primary after 3 consecutive successes', async () => {
      redisPingMock.mockRejectedValue(new Error('down'));
      await checkRedis(service);
      await checkRedis(service);
      await checkRedis(service);
      expect(service.getRedisMode()).toBe('local');

      redisPingMock.mockResolvedValue('PONG');
      await checkRedis(service);
      await checkRedis(service);
      await checkRedis(service);
      expect(service.getRedisMode()).toBe('primary');
    });

    it('a connect() rejection counts as a failure too, not just ping()', async () => {
      redisConnectMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await checkRedis(service);
      await checkRedis(service);
      await checkRedis(service);
      expect(service.getRedisMode()).toBe('local');
    });

    it('ignores an overlapping tick while a check is still in flight', async () => {
      let resolvePing!: () => void;
      redisPingMock.mockReturnValue(
        new Promise((resolve) => {
          resolvePing = () => resolve('PONG');
        }),
      );

      const first = checkRedis(service);
      const second = checkRedis(service);
      resolvePing();
      await first;
      await second;

      expect(redisPingMock).toHaveBeenCalledTimes(1);
    });

    it('handles a non-Error rejection without throwing', async () => {
      redisPingMock.mockRejectedValue({ code: 'WEIRD' });

      await expect(checkRedis(service)).resolves.not.toThrow();
      await checkRedis(service);
      await checkRedis(service);

      expect(service.getRedisMode()).toBe('local');
    });
  });

  describe('independence between Postgres and Redis modes', () => {
    it('a Postgres failover does not affect Redis mode, and vice versa', async () => {
      queryRawMock.mockRejectedValue(new Error('db down'));
      await checkPostgres(service);
      await checkPostgres(service);
      await checkPostgres(service);
      expect(service.getPostgresMode()).toBe('local');
      expect(service.getRedisMode()).toBe('primary');

      redisPingMock.mockRejectedValue(new Error('redis down'));
      await checkRedis(service);
      await checkRedis(service);
      await checkRedis(service);
      expect(service.getRedisMode()).toBe('local');
      expect(service.getPostgresMode()).toBe('local');
    });
  });
});
