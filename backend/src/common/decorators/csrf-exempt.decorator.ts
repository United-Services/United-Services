import { SetMetadata } from '@nestjs/common';

// Marks a route as reachable without the custom CSRF-defense header —
// must only ever be applied to endpoints that are never called by our own
// browser-based frontend and therefore never need it, most notably the
// Clerk webhook (called server-to-server by Svix, authenticated by its
// own signature verification, no cookies/CSRF risk involved at all). See
// CsrfHeaderGuard.
export const CSRF_EXEMPT_KEY = 'csrfExempt';
export const CsrfExempt = () => SetMetadata(CSRF_EXEMPT_KEY, true);
