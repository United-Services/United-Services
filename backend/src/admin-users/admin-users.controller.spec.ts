import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { Role, type User } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditLogService } from '../audit-log/audit-log.service';

const createUserMock = jest.fn();
const updateUserMock = jest.fn();
const deleteUserMock = jest.fn();
jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    users: {
      createUser: (...args: unknown[]) => createUserMock(...args),
      updateUser: (...args: unknown[]) => updateUserMock(...args),
      deleteUser: (...args: unknown[]) => deleteUserMock(...args),
    },
  }),
}));

// An admin locking themselves out (accidentally or via a compromised
// session) would require direct DB access to recover from — this guard is
// the only thing standing between "disable" and that scenario.
describe('AdminUsersController.disable', () => {
  const admin = { id: 'admin-1', role: Role.admin } as User;

  function makeController() {
    createUserMock.mockReset().mockResolvedValue({ id: 'clerk-new-1' });
    updateUserMock.mockReset().mockResolvedValue({});
    deleteUserMock.mockReset().mockResolvedValue({});
    const prisma = {
      user: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'client-1', disabledAt: new Date() }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    return {
      controller: new AdminUsersController(prisma, auditLog),
      prisma,
      auditLog,
    };
  }

  it('refuses to let an admin disable their own account', async () => {
    const { controller, prisma } = makeController();
    await expect(controller.disable(admin, admin.id)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('disables another account and records an audit entry', async () => {
    const { controller, prisma, auditLog } = makeController();
    await controller.disable(admin, 'client-1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { disabledAt: expect.any(Date) },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: admin.id,
        action: 'user.disabled',
        targetId: 'client-1',
      }),
    );
  });

  it('enable clears disabledAt and records an audit entry', async () => {
    const { controller, prisma, auditLog } = makeController();
    (prisma.user.update as jest.Mock).mockResolvedValue({
      id: 'client-1',
      disabledAt: null,
    });

    await controller.enable(admin, 'client-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { disabledAt: null },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: admin.id,
        action: 'user.enabled',
        targetId: 'client-1',
      }),
    );
  });

  it('list filters by role when given', async () => {
    const { controller, prisma } = makeController();
    await controller.list(undefined, Role.client);
    expect((prisma.user.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      role: Role.client,
    });
  });

  it('list combines a role filter (DB-side) with a fuzzy-matched free-text search (in-app) across name/email/company', async () => {
    const { controller, prisma } = makeController();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'u1',
        firstName: 'Ana',
        lastName: 'Cruz',
        email: 'a@x.com',
        companyName: 'Acme',
      },
      {
        id: 'u2',
        firstName: 'Bo',
        lastName: 'Lee',
        email: 'b@x.com',
        companyName: 'Globex',
      },
    ]);

    const result = await controller.list('acme', Role.client);

    expect((prisma.user.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      role: Role.client,
    });
    expect(result).toEqual([expect.objectContaining({ id: 'u1' })]);
  });

  it('list never selects a password or credential field', async () => {
    const { controller, prisma } = makeController();
    await controller.list();
    const select = (prisma.user.findMany as jest.Mock).mock.calls[0][0].select;
    expect(Object.keys(select)).not.toContain('password');
  });

  describe('create', () => {
    const dto = {
      email: 'newclient@example.com',
      firstName: 'New',
      lastName: 'Client',
      role: Role.client,
    };

    it('creates the Clerk account with a generated temp password, mirrors it locally with mustChangePassword set, and returns the password once', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        role: Role.client,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
      });

      const result = await controller.create(admin, dto);

      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAddress: [dto.email],
          password: expect.any(String),
          publicMetadata: { role: Role.client },
        }),
      );
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkId: 'clerk-new-1',
          email: dto.email,
          role: Role.client,
          mustChangePassword: true,
        }),
      });
      expect(result.tempPassword).toEqual(expect.any(String));
      expect(result.tempPassword.length).toBeGreaterThanOrEqual(8);
      expect(result.user).not.toHaveProperty('tempPassword');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.created_by_admin',
          targetId: 'user-1',
        }),
      );
    });

    it('deletes the freshly-created Clerk account if the local insert fails, rather than leaving an orphan', async () => {
      const { controller, prisma } = makeController();
      (prisma.user.create as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(controller.create(admin, dto)).rejects.toThrow('db down');
      expect(deleteUserMock).toHaveBeenCalledWith('clerk-new-1');
    });

    it('surfaces a Clerk-side creation failure (e.g. duplicate email) as a Conflict, without touching the local DB', async () => {
      const { controller, prisma } = makeController();
      createUserMock.mockRejectedValue(new Error('email already exists'));

      await expect(controller.create(admin, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('refuses to let an admin change their own role', async () => {
      const { controller, prisma } = makeController();
      // Mock findUnique to resolve (as it would for real against the
      // admin's own row) so this test fails only if the guard itself is
      // missing — not incidentally, via an unrelated crash on a later,
      // unmocked call reading a field off an undefined `target`.
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: admin.id,
        clerkId: 'clerk-admin-1',
        role: Role.admin,
      });

      await expect(
        controller.updateRole(admin, admin.id, { role: Role.client }),
      ).rejects.toThrow(
        new BadRequestException('You cannot change your own role'),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates the local role, mirrors it into Clerk publicMetadata, and audit-logs old/new role', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        clerkId: 'clerk-1',
        role: Role.client,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: 'user-1',
        role: Role.admin,
      });

      await controller.updateRole(admin, 'user-1', { role: Role.admin });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: Role.admin },
      });
      expect(updateUserMock).toHaveBeenCalledWith('clerk-1', {
        publicMetadata: { role: Role.admin },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.role_changed',
          targetId: 'user-1',
          metadata: { oldRole: Role.client, newRole: Role.admin },
        }),
      );
    });

    it('still commits the local role change even if mirroring to Clerk fails', async () => {
      const { controller, prisma } = makeController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        clerkId: 'clerk-1',
        role: Role.client,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: 'user-1',
        role: Role.admin,
      });
      updateUserMock.mockRejectedValue(new Error('clerk unreachable'));

      const result = await controller.updateRole(admin, 'user-1', {
        role: Role.admin,
      });
      expect(result).toEqual({ id: 'user-1', role: Role.admin });
    });

    it('404s for an unknown user id instead of a generic 500', async () => {
      const { controller, prisma } = makeController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.updateRole(admin, 'missing', { role: Role.admin }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('sets a generated temp password in Clerk, signs out other sessions, sets mustChangePassword, and returns the password once', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        clerkId: 'clerk-1',
      });

      const result = await controller.resetPassword(admin, 'user-1');

      expect(updateUserMock).toHaveBeenCalledWith('clerk-1', {
        password: expect.any(String),
        signOutOfOtherSessions: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mustChangePassword: true },
      });
      expect(result.tempPassword).toEqual(expect.any(String));
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.password_reset_by_admin',
          targetId: 'user-1',
        }),
      );
    });

    it('404s for an unknown user id instead of a generic 500', async () => {
      const { controller, prisma } = makeController();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.resetPassword(admin, 'missing'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
