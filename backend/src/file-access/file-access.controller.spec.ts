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
    overrides: { findUnique?: any; findFirst?: any } = {},
  ) {
    const prisma = {
      fileAccessRequest: {
        findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
        findUnique: overrides.findUnique ?? jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'req-1' }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'req-1', ...data }),
          ),
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
  });
});
