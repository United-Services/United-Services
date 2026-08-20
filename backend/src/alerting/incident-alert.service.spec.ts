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
    global.fetch = fetchMock;
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

  it('never calls fetch when ALERTING_ENABLED is unset, even with a topic URL configured', async () => {
    delete process.env.ALERTING_ENABLED;
    process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/real-secret-topic';
    const service = new IncidentAlertService(makeRedis());

    await service.trigger(params);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never calls fetch when ALERTING_ENABLED=false explicitly', async () => {
    process.env.ALERTING_ENABLED = 'false';
    process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/real-secret-topic';
    const service = new IncidentAlertService(makeRedis());

    await service.trigger(params);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips (does not throw) when enabled but NTFY_TOPIC_URL is missing', async () => {
    process.env.ALERTING_ENABLED = 'true';
    delete process.env.NTFY_TOPIC_URL;
    const service = new IncidentAlertService(makeRedis());

    await expect(service.trigger(params)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires the notification when enabled, configured, and the cooldown lock is free', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/real-secret-topic';
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
      'https://ntfy.sh/real-secret-topic',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Title: '500 on POST /api/v1/rfqs',
          Priority: '5',
        }),
      }),
    );
  });

  it('suppresses the call entirely when the cooldown lock is already held (a burst of identical failures pages once, not per-request)', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/real-secret-topic';
    const redis = makeRedis(null); // NX lock already held by an earlier trigger
    const service = new IncidentAlertService(redis);

    await service.trigger(params);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a fetch failure — never rethrows, so it can never become a second unhandled exception', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/real-secret-topic';
    fetchMock.mockRejectedValue(new Error('network unreachable'));
    const service = new IncidentAlertService(makeRedis('OK'));

    await expect(service.trigger(params)).resolves.toBeUndefined();
  });

  it('swallows a non-OK response from ntfy without throwing', async () => {
    process.env.ALERTING_ENABLED = 'true';
    process.env.NTFY_TOPIC_URL = 'https://ntfy.sh/real-secret-topic';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    });
    const service = new IncidentAlertService(makeRedis('OK'));

    await expect(service.trigger(params)).resolves.toBeUndefined();
  });
});
