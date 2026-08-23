import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServicesController } from './services.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { RedisService } from '../redis/redis.service';
import type { TranslationService } from '../translations/translation.service';
import type { User } from '../generated/prisma';

describe('ServicesController', () => {
  const admin = { id: 'admin-1' } as User;

  function makeController() {
    const prisma = {
      service: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: 0 } }),
      },
      serviceFile: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      serviceRequest: {
        count: jest.fn().mockResolvedValue(0),
      },
      fileAccessRequest: {
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;
    const s3 = {
      createUploadUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      createDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example/get?signed=1'),
      readLeadingBytes: jest
        .fn()
        .mockResolvedValue(Buffer.from('%PDF-1.4', 'latin1')),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      promoteUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as S3Service;
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    const redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as RedisService;
    const translations = {
      getTranslatedServices: jest.fn().mockResolvedValue(new Map()),
      triggerServiceAsync: jest.fn(),
    } as unknown as TranslationService;
    return {
      controller: new ServicesController(
        prisma,
        s3,
        auditLog,
        redis,
        translations,
      ),
      prisma,
      s3,
      auditLog,
      redis,
      translations,
    };
  }

  describe('list — Redis caching', () => {
    it('returns the cached value without hitting the DB on a cache hit', async () => {
      const { controller, prisma, redis } = makeController();
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify([{ id: 'svc-1', imageS3Key: null }]),
      );

      const result = await controller.list();

      expect(result).toEqual([
        { id: 'svc-1', imageS3Key: null, imageUrl: null },
      ]);
      expect(prisma.service.findMany).not.toHaveBeenCalled();
    });

    it('queries the DB and populates the cache on a cache miss', async () => {
      const { controller, prisma, redis } = makeController();
      (redis.get as jest.Mock).mockResolvedValue(null);
      (prisma.service.findMany as jest.Mock).mockResolvedValue([
        { id: 'svc-1', imageS3Key: null },
      ]);

      const result = await controller.list();

      expect(result).toEqual([
        { id: 'svc-1', imageS3Key: null, imageUrl: null },
      ]);
      expect(redis.set).toHaveBeenCalledWith(
        'cache:services:list',
        JSON.stringify([{ id: 'svc-1', imageS3Key: null }]),
        'EX',
        300,
      );
    });

    it('resolves imageS3Key to a fresh presigned URL rather than caching the URL itself', async () => {
      const { controller, redis, s3 } = makeController();
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify([
          { id: 'svc-1', imageS3Key: 'service-images/svc-1/x.jpg' },
        ]),
      );

      const result = await controller.list();

      expect(s3.createDownloadUrl).toHaveBeenCalledWith(
        'service-images/svc-1/x.jpg',
        3600,
      );
      expect(result[0].imageUrl).toBe('https://s3.example/get?signed=1');
    });

    it('with a translatable locale, merges the machine translation onto each service', async () => {
      const { controller, redis, translations } = makeController();
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify([
          { id: 'svc-1', name: 'GRE Lining', specs: ['API 15CLT Compliant'] },
        ]),
      );
      (translations.getTranslatedServices as jest.Mock).mockResolvedValue(
        new Map([
          [
            'svc-1',
            {
              status: 'translated',
              name: 'تبطين GRE',
              shortDescription: 'وصف',
              longDescription: 'وصف طويل',
            },
          ],
        ]),
      );

      const result = await controller.list('ar');

      expect(translations.getTranslatedServices).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'svc-1' })],
        'ar',
      );
      expect(result[0].name).toBe('تبطين GRE');
      // specs is never touched by translation — stays exactly as stored.
      expect(result[0].specs).toEqual(['API 15CLT Compliant']);
    });

    it('with no locale (or "en"), never calls the translation service', async () => {
      const { controller, redis, translations } = makeController();
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify([{ id: 'svc-1', imageS3Key: null }]),
      );

      await controller.list();
      await controller.list('en');

      expect(translations.getTranslatedServices).not.toHaveBeenCalled();
    });
  });

  describe('bySlug', () => {
    it('returns the service for a matching slug', async () => {
      const { controller, prisma } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        id: 'svc-1',
        slug: 'gre-lining',
        imageS3Key: null,
      });

      const result = await controller.bySlug('gre-lining');

      expect(prisma.service.findUnique).toHaveBeenCalledWith({
        where: { slug: 'gre-lining' },
      });
      expect(result).toEqual({
        id: 'svc-1',
        slug: 'gre-lining',
        imageS3Key: null,
        imageUrl: null,
      });
    });

    it('404s for an unknown slug instead of a generic 500', async () => {
      const { controller, prisma } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.bySlug('does-not-exist')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('latestFiles', () => {
    it('returns an empty object for no ids', async () => {
      const { controller } = makeController();
      expect(await controller.latestFiles(undefined)).toEqual({});
      expect(await controller.latestFiles('')).toEqual({});
    });

    it('queries once for every requested service and keeps only the newest file per service', async () => {
      const { controller, prisma } = makeController();
      // findMany is called ordered newest-first — the handler relies on
      // that ordering to pick "first occurrence per serviceId" as latest.
      (prisma.serviceFile.findMany as jest.Mock).mockResolvedValue([
        { serviceId: 'svc-1', id: 'file-2', originalFilename: 'v2.pdf' },
        { serviceId: 'svc-1', id: 'file-1', originalFilename: 'v1.pdf' },
        { serviceId: 'svc-2', id: 'file-3', originalFilename: 'only.pdf' },
      ]);

      const result = await controller.latestFiles('svc-1,svc-2,svc-3');

      expect(prisma.serviceFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceId: { in: ['svc-1', 'svc-2', 'svc-3'] } },
          orderBy: { uploadedAt: 'desc' },
        }),
      );
      expect(result).toEqual({
        'svc-1': { serviceId: 'svc-1', id: 'file-2', originalFilename: 'v2.pdf' },
        'svc-2': { serviceId: 'svc-2', id: 'file-3', originalFilename: 'only.pdf' },
      });
      // svc-3 had no files at all — correctly absent, not a null entry.
      expect(result).not.toHaveProperty('svc-3');
    });
  });

  describe('create', () => {
    it('rejects a slug that already exists', async () => {
      const { controller, prisma } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing',
      });

      await expect(
        controller.create(admin, {
          slug: 'gre-lining',
          name: 'GRE Lining',
          shortDescription: 'short',
          longDescription: 'long',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('creates with iconKey defaulted to the slug and order after the current max', async () => {
      const { controller, prisma, redis } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.service.aggregate as jest.Mock).mockResolvedValue({
        _max: { order: 4 },
      });
      (prisma.service.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'svc-new', ...data }),
      );

      const result = await controller.create(admin, {
        slug: 'new-service',
        name: 'New Service',
        shortDescription: 'short',
        longDescription: 'long',
        specs: ['Spec A'],
      });

      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'new-service',
          iconKey: 'new-service',
          order: 5,
          specs: ['Spec A'],
          updatedByAdminId: admin.id,
        }),
      });
      expect(redis.del).toHaveBeenCalledWith('cache:services:list');
      expect(result.imageUrl).toBeNull();
    });
  });

  describe('update', () => {
    it('invalidates the services-list cache after an admin edit', async () => {
      const { controller, prisma, redis } = makeController();
      (prisma.service.update as jest.Mock).mockResolvedValue({
        id: 'svc-1',
        name: 'New Name',
        imageS3Key: null,
      });

      await controller.update(admin, 'svc-1', { name: 'New Name' });

      expect(redis.del).toHaveBeenCalledWith('cache:services:list');
    });
  });

  describe('remove', () => {
    it('404s for an unknown service id', async () => {
      const { controller, prisma } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.remove(admin, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to delete a service with existing RFQs against it', async () => {
      const { controller, prisma } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        id: 'svc-1',
        slug: 'gre-lining',
        name: 'GRE Lining',
        imageS3Key: null,
        files: [],
      });
      (prisma.serviceRequest.count as jest.Mock).mockResolvedValue(2);

      await expect(controller.remove(admin, 'svc-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.service.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a service whose spec files have file-access requests on record', async () => {
      const { controller, prisma } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        id: 'svc-1',
        slug: 'gre-lining',
        name: 'GRE Lining',
        imageS3Key: null,
        files: [{ id: 'file-1', s3Key: 'service-specs/svc-1/spec.pdf' }],
      });
      (prisma.fileAccessRequest.count as jest.Mock).mockResolvedValue(1);

      await expect(controller.remove(admin, 'svc-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.service.delete).not.toHaveBeenCalled();
    });

    it('deletes the service, its S3 image and spec-file objects, and invalidates the cache', async () => {
      const { controller, prisma, s3, redis, auditLog } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        id: 'svc-1',
        slug: 'gre-lining',
        name: 'GRE Lining',
        imageS3Key: 'service-images/svc-1/hero.jpg',
        files: [{ id: 'file-1', s3Key: 'service-specs/svc-1/spec.pdf' }],
      });

      const result = await controller.remove(admin, 'svc-1');

      expect(prisma.service.delete).toHaveBeenCalledWith({
        where: { id: 'svc-1' },
      });
      expect(s3.deleteObject).toHaveBeenCalledWith(
        'service-specs/svc-1/spec.pdf',
      );
      expect(s3.deleteObject).toHaveBeenCalledWith(
        'service-images/svc-1/hero.jpg',
      );
      expect(redis.del).toHaveBeenCalledWith('cache:services:list');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'service.deleted' }),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe('presignImage', () => {
    it('rejects an unsupported content type', async () => {
      const { controller } = makeController();
      await expect(
        controller.presignImage('svc-1', { contentType: 'application/pdf' }),
      ).rejects.toThrow();
    });

    it('builds a pending key with the right prefix and extension', async () => {
      const { controller } = makeController();
      const result = await controller.presignImage('svc-1', {
        contentType: 'image/png',
      });
      expect(result.key.startsWith('pending/service-images/svc-1/')).toBe(true);
      expect(result.key.endsWith('.png')).toBe(true);
    });
  });

  describe('confirmImage', () => {
    it('rejects (and never promotes) a non-pending s3Key', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        imageS3Key: null,
      });
      await expect(
        controller.confirmImage(admin, 'svc-1', {
          s3Key: 'service-images/svc-1/x.jpg',
        }),
      ).rejects.toThrow();
      expect(s3.promoteUpload).not.toHaveBeenCalled();
    });

    it('rejects content that does not match a real image signature', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        imageS3Key: null,
      });
      (s3.readLeadingBytes as jest.Mock).mockResolvedValue(
        Buffer.from('<?php system($_GET[0]); ?>'),
      );

      await expect(
        controller.confirmImage(admin, 'svc-1', {
          s3Key: 'pending/service-images/svc-1/x.jpg',
        }),
      ).rejects.toThrow();
      expect(s3.deleteObject).toHaveBeenCalledWith(
        'pending/service-images/svc-1/x.jpg',
      );
      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('promotes the pending image, updates imageS3Key, and deletes the old image', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        imageS3Key: 'service-images/svc-1/old.jpg',
      });
      (s3.readLeadingBytes as jest.Mock).mockResolvedValue(
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      );
      (prisma.service.update as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'svc-1', ...data }),
      );

      const result = await controller.confirmImage(admin, 'svc-1', {
        s3Key: 'pending/service-images/svc-1/new.jpg',
      });

      expect(s3.promoteUpload).toHaveBeenCalledWith(
        'pending/service-images/svc-1/new.jpg',
        'service-images/svc-1/new.jpg',
      );
      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 'svc-1' },
        data: {
          imageS3Key: 'service-images/svc-1/new.jpg',
          updatedByAdminId: admin.id,
        },
      });
      // Old image deleted only after the new key is committed, not before.
      expect(s3.deleteObject).toHaveBeenCalledWith(
        'service-images/svc-1/old.jpg',
      );
      expect(result.imageS3Key).toBe('service-images/svc-1/new.jpg');
    });

    it('404s for an unknown service id', async () => {
      const { controller, prisma } = makeController();
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.confirmImage(admin, 'missing', {
          s3Key: 'pending/service-images/missing/x.jpg',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('presignFile', () => {
    it('sanitizes the filename before building the S3 key', async () => {
      const { controller } = makeController();
      const result = await controller.presignFile('svc-1', {
        filename: '../../evil name?.pdf',
        contentType: 'application/pdf',
      });

      // No raw path separators or unsafe characters survive in the
      // filename portion of the key — a "/" here could otherwise let a
      // crafted filename inject extra key segments.
      const prefix = 'pending/service-specs/svc-1/';
      const filenamePortion = result.key.slice(prefix.length);
      expect(filenamePortion).not.toContain('/');
      expect(filenamePortion).not.toContain('?');
      expect(filenamePortion).not.toContain(' ');
      expect(result.key.startsWith(prefix)).toBe(true);
    });
  });

  describe('confirmFile', () => {
    it('versions a service file as one more than the existing count', async () => {
      const { controller, prisma } = makeController();
      (prisma.serviceFile.count as jest.Mock).mockResolvedValue(2);
      (prisma.serviceFile.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'file-1', ...data }),
      );

      const result = await controller.confirmFile(admin, 'svc-1', {
        s3Key: 'pending/service-specs/svc-1/spec.pdf',
        originalFilename: 'spec.pdf',
      });

      expect(result.version).toBe(3);
    });

    it('promotes the pending upload to a permanent key and stores that, not the pending key', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.serviceFile.count as jest.Mock).mockResolvedValue(0);
      (prisma.serviceFile.create as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'file-1', ...data }),
      );

      const result = await controller.confirmFile(admin, 'svc-1', {
        s3Key: 'pending/service-specs/svc-1/spec.pdf',
        originalFilename: 'spec.pdf',
      });

      expect(s3.promoteUpload).toHaveBeenCalledWith(
        'pending/service-specs/svc-1/spec.pdf',
        'service-specs/svc-1/spec.pdf',
      );
      expect(result.s3Key).toBe('service-specs/svc-1/spec.pdf');
    });

    it('rejects (and never promotes) a non-pending s3Key', async () => {
      const { controller, s3 } = makeController();
      await expect(
        controller.confirmFile(admin, 'svc-1', {
          s3Key: 'service-specs/svc-1/spec.pdf',
          originalFilename: 'spec.pdf',
        }),
      ).rejects.toThrow();
      expect(s3.promoteUpload).not.toHaveBeenCalled();
    });
  });
});
