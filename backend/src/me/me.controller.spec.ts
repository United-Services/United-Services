import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MeController } from './me.controller';
import { Role, type User } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';
import { MFA_EXEMPT_KEY } from '../common/decorators/mfa-exempt.decorator';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PDF_BYTES = Buffer.from('%PDF-1.4', 'latin1');

// /me/become-candidate is the only self-service role transition in the
// app (client -> candidate) — it must be unreachable for any other role,
// closing off a privilege-escalation route, and it must never expose raw
// user fields (password/clerkId etc.) back to the caller. Documents are
// deliberately NOT part of this call — ID photo/CV are uploaded afterward
// from the candidate's own dashboard (see 'candidate documents' below).
describe('MeController', () => {
  const client = {
    id: 'u1',
    role: Role.client,
    email: 'c@x.com',
    firstName: 'A',
    lastName: 'B',
    companyName: null,
    mfaEnrolled: false,
  } as User;
  const admin = { ...client, role: Role.admin } as User;
  const candidate = { ...client, role: Role.candidate } as User;

  function makeController() {
    const prisma = {
      user: { update: jest.fn() },
      candidateApplication: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    const s3 = {
      readLeadingBytes: jest.fn((key: string) =>
        Promise.resolve(key.includes('id-photo') ? JPEG_BYTES : PDF_BYTES),
      ),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      promoteUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as S3Service;
    return { controller: new MeController(prisma, s3), prisma, s3 };
  }

  describe('me / toDto', () => {
    it('never leaks internal fields like clerkId in the returned DTO', () => {
      const { controller } = makeController();
      const result = controller.me({
        ...client,
        clerkId: 'clerk-secret',
      });
      expect(result).not.toHaveProperty('clerkId');
      expect(result).toEqual({
        id: 'u1',
        role: Role.client,
        email: 'c@x.com',
        firstName: 'A',
        lastName: 'B',
        companyName: null,
        mfaEnrolled: false,
      });
    });

    // Without this, an admin who hasn't completed MFA enrollment yet can
    // never learn they need to — their very first request 403s here,
    // before the frontend's /dashboard redirect can send them to
    // /admin-mfa-setup, since it relies on this exact call to decide
    // that. See MfaEnrolledGuard.
    it('is exempt from MfaEnrolledGuard, so an unenrolled admin can still call it', () => {
      const isExempt = Reflect.getMetadata(
        MFA_EXEMPT_KEY,
        MeController.prototype.me,
      );
      expect(isExempt).toBe(true);
    });
  });

  describe('updateProfile', () => {
    it('updates only the fields on the DTO, scoped to the current user', async () => {
      const { controller, prisma } = makeController();
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...client,
        firstName: 'New',
      });

      await controller.updateProfile(client, { firstName: 'New' } as any);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { firstName: 'New' },
      });
    });
  });

  describe('becomeCandidate', () => {
    it('rejects a non-client account (e.g. admin) from ever reaching this path', async () => {
      const { controller, prisma } = makeController();
      await expect(
        controller.becomeCandidate(admin, { dateOfBirth: '1990-01-01' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('transitions the role to candidate and creates the application without requiring any documents', async () => {
      const { controller, prisma } = makeController();
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...client,
        role: Role.candidate,
      });
      (prisma.candidateApplication.create as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });

      const result = await controller.becomeCandidate(client, {
        dateOfBirth: '1990-01-01',
        positionId: 'pos-1',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.candidateApplication.create).toHaveBeenCalledWith({
        data: {
          candidateUserId: 'u1',
          positionId: 'pos-1',
          dateOfBirth: new Date('1990-01-01'),
        },
      });
      expect(result).toEqual({
        user: expect.objectContaining({ role: Role.candidate }),
        applicationId: 'app-1',
      });
    });

    it('translates any transaction failure (e.g. duplicate application) into a 409', async () => {
      const { controller, prisma } = makeController();
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error('unique constraint violation'),
      );

      await expect(
        controller.becomeCandidate(client, { dateOfBirth: '1990-01-01' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('myCandidateApplication', () => {
    it('rejects a non-candidate account', async () => {
      const { controller } = makeController();
      await expect(controller.myCandidateApplication(client)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404s when the candidate has no application row', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      await expect(
        controller.myCandidateApplication(candidate),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns only the caller's own application, scoped by their user id", async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
        status: 'pending',
        idPhotoS3Key: null,
        cvS3Key: 'candidates/u1/candidate-cv-1.pdf',
        documentsRequested: true,
        documentsRequestedNote: 'Please upload a clearer ID photo',
        position: { title: 'Welder', department: 'Ops' },
      });

      const result = await controller.myCandidateApplication(candidate);

      expect(prisma.candidateApplication.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { candidateUserId: 'u1' } }),
      );
      expect(result).toEqual({
        id: 'app-1',
        status: 'pending',
        hasIdPhoto: false,
        hasCv: true,
        documentsRequested: true,
        documentsRequestedNote: 'Please upload a clearer ID photo',
        position: { title: 'Welder', department: 'Ops' },
      });
    });
  });

  describe('uploadDocuments', () => {
    it('rejects a non-candidate account', async () => {
      const { controller } = makeController();
      await expect(
        controller.uploadDocuments(client, {
          idPhotoS3Key: 'pending/candidates/u1/candidate-id-photo-1.jpg',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a call with neither document present', async () => {
      const { controller } = makeController();
      await expect(controller.uploadDocuments(candidate, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an S3 key that does not belong to the caller', async () => {
      const { controller } = makeController();
      await expect(
        controller.uploadDocuments(candidate, {
          idPhotoS3Key:
            'pending/candidates/someone-else/candidate-id-photo-1.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-pending (already-promoted or otherwise unexpected) key', async () => {
      const { controller } = makeController();
      await expect(
        controller.uploadDocuments(candidate, {
          idPhotoS3Key: 'candidates/u1/candidate-id-photo-1.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('promotes the pending upload to a permanent key, deleting the presign-writable one, before storing it', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.update as jest.Mock).mockResolvedValue({
        idPhotoS3Key: 'candidates/u1/candidate-id-photo-1.jpg',
        cvS3Key: null,
      });

      const result = await controller.uploadDocuments(candidate, {
        idPhotoS3Key: 'pending/candidates/u1/candidate-id-photo-1.jpg',
      });

      expect(s3.promoteUpload).toHaveBeenCalledWith(
        'pending/candidates/u1/candidate-id-photo-1.jpg',
        'candidates/u1/candidate-id-photo-1.jpg',
      );
      expect(prisma.candidateApplication.update).toHaveBeenCalledWith({
        where: { candidateUserId: 'u1' },
        data: {
          idPhotoS3Key: 'candidates/u1/candidate-id-photo-1.jpg',
          documentsRequested: false,
          documentsRequestedNote: null,
        },
      });
      expect(result).toEqual({ hasIdPhoto: true, hasCv: false });
    });

    it('deletes the pending object and never promotes it when content validation fails', async () => {
      const { controller, s3 } = makeController();
      (s3.readLeadingBytes as jest.Mock).mockResolvedValueOnce(
        Buffer.from('<?php system($_GET[0]); ?>'),
      );

      await expect(
        controller.uploadDocuments(candidate, {
          idPhotoS3Key: 'pending/candidates/u1/candidate-id-photo-1.jpg',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(s3.deleteObject).toHaveBeenCalledWith(
        'pending/candidates/u1/candidate-id-photo-1.jpg',
      );
      expect(s3.promoteUpload).not.toHaveBeenCalled();
    });
  });
});
