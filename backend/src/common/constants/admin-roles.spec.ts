import { Role } from '../../generated/prisma';
import { ADMIN_ROLES, isAdminRole } from './admin-roles';

describe('ADMIN_ROLES / isAdminRole', () => {
  it('includes exactly admin and super_admin, nothing else', () => {
    expect(ADMIN_ROLES).toEqual(
      expect.arrayContaining([Role.admin, Role.super_admin]),
    );
    expect(ADMIN_ROLES).toHaveLength(2);
  });

  it.each([Role.admin, Role.super_admin])(
    'treats %s as an admin role',
    (role) => {
      expect(isAdminRole(role)).toBe(true);
    },
  );

  it.each([Role.client, Role.candidate])(
    'does not treat %s as an admin role',
    (role) => {
      expect(isAdminRole(role)).toBe(false);
    },
  );
});
