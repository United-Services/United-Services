import { SetMetadata } from '@nestjs/common';

// Marks a route as exempt from CsrfHeaderGuard. Only apply to endpoints
// that are never called by our own browser-based frontend and have their
// own independent authentication (e.g. the Clerk webhook).
export const CSRF_EXEMPT_KEY = 'csrfExempt';
export const CsrfExempt = () => SetMetadata(CSRF_EXEMPT_KEY, true);
