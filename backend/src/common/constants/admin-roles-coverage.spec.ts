import { ROLES_KEY } from '../decorators/roles.decorator';
import { ADMIN_ROLES } from './admin-roles';
import { Role } from '../../generated/prisma';
import { PositionsController } from '../../candidates/positions.controller';
import { CandidatesController } from '../../candidates/candidates.controller';
import { AppointmentsController } from '../../appointments/appointments.controller';
import { FileAccessController } from '../../file-access/file-access.controller';
import { RfqController } from '../../rfq/rfq.controller';
import { ServicesController } from '../../services/services.controller';
import { AnalyticsController } from '../../analytics/analytics.controller';
import { AdminUsersController } from '../../admin-users/admin-users.controller';
import { MfaController } from '../../mfa/mfa.controller';
import { AuditLogController } from '../../analytics/audit-log.controller';
import { TicketsController } from '../../tickets/tickets.controller';

// Sanity check on a mechanical, repo-wide edit: every controller that used
// to gate a route with a bare @Roles(Role.admin) was bulk-updated to
// @Roles(...ADMIN_ROLES) so super_admin has every ordinary admin
// permission (docs/BUSINESS_RULES.md rule 17). A find-and-replace across
// 8 files is exactly the kind of change that's easy to get subtly wrong
// in one spot (a stray leftover Role.admin, a typo in the spread) without
// every route getting its own dedicated test — this walks every method on
// every affected controller's prototype (plus each class itself, for the
// three that gate at the class level) and asserts that *wherever* @Roles
// metadata is present, it's either exactly ADMIN_ROLES or one of the two
// documented super_admin-exclusive exceptions, never a lone Role.admin.
function rolesMetadataOnAllMethods(
  ControllerClass: new (...args: never[]) => object,
) {
  const results: { method: string; roles: Role[] | undefined }[] = [];
  const classRoles = Reflect.getMetadata(ROLES_KEY, ControllerClass) as
    | Role[]
    | undefined;
  if (classRoles) results.push({ method: '(class)', roles: classRoles });

  for (const method of Object.getOwnPropertyNames(
    ControllerClass.prototype,
  )) {
    if (method === 'constructor') continue;
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      (ControllerClass.prototype as Record<string, unknown>)[method] as object,
    ) as Role[] | undefined;
    if (roles) results.push({ method, roles });
  }
  return results;
}

// The two deliberate exceptions — see audit-log.controller.spec.ts and
// tickets.controller.spec.ts for their own dedicated tests; excluded here
// so this file doesn't have to special-case them per-controller.
const EXCLUSIVE_SUPER_ADMIN_ONLY = new Set([
  `${AuditLogController.name}.(class)`,
  `${TicketsController.name}.list`,
  `${TicketsController.name}.updateStatus`,
]);

describe('every admin-equivalent controller route requires ADMIN_ROLES, never a bare Role.admin', () => {
  const controllers = [
    PositionsController,
    CandidatesController,
    AppointmentsController,
    FileAccessController,
    RfqController,
    ServicesController,
    AnalyticsController,
    AdminUsersController,
    MfaController,
    AuditLogController,
    TicketsController,
  ];

  it.each(controllers)('%s', (ControllerClass) => {
    const found = rolesMetadataOnAllMethods(ControllerClass);
    // Every one of these controllers has at least one @Roles-gated route
    // — an empty result means the reflection itself is broken (wrong
    // prototype, decorator applied differently than expected), which is
    // itself a bug worth failing loudly on rather than vacuously passing.
    expect(found.length).toBeGreaterThan(0);

    for (const { method, roles } of found) {
      const key = `${ControllerClass.name}.${method}`;
      if (EXCLUSIVE_SUPER_ADMIN_ONLY.has(key)) {
        expect(roles).toEqual([Role.super_admin]);
        continue;
      }
      // Not every @Roles-gated route on these controllers is part of the
      // admin family — e.g. RFQ creation is @Roles(Role.client). Only
      // assert on routes that actually include admin: whenever one does,
      // it must also include super_admin (i.e. never the bare
      // [Role.admin] this whole change replaced). A route with no admin
      // involvement at all (like Role.client-only) is correctly left
      // untouched by this check.
      if (roles?.includes(Role.admin)) {
        expect(roles).toEqual(
          expect.arrayContaining([Role.admin, Role.super_admin]),
        );
      }
    }
  });
});
