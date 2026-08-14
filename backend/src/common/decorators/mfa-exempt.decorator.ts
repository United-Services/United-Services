import { SetMetadata } from '@nestjs/common';

// Marks a route (or whole controller) as reachable by an admin who has
// not yet completed MFA enrollment — must only ever be applied to the
// enrollment endpoints themselves (MfaController), since without an
// escape hatch no admin could ever complete initial setup. See
// MfaEnrolledGuard.
export const MFA_EXEMPT_KEY = 'mfaExempt';
export const MfaExempt = () => SetMetadata(MFA_EXEMPT_KEY, true);
