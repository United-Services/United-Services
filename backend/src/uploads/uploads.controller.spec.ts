import { BadRequestException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import type { S3Service } from '../s3/s3.service';
import type { User } from '../generated/prisma';

// The content-type allowlist is the only thing stopping a candidate from
// presigning an upload for an arbitrary file type (e.g. an .html/.svg
// that could be served back with an unexpected content type from S3).
describe('UploadsController', () => {
  const user = { id: 'candidate-1' } as User;

  function makeController() {
    const s3 = { createUploadUrl: jest.fn().mockResolvedValue('https://s3.example/presigned') } as unknown as S3Service;
    return { controller: new UploadsController(s3), s3 };
  }

  it('rejects a content type not on the allowlist for the given kind', async () => {
    const { controller } = makeController();
    await expect(
      controller.presign(user, { kind: 'candidate-id-photo', contentType: 'application/x-msdownload' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a CV content type used for the id-photo kind (allowlist is per-kind)', async () => {
    const { controller } = makeController();
    await expect(
      controller.presign(user, { kind: 'candidate-id-photo', contentType: 'application/pdf' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an allowed content type and scopes the S3 key to the uploading user', async () => {
    const { controller, s3 } = makeController();
    const result = await controller.presign(user, { kind: 'candidate-cv', contentType: 'application/pdf' });

    expect(result.url).toBe('https://s3.example/presigned');
    expect(result.key).toMatch(/^candidates\/candidate-1\/candidate-cv-\d+\.pdf$/);
    expect(s3.createUploadUrl).toHaveBeenCalledWith(result.key, 'application/pdf');
  });

  it('picks the extension from the allowlist mapping, not the client-supplied filename', async () => {
    const { controller } = makeController();
    const result = await controller.presign(user, { kind: 'candidate-id-photo', contentType: 'image/png' });
    expect(result.key.endsWith('.png')).toBe(true);
  });
});
