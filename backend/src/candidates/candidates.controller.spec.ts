import { ConflictException, NotFoundException } from '@nestjs/common';
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
        updateMany: jest.fn(),
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

  // Lock-in test, not a fix: this whole controller is admin-only via the
  // class-level @Roles(Role.admin) (enforced by RolesGuard) and
  // intentionally has no additional per-row ownership filter — every
  // application belongs to some candidate, but every admin is meant to see
  // every application. This pins that as the intended access model so a
  // future accidental scoping-down (e.g. someone adding a `where` that
  // narrows results) or scoping-up doesn't slip by unnoticed. Mirrors the
  // equivalent lock-in test on FileAccessController.list.
  describe('list', () => {
    it('returns applications across all candidates with no per-row ownership filter, and q fuzzy-searches within that full set', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'app-1',
          candidateUser: {
            firstName: 'Alice',
            lastName: 'Anders',
            email: 'alice@a.com',
          },
          position: { title: 'Engineer', department: 'Eng' },
        },
        {
          id: 'app-2',
          candidateUser: {
            firstName: 'Bob',
            lastName: 'Baker',
            email: 'bob@b.com',
          },
          position: { title: 'Engineer', department: 'Eng' },
        },
      ]);

      // No where clause scoping to any particular candidate id — every
      // admin sees every application.
      const all = await controller.list(undefined, undefined, 0, 20);
      expect(
        (prisma.candidateApplication.findMany as jest.Mock).mock.calls[0][0]
          .where,
      ).toEqual({});
      expect(all.items.map((a: any) => a.id)).toEqual(['app-1', 'app-2']);

      // q filters within that full, unscoped set.
      const filtered = await controller.list('Alice', undefined, 0, 20);
      expect(filtered.items.map((a: any) => a.id)).toEqual(['app-1']);
    });
  });

  describe('decide', () => {
    // decide() moves status with a single conditional updateMany (where:
    // { id, status: pending }), not a findUnique-then-update — that's what
    // makes it safe against two concurrent decide() calls racing on the
    // same application (see the 'race condition' tests below). The
    // returned record comes from a follow-up findUnique.
    function mockSuccessfulDecision(prisma: PrismaService, finalStatus: ApplicationStatus) {
      (prisma.candidateApplication.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        status: finalStatus,
        reviewedByAdminId: admin.id,
      });
    }

    it('approves and records reviewer + audit entry', async () => {
      const { controller, prisma, auditLog } = makeController();
      mockSuccessfulDecision(prisma, ApplicationStatus.approved);

      const result = await controller.decide(admin, 'app-1', { approve: true });

      expect(result?.status).toBe(ApplicationStatus.approved);
      expect(result?.reviewedByAdminId).toBe(admin.id);
      expect(
        (prisma.candidateApplication.updateMany as jest.Mock).mock.calls[0][0]
          .where,
      ).toEqual({ id: 'app-1', status: ApplicationStatus.pending });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'candidate.approved' }),
      );
    });

    it('denies and records the corresponding audit action', async () => {
      const { controller, prisma, auditLog } = makeController();
      mockSuccessfulDecision(prisma, ApplicationStatus.denied);

      const result = await controller.decide(admin, 'app-1', {
        approve: false,
      });

      expect(result?.status).toBe(ApplicationStatus.denied);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'candidate.denied' }),
      );
    });

    // Rule 5: there is no auto-approval path. The whole controller is
    // admin-only (@Roles(Role.admin) at the class level, enforced by
    // RolesGuard), and this endpoint is the *only* place status can move
    // out of 'pending' — it derives status strictly from the boolean
    // `approve` flag, never from any other field a caller might smuggle
    // into the body (e.g. a raw `status: 'approved'`).
    it('derives status only from the approve boolean, ignoring any other status-like field in the body', async () => {
      const { controller, prisma } = makeController();
      mockSuccessfulDecision(prisma, ApplicationStatus.denied);

      await controller.decide(admin, 'app-1', {
        approve: false,
        status: 'approved',
      } as any);

      const passedData = (prisma.candidateApplication.updateMany as jest.Mock)
        .mock.calls[0][0].data;
      expect(passedData.status).toBe(ApplicationStatus.denied);
    });

    // The reviewer must always be the authenticated admin from the
    // request's auth context, never a caller-supplied id in the body —
    // otherwise an admin action could be misattributed in the AuditLog
    // (rule 8) or, worse, a non-admin-authored id could slip through.
    it('always attributes the review to the authenticated admin, ignoring a body-supplied reviewer id', async () => {
      const { controller, prisma } = makeController();
      mockSuccessfulDecision(prisma, ApplicationStatus.approved);

      await controller.decide(admin, 'app-1', {
        approve: true,
        reviewedByAdminId: 'someone-else',
      } as any);

      const passedData = (prisma.candidateApplication.updateMany as jest.Mock)
        .mock.calls[0][0].data;
      expect(passedData.reviewedByAdminId).toBe(admin.id);
    });

    // Without this check, a stale/tampered/typo'd id hits Prisma's P2025
    // directly — an unhandled PrismaClientKnownRequestError isn't an
    // HttpException, so the global exception filter's catch-all turns it
    // into a generic 500 instead of a clean 404.
    it('throws 404 for a nonexistent application id rather than a raw Prisma error', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        controller.decide(admin, 'missing', { approve: true }),
      ).rejects.toThrow(NotFoundException);
    });

    // A decision is final — the admin UI already hides the approve/deny
    // buttons once status !== 'pending' (adminShared.tsx's ActionPair), so
    // a second decide() call reaching the backend means either a replayed
    // request or two admins racing on the same application. Either way it
    // must not silently overwrite the original decision.
    it('rejects deciding an application that has already been approved', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });

      await expect(
        controller.decide(admin, 'app-1', { approve: false }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects deciding an application that has already been denied', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });

      await expect(
        controller.decide(admin, 'app-1', { approve: true }),
      ).rejects.toThrow(ConflictException);
    });

    // The actual concurrency guarantee: the pending check lives inside the
    // updateMany's own `where`, not a preceding findUnique read, so two
    // "simultaneous" decide() calls on the same row can never both
    // succeed — Postgres serializes the two updateMany statements, and
    // only the one that still finds status='pending' at write time gets
    // count: 1. This test simulates the second (loser) call directly:
    // conceptually the row was already flipped by another decide() call
    // between this call's dispatch and its updateMany executing, so
    // Prisma reports count: 0 even though nothing about this call's own
    // request implied the application was already decided.
    it('treats a lost race (updateMany affects 0 rows) as already-decided, never as a silent overwrite', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.candidateApplication.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });

      await expect(
        controller.decide(admin, 'app-1', { approve: true }),
      ).rejects.toThrow(ConflictException);
      expect(auditLog.record).not.toHaveBeenCalled();
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
        otherDocuments: [],
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
        otherDocuments: [],
        expiresInSeconds: 300,
      });
    });

    it('returns null URLs for documents not yet uploaded, without erroring', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        idPhotoS3Key: null,
        cvS3Key: null,
        otherDocuments: [],
      });

      const result = await controller.documents('app-1');

      expect(s3.createDownloadUrl).not.toHaveBeenCalled();
      expect(result).toEqual({
        idPhotoUrl: null,
        cvUrl: null,
        otherDocuments: [],
        expiresInSeconds: 300,
      });
    });

    it('also issues a presigned URL for each additional document', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        idPhotoS3Key: null,
        cvS3Key: null,
        otherDocuments: [
          {
            id: 'doc-1',
            originalFilename: 'transcript.pdf',
            s3Key: 'candidates/x/other-1.pdf',
          },
          {
            id: 'doc-2',
            originalFilename: 'cert.jpg',
            s3Key: 'candidates/x/other-2.jpg',
          },
        ],
      });

      const result = await controller.documents('app-1');

      expect(s3.createDownloadUrl).toHaveBeenCalledWith(
        'candidates/x/other-1.pdf',
        300,
      );
      expect(s3.createDownloadUrl).toHaveBeenCalledWith(
        'candidates/x/other-2.jpg',
        300,
      );
      expect(result.otherDocuments).toEqual([
        {
          id: 'doc-1',
          originalFilename: 'transcript.pdf',
          url: 'https://s3.example/signed',
        },
        {
          id: 'doc-2',
          originalFilename: 'cert.jpg',
          url: 'https://s3.example/signed',
        },
      ]);
    });
  });

  describe('requestDocuments', () => {
    it('flags the application and records an audit entry', async () => {
      const { controller, prisma, auditLog } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });
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

    it('throws 404 for a nonexistent application id rather than a raw Prisma error', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        controller.requestDocuments(admin, 'missing', {}),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.candidateApplication.update).not.toHaveBeenCalled();
    });
  });
});
