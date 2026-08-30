import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FileAccessController } from './file-access.controller';
import { FileAccessStatus, Role, type User } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';
import type { AuditLogService } from '../audit-log/audit-log.service';

// The request -> admin approval -> short-lived download flow is the core
// access-control boundary of the client portal (docs/BUSINESS_RULES.md
// rules 1 and 3): a client must never be able to download a file that
// isn't theirs, or one that hasn't been explicitly approved by an admin —
// no auto-approval path exists.
describe('FileAccessController', () => {
  const client = { id: 'client-1', role: Role.client } as User;
  const otherClient = { id: 'client-2', role: Role.client } as User;
  const admin = { id: 'admin-1', role: Role.admin } as User;

  function makeController(
    overrides: { findUnique?: any; findFirst?: any; findMany?: any } = {},
  ) {
    const prisma = {
      fileAccessRequest: {
        findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
        findUnique: overrides.findUnique ?? jest.fn(),
        findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'req-1' }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'req-1', ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const s3 = {
      createDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example/signed'),
    } as unknown as S3Service;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    return {
      controller: new FileAccessController(prisma, s3, auditLog),
      prisma,
      s3,
      auditLog,
    };
  }

  describe('create', () => {
    it('rejects a duplicate request for the same file', async () => {
      const { controller } = makeController({
        findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
      });
      await expect(
        controller.create(client, { serviceFileId: 'file-1' }),
      ).rejects.toThrow(ConflictException);
    });

    // Rule 1: a request can only ever be approved by an admin, via
    // POST /:id/decide — never by the create/request endpoint itself,
    // regardless of what the client sends. This is the adversarial case
    // that actually matters (a client trying to smuggle a status through
    // the request body), not just "status defaults to pending when
    // omitted".
    it('always creates the request as pending, even if the request body tries to set status to approved', async () => {
      const { controller, prisma } = makeController();

      await controller.create(client, {
        serviceFileId: 'file-1',
        status: 'approved',
      } as any);

      expect(prisma.fileAccessRequest.create).toHaveBeenCalledWith({
        data: { clientId: client.id, serviceFileId: 'file-1' },
      });
      const passedData = (prisma.fileAccessRequest.create as jest.Mock).mock
        .calls[0][0].data;
      expect(passedData).not.toHaveProperty('status');
    });

    // Rule 3: the request is always scoped to the authenticated caller's
    // own id, never a client-supplied one — even if the body tries to
    // create a request on another client's behalf.
    it('ignores a client-supplied clientId in the request body and scopes to the caller', async () => {
      const { controller, prisma } = makeController();

      await controller.create(client, {
        serviceFileId: 'file-1',
        clientId: otherClient.id,
      } as any);

      expect(prisma.fileAccessRequest.create).toHaveBeenCalledWith({
        data: { clientId: client.id, serviceFileId: 'file-1' },
      });
    });
  });

  describe('decide', () => {
    it('throws 404 for a nonexistent request id rather than a raw Prisma error', async () => {
      const { controller, prisma } = makeController({
        findUnique: jest.fn().mockResolvedValue(null),
      });

      await expect(
        controller.decide(admin, 'missing', { approve: true }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.fileAccessRequest.updateMany).not.toHaveBeenCalled();
    });

    // A decision is final — the admin UI already hides the approve/deny
    // buttons once status !== 'pending' (adminShared.tsx's ActionPair, used
    // by AdminRequestsSection), so a second decide() call reaching the
    // backend means either a replayed request or two admins racing on the
    // same request. Either way it must not silently overwrite the original
    // decidedByAdminId/decidedAt. The pending check lives inside decide()'s
    // atomic updateMany (where: { id, status: pending }), not the
    // preceding findUnique — these tests simulate that by making
    // updateMany itself report count: 0, same shape as
    // candidates.controller.ts's decide().
    it('rejects deciding a request that has already been approved', async () => {
      const { controller, prisma } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          status: FileAccessStatus.approved,
          clientId: client.id,
          serviceFileId: 'file-1',
        }),
      });
      (prisma.fileAccessRequest.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        controller.decide(admin, 'req-1', { approve: false }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects deciding a request that has already been denied', async () => {
      const { controller, prisma } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          status: FileAccessStatus.denied,
          clientId: client.id,
          serviceFileId: 'file-1',
        }),
      });
      (prisma.fileAccessRequest.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        controller.decide(admin, 'req-1', { approve: true }),
      ).rejects.toThrow(ConflictException);
    });

    it('approves a pending request and records decidedByAdminId + audit entry', async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'req-1',
          status: FileAccessStatus.pending,
          clientId: client.id,
          serviceFileId: 'file-1',
        })
        .mockResolvedValueOnce({
          id: 'req-1',
          status: FileAccessStatus.approved,
          clientId: client.id,
          serviceFileId: 'file-1',
          decidedByAdminId: admin.id,
        });
      const { controller, prisma, auditLog } = makeController({ findUnique });

      const result = await controller.decide(admin, 'req-1', {
        approve: true,
      });

      expect(result?.status).toBe(FileAccessStatus.approved);
      expect(result?.decidedByAdminId).toBe(admin.id);
      expect(prisma.fileAccessRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'req-1', status: FileAccessStatus.pending },
        data: expect.objectContaining({
          status: FileAccessStatus.approved,
          decidedByAdminId: admin.id,
        }),
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'file_access.approved' }),
      );
      expect(prisma.fileAccessRequest.updateMany).toHaveBeenCalledTimes(1);
    });

    it('denies a pending request and records the corresponding audit action', async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'req-1',
          status: FileAccessStatus.pending,
          clientId: client.id,
          serviceFileId: 'file-1',
        })
        .mockResolvedValueOnce({
          id: 'req-1',
          status: FileAccessStatus.denied,
          clientId: client.id,
          serviceFileId: 'file-1',
        });
      const { controller, prisma, auditLog } = makeController({ findUnique });

      const result = await controller.decide(admin, 'req-1', {
        approve: false,
      });

      expect(result?.status).toBe(FileAccessStatus.denied);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'file_access.denied' }),
      );
      expect(prisma.fileAccessRequest.updateMany).toHaveBeenCalledTimes(1);
    });

    // The actual concurrency guarantee: two "simultaneous" decide() calls
    // on the same request can never both succeed, since the pending check
    // lives inside the atomic updateMany rather than the preceding read.
    // This simulates the loser of that race directly.
    it('treats a lost race (updateMany affects 0 rows) as already-decided, never as a silent overwrite', async () => {
      const { controller, prisma, auditLog } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          status: FileAccessStatus.pending,
          clientId: client.id,
          serviceFileId: 'file-1',
        }),
      });
      (prisma.fileAccessRequest.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        controller.decide(admin, 'req-1', { approve: true }),
      ).rejects.toThrow(ConflictException);
      expect(auditLog.record).not.toHaveBeenCalled();
    });
  });

  // Lock-in test, not a fix: this endpoint is admin-only via the class-level
  // @Roles(Role.admin) (enforced by RolesGuard) and intentionally has no
  // additional per-row ownership filter — every request belongs to *some*
  // client, but every admin is meant to see every request across all
  // clients. This pins that as the intended access model so a future
  // accidental scoping-down (e.g. someone adding a `where: { ... }` that
  // narrows results) or scoping-up (e.g. exposing this to non-admins)
  // doesn't slip by unnoticed. Mirrors the equivalent lock-in test on
  // CandidatesController.list.
  describe('list', () => {
    it('returns requests across all clients with no per-row ownership filter, and q fuzzy-searches within that full set', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'req-1',
          client: {
            firstName: 'Alice',
            lastName: 'Anders',
            email: 'alice@a.com',
            companyName: null,
          },
          serviceFile: {
            originalFilename: 'brief.pdf',
            service: { name: 'Consulting', slug: 'consulting' },
          },
        },
        {
          id: 'req-2',
          client: {
            firstName: 'Bob',
            lastName: 'Baker',
            email: 'bob@b.com',
            companyName: null,
          },
          serviceFile: {
            originalFilename: 'spec.pdf',
            service: { name: 'Consulting', slug: 'consulting' },
          },
        },
      ]);
      const { controller } = makeController({ findMany });

      // No where clause scoping to any particular client id — every admin
      // sees every request.
      const all = await controller.list(undefined, undefined, 0, 20);
      expect(findMany.mock.calls[0][0].where).toEqual({});
      expect(all.items.map((r: any) => r.id)).toEqual(['req-1', 'req-2']);

      // q filters within that full, unscoped set — not re-scoped to any
      // particular client.
      const filtered = await controller.list('Alice', undefined, 0, 20);
      expect(filtered.items.map((r: any) => r.id)).toEqual(['req-1']);
    });
  });

  // Rule 3: a client cannot see another client's data.
  describe('mine', () => {
    it('scopes the listing to the authenticated caller, never a caller-supplied id', () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = {
        fileAccessRequest: { findMany },
      } as unknown as PrismaService;
      const s3 = {} as unknown as S3Service;
      const auditLog = { record: jest.fn() } as unknown as AuditLogService;
      const controller = new FileAccessController(prisma, s3, auditLog);

      controller.mine(client);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientId: client.id } }),
      );
    });
  });

  describe('download', () => {
    it('rejects a client trying to download a request that is not theirs', async () => {
      const { controller } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          clientId: otherClient.id,
          status: FileAccessStatus.approved,
          serviceFile: { s3Key: 'key' },
        }),
      });
      await expect(controller.download(client, 'req-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects downloading a request that has not been approved', async () => {
      const { controller } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          clientId: client.id,
          status: FileAccessStatus.pending,
          serviceFile: { s3Key: 'key' },
        }),
      });
      await expect(controller.download(client, 'req-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 404 for a nonexistent request', async () => {
      const { controller } = makeController({
        findUnique: jest.fn().mockResolvedValue(null),
      });
      await expect(controller.download(client, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('issues a presigned URL for the owning client once approved', async () => {
      const { controller, s3 } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          clientId: client.id,
          status: FileAccessStatus.approved,
          serviceFile: { s3Key: 'specs/gre.pdf' },
        }),
      });
      const result = await controller.download(client, 'req-1');
      expect(s3.createDownloadUrl).toHaveBeenCalledWith('specs/gre.pdf', 300);
      expect(result.url).toBe('https://s3.example/signed');
    });

    it('lets an admin download any approved request regardless of owner', async () => {
      const { controller } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          clientId: otherClient.id,
          status: FileAccessStatus.approved,
          serviceFile: { s3Key: 'specs/gre.pdf' },
        }),
      });
      await expect(controller.download(admin, 'req-1')).resolves.toMatchObject({
        url: expect.any(String),
      });
    });

    // This route has no @Roles() decorator at all — the ownership check
    // above (isAdminRole(user.role) || own request) is the *only* access
    // boundary here. A `role !== Role.admin` comparison (instead of
    // isAdminRole/ADMIN_ROLES) would have wrongly blocked a super_admin
    // from downloading anyone else's file — the exact kind of gap the
    // repo-wide admin -> super_admin broadening exists to close in every
    // ownership check, not just @Roles()-decorated routes.
    it('lets a super_admin download any approved request regardless of owner too', async () => {
      const superAdmin = { id: 'super-admin-1', role: Role.super_admin } as User;
      const { controller } = makeController({
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          clientId: otherClient.id,
          status: FileAccessStatus.approved,
          serviceFile: { s3Key: 'specs/gre.pdf' },
        }),
      });
      await expect(
        controller.download(superAdmin, 'req-1'),
      ).resolves.toMatchObject({
        url: expect.any(String),
      });
    });
  });
});
