import type { Request } from 'express';

// Shared by every place that needs the real visitor IP (geo locale
// detection, analytics country tagging) — prefers the first hop in
// X-Forwarded-For (set by whatever reverse proxy/CDN sits in front in
// production, e.g. Cloudflare/nginx per docs/DEPLOYMENT.md), falling back
// to the raw socket address for direct/local connections.
export function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? '';
}
