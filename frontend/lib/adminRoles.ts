import { Role } from "../enums/status.enums"

// Mirrors backend/src/common/constants/admin-roles.ts — every place that
// used to check `role === Role.Admin` for "can this account reach the
// admin dashboard/MFA flow" now checks against this instead. SuperAdmin
// goes through the identical auth/MFA flow and has every admin
// permission, so a bare `=== Role.Admin` comparison silently excluding it
// is a bug, not a stricter check. Audit log and tickets stay a direct
// `role === Role.SuperAdmin` comparison in the two places that render
// them — they deliberately do NOT use this helper.
export const ADMIN_ROLES = [Role.Admin, Role.SuperAdmin] as const

export function isAdminRole(role: string | undefined | null): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role ?? "")
}
