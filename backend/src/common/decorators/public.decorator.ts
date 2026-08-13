import { SetMetadata } from '@nestjs/common';

// Marks a route handler as reachable without authentication. Every guard
// that enforces auth must check this metadata and skip verification when
// present — see ClerkAuthGuard.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
