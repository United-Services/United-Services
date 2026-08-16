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
import type { MfaService } from '../mfa/mfa.service';
import { MFA_EXEMPT_KEY } from '../common/decorators/mfa-exempt.decorator';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PDF_BYTES = Buffer.from('%PDF-1.4', 'latin1');

const updateUserMock = jest.fn();
jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    users: { updateUser: (...args: unknown[]) => updateUserMock(...args) },
  }),
}));

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
    mustChangePassword: false,
    clerkId: 'clerk-u1',
  } as User;
  const admin = { ...client, role: Role.admin } as User;
  const candidate = { ...client, role: Role.candidate } as User;

  function makeController() {
    updateUserMock.mockReset().mockResolvedValue({});
    const prisma = {
      user: { update: jest.fn() },
      candidateApplication: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      candidateDocument: {
        create: jest.fn(),
      },
      // Supports both the array form (Promise.all(ops)) used elsewhere in
      // this controller and the callback form ($transaction(async tx =>
      // ...)) used by uploadOtherDocument — tx is just `prisma` itself
      // here, same as the other candidateApplication/candidateDocument
      // mocks above, since nothing in these tests needs real isolation.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? arg(prisma)
          : Promise.all(arg as unknown[]),
      ),
    } as unknown as PrismaService;
    const s3 = {
      readLeadingBytes: jest.fn((key: string) =>
        Promise.resolve(key.includes('id-photo') ? JPEG_BYTES : PDF_BYTES),
      ),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      promoteUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as S3Service;
    const mfa = {
      isSessionVerified: jest.fn().mockResolvedValue(true),
    } as unknown as MfaService;
    return { controller: new MeController(prisma, s3, mfa), prisma, s3, mfa };
  }

  describe('me / toDto', () => {
    it('never leaks internal fields like clerkId in the returned DTO', async () => {
      const { controller } = makeController();
      const result = await controller.me(
        { ...client, clerkId: 'clerk-secret' },
        'sess_1',
      );
      expect(result).not.toHaveProperty('clerkId');
      expect(result).toEqual({
        id: 'u1',
        role: Role.client,
        email: 'c@x.com',
        firstName: 'A',
        lastName: 'B',
        companyName: null,
        mfaEnrolled: false,
        mustChangePassword: false,
        mfaSessionVerified: true,
      });
    });

    // The actual gap this session's login-lockout bug traced back to:
    // mfaEnrolled alone was being treated as "this admin is fully
    // verified for the current sign-in", with no re-check on every new
    // session. mfaSessionVerified is the field the frontend now uses to
    // tell "enrolled, but hasn't proven the second factor yet this
    // session" apart from "fully verified, let them through".
    it('reflects an unverified session distinctly from an unenrolled admin', async () => {
      const { controller, mfa } = makeController();
      (mfa.isSessionVerified as jest.Mock).mockResolvedValue(false);

      const result = await controller.me(
        { ...admin, mfaEnrolled: true },
        'sess_1',
      );

      expect(result.mfaEnrolled).toBe(true);
      expect(result.mfaSessionVerified).toBe(false);
      expect(mfa.isSessionVerified).toHaveBeenCalledWith('sess_1');
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
        otherDocuments: [
          { id: 'doc-1', originalFilename: 'transcript.pdf', uploadedAt: new Date('2026-01-01') },
        ],
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
        otherDocuments: [
          { id: 'doc-1', originalFilename: 'transcript.pdf', uploadedAt: new Date('2026-01-01') },
        ],
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

  describe('uploadOtherDocument', () => {
    it('rejects a non-candidate account', async () => {
      const { controller } = makeController();
      await expect(
        controller.uploadOtherDocument(client, {
          s3Key: 'pending/candidates/u1/candidate-other-document-1.pdf',
          originalFilename: 'transcript.pdf',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s when the candidate has no application row', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      await expect(
        controller.uploadOtherDocument(candidate, {
          s3Key: 'pending/candidates/u1/candidate-other-document-1.pdf',
          originalFilename: 'transcript.pdf',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an S3 key that does not belong to the caller', async () => {
      const { controller, prisma } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });
      await expect(
        controller.uploadOtherDocument(candidate, {
          s3Key: 'pending/candidates/someone-else/candidate-other-document-1.pdf',
          originalFilename: 'transcript.pdf',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new document row (appending, not replacing) and clears a pending documents-requested flag', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });
      (prisma.candidateDocument.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        originalFilename: 'transcript.pdf',
        uploadedAt: new Date('2026-01-01'),
      });

      const result = await controller.uploadOtherDocument(candidate, {
        s3Key: 'pending/candidates/u1/candidate-other-document-1.pdf',
        originalFilename: 'transcript.pdf',
      });

      expect(s3.promoteUpload).toHaveBeenCalledWith(
        'pending/candidates/u1/candidate-other-document-1.pdf',
        'candidates/u1/candidate-other-document-1.pdf',
      );
      expect(prisma.candidateDocument.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          s3Key: 'candidates/u1/candidate-other-document-1.pdf',
          originalFilename: 'transcript.pdf',
        },
      });
      expect(prisma.candidateApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: { documentsRequested: false, documentsRequestedNote: null },
      });
      expect(result).toEqual({
        id: 'doc-1',
        originalFilename: 'transcript.pdf',
        uploadedAt: new Date('2026-01-01'),
      });
    });

    it('deletes the pending object and never creates a row when content validation fails', async () => {
      const { controller, prisma, s3 } = makeController();
      (prisma.candidateApplication.findUnique as jest.Mock).mockResolvedValue({
        id: 'app-1',
      });
      (s3.readLeadingBytes as jest.Mock).mockResolvedValueOnce(
        Buffer.from('<?php system($_GET[0]); ?>'),
      );

      await expect(
        controller.uploadOtherDocument(candidate, {
          s3Key: 'pending/candidates/u1/candidate-other-document-1.pdf',
          originalFilename: 'shell.pdf',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(s3.deleteObject).toHaveBeenCalledWith(
        'pending/candidates/u1/candidate-other-document-1.pdf',
      );
      expect(prisma.candidateDocument.create).not.toHaveBeenCalled();
    });
  });

  // The one path out of mustChangePassword=true (temp-password accounts
  // created by an admin, or reset by one) — must be reachable by any role
  // and by an admin who hasn't enrolled MFA yet, since that's exactly the
  // state a brand-new admin-created account is in.
  describe('changePassword', () => {
    it('sets the new password in Clerk, signs out other sessions, and clears mustChangePassword', async () => {
      const { controller, prisma } = makeController();

      const result = await controller.changePassword(client, {
        newPassword: 'brand-new-pw-1',
      });

      expect(updateUserMock).toHaveBeenCalledWith('clerk-u1', {
        password: 'brand-new-pw-1',
        signOutOfOtherSessions: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { mustChangePassword: false },
      });
      expect(result).toEqual({ success: true });
    });

    it('is exempt from MfaEnrolledGuard, so a not-yet-enrolled admin can still call it', () => {
      const isExempt = Reflect.getMetadata(
        MFA_EXEMPT_KEY,
        MeController.prototype.changePassword,
      );
      expect(isExempt).toBe(true);
    });
  });
});
