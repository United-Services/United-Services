import { Role } from '../../generated/prisma';

// Every place that used to check `role === Role.admin` for "is this an
// admin-portal account" now checks against this instead — super_admin
// goes through the identical auth/MFA flow and has every admin
// permission, so a bare `=== Role.admin` comparison silently excluding
// it is a bug (a real one, twice: MfaEnrolledGuard/MfaSessionVerifiedGuard
// would have skipped MFA enforcement entirely for super_admin without
// this). Two exclusive super_admin-only features (audit log, tickets)
// stay a direct `@Roles(Role.super_admin)` — they deliberately do NOT
// use this constant.
export const ADMIN_ROLES = [Role.admin, Role.super_admin] as const;

export function isAdminRole(role: Role): boolean {
  return (ADMIN_ROLES as readonly Role[]).includes(role);
}
