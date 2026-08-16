import { IncidentAlertService } from './incident-alert.service';
import type { RedisService } from '../redis/redis.service';

// A phone paging accidentally from a dev machine, or paging once per
// request during a real outage instead of once total, are both worse than
// no alert at all — this suite exists specifically to prove those two
// failure modes can't happen.
describe('IncidentAlertService', () => {
  const ORIGINAL_ENV = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function makeRedis(setResult: 'OK' | null = 'OK') {
    return {
      set: jest.fn().mockResolvedValue(setResult),
    } as unknown as RedisService;
  }

  const params = {
    route: '/api/v1/rfqs',
    method: 'POST',
    statusCode: 500,
    errorMessage: 'db unreachable',
  };

  it('never calls fetch when ALERTING_ENABLED is unset, even with valid credentials configured', async () => {
    delete process.env.ALERTING_ENABLED;
    process.env.BETTERSTACK_INCIDENT_API_TOKEN = 'tok_real';
    process.env.BETTERSTACK_REQUESTER_EMAIL = 'oncall@example.com';
    const service = new IncidentAlertService(makeRedis());

    await service.trigger(params);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never calls fetch when ALERTING_ENABLED=false explicitly', async () => {
    process.env.ALERTING_ENABLED = 'false';
    process.env.BETTERSTACK_INCIDENT_API_TOKEN = 'tok_real';
    process.env.BETTERSTACK_REQUESTER_EMAIL = 'oncall@example.com';
    const service = new IncidentAlertService(makeRedis());

    await service.trigger(params);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips (does not throw) when enabled but credentials are missing', async () => {
    process.env.ALERTING_ENABLED = 'true';
    delete process.env.BETTERSTACK_INCIDENT_API_TOKEN;
    delete process.env.BETTERSTACK_REQUESTER_EMAIL;
    const service = new IncidentAlertService(makeRedis());

    await expect(service.trigger(params)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires the incident when enabled, credentialed, and the cooldown lock is free', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.BETTERSTACK_INCIDENT_API_TOKEN = 'tok_real';
    process.env.BETTERSTACK_REQUESTER_EMAIL = 'oncall@example.com';
    const redis = makeRedis('OK');
    const service = new IncidentAlertService(redis);

    await service.trigger(params);

    expect(redis.set).toHaveBeenCalledWith(
      'alert:cooldown:POST:/api/v1/rfqs',
      '1',
      'EX',
      15 * 60,
      'NX',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://uptime.betterstack.com/api/v2/incidents',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok_real' }),
      }),
    );
  });

  it('suppresses the call entirely when the cooldown lock is already held (a burst of identical failures pages once, not per-request)', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.BETTERSTACK_INCIDENT_API_TOKEN = 'tok_real';
    process.env.BETTERSTACK_REQUESTER_EMAIL = 'oncall@example.com';
    const redis = makeRedis(null); // NX lock already held by an earlier trigger
    const service = new IncidentAlertService(redis);

    await service.trigger(params);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a fetch failure — never rethrows, so it can never become a second unhandled exception', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.BETTERSTACK_INCIDENT_API_TOKEN = 'tok_real';
    process.env.BETTERSTACK_REQUESTER_EMAIL = 'oncall@example.com';
    fetchMock.mockRejectedValue(new Error('network unreachable'));
    const service = new IncidentAlertService(makeRedis('OK'));

    await expect(service.trigger(params)).resolves.toBeUndefined();
  });

  it('swallows a non-OK response from the incident API without throwing', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.BETTERSTACK_INCIDENT_API_TOKEN = 'tok_real';
    process.env.BETTERSTACK_REQUESTER_EMAIL = 'oncall@example.com';
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'bad request' });
    const service = new IncidentAlertService(makeRedis('OK'));

    await expect(service.trigger(params)).resolves.toBeUndefined();
  });
});
