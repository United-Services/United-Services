import { ServicesController } from './services.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { RedisService } from '../redis/redis.service';
import type { User } from '../generated/prisma';

describe('ServicesController', () => {
  const admin = { id: 'admin-1' } as User;

  function makeController() {
    const prisma = {
      service: { findMany: jest.fn(), update: jest.fn() },
      serviceFile: { count: jest.fn(), create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    } as unknown as PrismaService;
    const s3 = { createUploadUrl: jest.fn().mockResolvedValue('https://s3.example/put') } as unknown as S3Service;
    const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
    const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as RedisService;
    return { controller: new ServicesController(prisma, s3, auditLog, redis), prisma, s3, auditLog, redis };
  }

  describe('list — Redis caching', () => {
    it('returns the cached value without hitting the DB on a cache hit', async () => {
      const { controller, prisma, redis } = makeController();
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify([{ id: 'svc-1' }]));

      const result = await controller.list();

      expect(result).toEqual([{ id: 'svc-1' }]);
      expect(prisma.service.findMany).not.toHaveBeenCalled();
    });

    it('queries the DB and populates the cache on a cache miss', async () => {
      const { controller, prisma, redis } = makeController();
      (redis.get as jest.Mock).mockResolvedValue(null);
      (prisma.service.findMany as jest.Mock).mockResolvedValue([{ id: 'svc-1' }]);

      const result = await controller.list();

      expect(result).toEqual([{ id: 'svc-1' }]);
      expect(redis.set).toHaveBeenCalledWith('cache:services:list', JSON.stringify([{ id: 'svc-1' }]), 'EX', 300);
    });
  });

  describe('update', () => {
    it('invalidates the services-list cache after an admin edit', async () => {
      const { controller, prisma, redis } = makeController();
      (prisma.service.update as jest.Mock).mockResolvedValue({ id: 'svc-1', name: 'New Name' });

      await controller.update(admin, 'svc-1', { name: 'New Name' } as any);

      expect(redis.del).toHaveBeenCalledWith('cache:services:list');
    });
  });

  describe('presignFile', () => {
    it('sanitizes the filename before building the S3 key', async () => {
      const { controller } = makeController();
      const result = await controller.presignFile('svc-1', {
        filename: '../../evil name?.pdf',
        contentType: 'application/pdf',
      } as any);

      // No raw path separators or unsafe characters survive in the
      // filename portion of the key — a "/" here could otherwise let a
      // crafted filename inject extra key segments.
      const filenamePortion = result.key.slice('service-specs/svc-1/'.length);
      expect(filenamePortion).not.toContain('/');
      expect(filenamePortion).not.toContain('?');
      expect(filenamePortion).not.toContain(' ');
      expect(result.key.startsWith('service-specs/svc-1/')).toBe(true);
    });
  });

  describe('confirmFile', () => {
    it('versions a service file as one more than the existing count', async () => {
      const { controller, prisma } = makeController();
      (prisma.serviceFile.count as jest.Mock).mockResolvedValue(2);
      (prisma.serviceFile.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'file-1', ...data }));

      const result = await controller.confirmFile(admin, 'svc-1', { s3Key: 'key', originalFilename: 'spec.pdf' } as any);

      expect(result.version).toBe(3);
    });
  });
});
