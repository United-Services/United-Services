import { extractIp } from './extract-ip';

describe('extractIp', () => {
  it('uses the first IP in a comma-separated X-Forwarded-For chain', () => {
    const req: any = {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      socket: { remoteAddress: '10.0.0.9' },
    };
    expect(extractIp(req)).toBe('203.0.113.5');
  });

  it('falls back to the socket remote address with no X-Forwarded-For header', () => {
    const req: any = { headers: {}, socket: { remoteAddress: '10.0.0.9' } };
    expect(extractIp(req)).toBe('10.0.0.9');
  });

  it('returns an empty string when neither is available', () => {
    const req: any = { headers: {}, socket: {} };
    expect(extractIp(req)).toBe('');
  });
});
