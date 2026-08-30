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
