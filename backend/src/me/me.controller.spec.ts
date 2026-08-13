import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MeController } from './me.controller';
import { Role, type User } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../s3/s3.service';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PDF_BYTES = Buffer.from('%PDF-1.4', 'latin1');

// /me/become-candidate is the only self-service role transition in the
// app (client -> candidate) — it must be unreachable for any other role,
// closing off a privilege-escalation route, and it must never expose raw
// user fields (password/clerkId etc.) back to the caller.
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

  function makeController() {
    const prisma = {
      user: { update: jest.fn() },
      candidateApplication: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    const s3 = {
      readLeadingBytes: jest.fn((key: string) =>
        Promise.resolve(key.includes('id-photo') ? JPEG_BYTES : PDF_BYTES),
      ),
      deleteObject: jest.fn().mockResolvedValue(undefined),
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
        controller.becomeCandidate(admin, {
          dateOfBirth: '1990-01-01',
          idPhotoS3Key: 'k1',
          cvS3Key: 'k2',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('transitions the role to candidate and creates the application atomically', async () => {
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
        idPhotoS3Key: 'candidates/u1/candidate-id-photo-1.jpg',
        cvS3Key: 'candidates/u1/candidate-cv-1.pdf',
        positionId: 'pos-1',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
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
        controller.becomeCandidate(client, {
          dateOfBirth: '1990-01-01',
          idPhotoS3Key: 'candidates/u1/candidate-id-photo-1.jpg',
          cvS3Key: 'candidates/u1/candidate-cv-1.pdf',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
