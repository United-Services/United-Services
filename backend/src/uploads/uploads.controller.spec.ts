import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import type { S3Service } from '../s3/s3.service';
import type { User } from '../generated/prisma';

// The content-type allowlist is the only thing stopping a candidate from
// presigning an upload for an arbitrary file type (e.g. an .html/.svg
// that could be served back with an unexpected content type from S3).
describe('UploadsController', () => {
  const user = { id: 'candidate-1' } as User;

  function makeController() {
    const s3 = {
      createUploadUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example/presigned'),
      createMultipartUpload: jest.fn().mockResolvedValue('upload-id-1'),
      presignUploadPart: jest
        .fn()
        .mockResolvedValue('https://s3.example/part-presigned'),
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as S3Service;
    return { controller: new UploadsController(s3), s3 };
  }

  it('rejects a content type not on the allowlist for the given kind', async () => {
    const { controller } = makeController();
    await expect(
      controller.presign(user, {
        kind: 'candidate-id-photo',
        contentType: 'application/x-msdownload',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a CV content type used for the id-photo kind (allowlist is per-kind)', async () => {
    const { controller } = makeController();
    await expect(
      controller.presign(user, {
        kind: 'candidate-id-photo',
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an allowed content type and scopes the S3 key to the uploading user', async () => {
    const { controller, s3 } = makeController();
    const result = await controller.presign(user, {
      kind: 'candidate-cv',
      contentType: 'application/pdf',
    });

    expect(result.url).toBe('https://s3.example/presigned');
    expect(result.key).toMatch(
      /^pending\/candidates\/candidate-1\/candidate-cv-\d+-[0-9a-f-]{36}\.pdf$/,
    );
    expect(s3.createUploadUrl).toHaveBeenCalledWith(
      result.key,
      'application/pdf',
    );
  });

  it('picks the extension from the allowlist mapping, not the client-supplied filename', async () => {
    const { controller } = makeController();
    const result = await controller.presign(user, {
      kind: 'candidate-id-photo',
      contentType: 'image/png',
    });
    expect(result.key.endsWith('.png')).toBe(true);
  });

  it('accepts an image content type for candidate-other-document, unlike candidate-cv', async () => {
    const { controller } = makeController();
    const result = await controller.presign(user, {
      kind: 'candidate-other-document',
      contentType: 'image/jpeg',
    });
    expect(result.key.endsWith('.jpg')).toBe(true);
  });

  it('generates an unguessable key — two presigns for the same user/kind never collide', async () => {
    const { controller } = makeController();
    const a = await controller.presign(user, {
      kind: 'candidate-cv',
      contentType: 'application/pdf',
    });
    const b = await controller.presign(user, {
      kind: 'candidate-cv',
      contentType: 'application/pdf',
    });
    expect(a.key).not.toBe(b.key);
  });

  // keyBelongsToUser() is the only thing stopping candidate A from
  // driving a multipart upload against a key scoped to candidate B —
  // these three endpoints are otherwise just thin passthroughs to the S3
  // SDK with no other ownership check anywhere in the chain.
  describe('multipart ownership boundary', () => {
    const otherUsersKey =
      'pending/candidates/candidate-2/candidate-cv-1-abc.pdf';
    const ownKey = 'pending/candidates/candidate-1/candidate-cv-1-abc.pdf';

    it('multipartPresignPart rejects a key scoped to a different user', async () => {
      const { controller, s3 } = makeController();
      await expect(
        controller.multipartPresignPart(user, {
          key: otherUsersKey,
          uploadId: 'upload-1',
          partNumber: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(s3.presignUploadPart).not.toHaveBeenCalled();
    });

    it('multipartPresignPart allows a key scoped to the requesting user', async () => {
      const { controller, s3 } = makeController();
      const result = await controller.multipartPresignPart(user, {
        key: ownKey,
        uploadId: 'upload-1',
        partNumber: 1,
      });
      expect(result.url).toBe('https://s3.example/part-presigned');
      expect(s3.presignUploadPart).toHaveBeenCalledWith(ownKey, 'upload-1', 1);
    });

    it('multipartComplete rejects a key scoped to a different user', async () => {
      const { controller, s3 } = makeController();
      await expect(
        controller.multipartComplete(user, {
          key: otherUsersKey,
          uploadId: 'upload-1',
          parts: [{ partNumber: 1, eTag: 'etag-1' }],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(s3.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('multipartAbort rejects a key scoped to a different user', async () => {
      const { controller, s3 } = makeController();
      await expect(
        controller.multipartAbort(user, {
          key: otherUsersKey,
          uploadId: 'upload-1',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(s3.abortMultipartUpload).not.toHaveBeenCalled();
    });

    it('multipartAbort allows a key scoped to the requesting user', async () => {
      const { controller, s3 } = makeController();
      const result = await controller.multipartAbort(user, {
        key: ownKey,
        uploadId: 'upload-1',
      });
      expect(result).toEqual({ ok: true });
      expect(s3.abortMultipartUpload).toHaveBeenCalledWith(ownKey, 'upload-1');
    });

    // The ownership check is a plain string prefix match, not a path
    // normalization — worth confirming this is actually safe rather than
    // assumed: S3 has no directory-traversal concept (keys are opaque
    // strings in a flat namespace, "/" is purely cosmetic), so a key
    // containing literal ".." characters is just an unusual-looking key
    // that still lives under the caller's own prefix as a string, not an
    // actual escape into another user's namespace.
    it('a key containing literal ".." still resolves under the caller\'s own prefix, not a traversal', async () => {
      const { controller, s3 } = makeController();
      const weirdButOwnKey =
        'pending/candidates/candidate-1/../candidate-1/x.pdf';
      const result = await controller.multipartAbort(user, {
        key: weirdButOwnKey,
        uploadId: 'upload-1',
      });
      expect(result).toEqual({ ok: true });
      expect(s3.abortMultipartUpload).toHaveBeenCalledWith(
        weirdButOwnKey,
        'upload-1',
      );
    });
  });
});
