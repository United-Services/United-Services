import { SetMetadata } from '@nestjs/common';

// Marks a route (or whole controller) as reachable by an admin who has
// not yet completed MFA enrollment. Applies to: the enrollment endpoints
// themselves (MfaController) — without an escape hatch no admin could
// ever complete initial setup — and MeController's GET /me, which the
// frontend's post-sign-in redirect calls first specifically to learn
// whether an admin needs to be sent to enrollment in the first place.
// Only ever add this where the response itself carries nothing
// admin-privileged; MfaEnrolledGuard exists to protect access to
// admin-scoped data/actions, not to gate every endpoint an admin account
// happens to call. See MfaEnrolledGuard.
export const MFA_EXEMPT_KEY = 'mfaExempt';
export const MfaExempt = () => SetMetadata(MFA_EXEMPT_KEY, true);
