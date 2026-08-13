import { NotFoundException } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { ApplicationStatus, type User } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';
import type { AuditLogService } from '../audit-log/audit-log.service';

describe('CandidatesController', () => {
  const admin = { id: 'admin-1' } as User;

  function makeController() {
    const prisma = {
      candidateApplication: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
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
      controller: new CandidatesController(prisma, s3, auditLog),
      prisma,
      s3,
      auditLog,
    };
  }

  describe('decide', () => {
    it('approves and records reviewer + audit entry', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.candidateApplication.update as jest.Mock).mockImplementation(
        ({ data }) => Promise.resolve({ id: 'app-1', ...data }),
      );

      const result = await controller.decide(admin, 'app-1', { approve: true });

      expect(result.status).toBe(ApplicationStatus.approved);
      expect(result.reviewedByAdminId).toBe(admin.id);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'candidate.approved' }),
      );
    });

    it('denies and records the corresponding audit action', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.candidateApplication.update as jest.Mock).mockImplementation(
        ({ data }) => Promise.resolve({ id: 'app-1', ...data }),
      );

      const result = await controller.decide(admin, 'app-1', {
        approve: false,
      });

      expect(result.status).toBe(ApplicationStatus.denied);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'candidate.denied' }),
      );
    });
  });

  describe('documents', () => {
    it('throws 404 for a nonexistent application rather than issuing URLs', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(controller.documents('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(s3.createDownloadUrl).not.toHaveBeenCalled();
    });

    it('issues short-lived presigned URLs for both documents', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        idPhotoS3Key: 'candidates/x/id.png',
        cvS3Key: 'candidates/x/cv.pdf',
      });

      const result = await controller.documents('app-1');

      expect(s3.createDownloadUrl).toHaveBeenCalledWith(
        'candidates/x/id.png',
        300,
      );
      expect(s3.createDownloadUrl).toHaveBeenCalledWith(
        'candidates/x/cv.pdf',
        300,
      );
      expect(result).toEqual({
        idPhotoUrl: 'https://s3.example/signed',
        cvUrl: 'https://s3.example/signed',
        expiresInSeconds: 300,
      });
    });

    it('returns null URLs for documents not yet uploaded, without erroring', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        idPhotoS3Key: null,
        cvS3Key: null,
      });

      const result = await controller.documents('app-1');

      expect(s3.createDownloadUrl).not.toHaveBeenCalled();
      expect(result).toEqual({
        idPhotoUrl: null,
        cvUrl: null,
        expiresInSeconds: 300,
      });
    });
  });

  describe('requestDocuments', () => {
    it('flags the application and records an audit entry', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.candidateApplication.update as jest.Mock).mockImplementation(
        ({ data }) => Promise.resolve({ id: 'app-1', ...data }),
      );

      const result = await controller.requestDocuments(admin, 'app-1', {
        note: 'ID photo was blurry, please retake',
      });

      expect(result.documentsRequested).toBe(true);
      expect(result.documentsRequestedNote).toBe(
        'ID photo was blurry, please retake',
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'candidate.documents_requested',
          targetId: 'app-1',
        }),
      );
    });
  });
});
