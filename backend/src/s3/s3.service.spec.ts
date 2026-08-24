import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// Imported after the mocks above so S3Service's `new S3Client(...)` picks
// up the mocked constructor.
import { S3Service } from './s3.service';

describe('S3Service', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      AWS_REGION: 'us-east-1',
      S3_BUCKET_NAME: 'test-bucket',
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function makeService() {
    return new S3Service();
  }

  describe('createUploadUrl', () => {
    it('builds a PutObjectCommand with the right Bucket/Key/ContentType and default 300s expiry', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(
        'https://signed.example/put',
      );
      const s3 = makeService();

      const url = await s3.createUploadUrl('some/key.jpg', 'image/jpeg');

      expect(url).toBe('https://signed.example/put');
      const [, command, options] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'some/key.jpg',
        ContentType: 'image/jpeg',
      });
      expect(options).toEqual({ expiresIn: 300 });
    });

    it('honors an explicit expiry override', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(
        'https://signed.example/put',
      );
      const s3 = makeService();

      await s3.createUploadUrl('some/key.jpg', 'image/jpeg', 60);

      const [, , options] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(options).toEqual({ expiresIn: 60 });
    });
  });

  describe('createDownloadUrl', () => {
    it('builds a GetObjectCommand with the right Bucket/Key and default 300s expiry', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(
        'https://signed.example/get',
      );
      const s3 = makeService();

      const url = await s3.createDownloadUrl('some/key.jpg');

      expect(url).toBe('https://signed.example/get');
      const [, command, options] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'some/key.jpg',
      });
      expect(options).toEqual({ expiresIn: 300 });
    });

    it('honors an explicit expiry override', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(
        'https://signed.example/get',
      );
      const s3 = makeService();

      await s3.createDownloadUrl('some/key.jpg', 900);

      const [, , options] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(options).toEqual({ expiresIn: 900 });
    });
  });

  describe('readLeadingBytes', () => {
    it('requests the default 0-4095 byte range', async () => {
      mockSend.mockResolvedValue({ Body: undefined });
      const s3 = makeService();

      await s3.readLeadingBytes('key.jpg');

      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input.Range).toBe('bytes=0-4095');
    });

    it('requests a custom byte range when maxBytes is overridden', async () => {
      mockSend.mockResolvedValue({ Body: undefined });
      const s3 = makeService();

      await s3.readLeadingBytes('key.jpg', 1024);

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Range).toBe('bytes=0-1023');
    });

    it('concatenates a multi-chunk async-iterable Body into one Buffer', async () => {
      const chunks = {
        [Symbol.asyncIterator]() {
          const values = [Buffer.from('ab'), Buffer.from('cd')];
          let i = 0;
          return {
            next: () =>
              Promise.resolve(
                i < values.length
                  ? { value: values[i++], done: false }
                  : { value: undefined, done: true },
              ),
          };
        },
      };
      mockSend.mockResolvedValue({ Body: chunks });
      const s3 = makeService();

      const result = await s3.readLeadingBytes('key.jpg');

      expect(result.toString()).toBe('abcd');
    });

    it('returns an empty Buffer without throwing when Body is undefined', async () => {
      mockSend.mockResolvedValue({ Body: undefined });
      const s3 = makeService();

      const result = await s3.readLeadingBytes('key.jpg');

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('returns an empty Buffer without throwing when Body is null', async () => {
      mockSend.mockResolvedValue({ Body: null });
      const s3 = makeService();

      const result = await s3.readLeadingBytes('key.jpg');

      expect(result.length).toBe(0);
    });
  });

  describe('getObjectSize', () => {
    it('returns the HeadObjectCommand ContentLength', async () => {
      mockSend.mockResolvedValue({ ContentLength: 12345 });
      const s3 = makeService();

      const size = await s3.getObjectSize('key.jpg');

      expect(size).toBe(12345);
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect(command.input).toEqual({ Bucket: 'test-bucket', Key: 'key.jpg' });
    });

    it('returns 0 (not undefined) when ContentLength is missing', async () => {
      mockSend.mockResolvedValue({});
      const s3 = makeService();

      const size = await s3.getObjectSize('key.jpg');

      expect(size).toBe(0);
    });
  });

  describe('deleteObject', () => {
    it('sends a DeleteObjectCommand with the right key', async () => {
      mockSend.mockResolvedValue({});
      const s3 = makeService();

      await s3.deleteObject('some/key.jpg');

      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'some/key.jpg',
      });
    });
  });

  describe('promoteUpload', () => {
    it('copies from the pending key (URL-encoded CopySource) to the permanent key, then deletes the pending key, in that order', async () => {
      mockSend.mockResolvedValue({});
      const s3 = makeService();

      await s3.promoteUpload('pending/tickets/a b.jpg', 'tickets/t1/a b.jpg');

      expect(mockSend).toHaveBeenCalledTimes(2);

      const copyCommand = mockSend.mock.calls[0][0];
      expect(copyCommand).toBeInstanceOf(CopyObjectCommand);
      expect(copyCommand.input).toEqual({
        Bucket: 'test-bucket',
        CopySource: `test-bucket/${encodeURIComponent('pending/tickets/a b.jpg')}`,
        Key: 'tickets/t1/a b.jpg',
      });

      const deleteCommand = mockSend.mock.calls[1][0];
      expect(deleteCommand).toBeInstanceOf(DeleteObjectCommand);
      expect(deleteCommand.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'pending/tickets/a b.jpg',
      });
    });
  });

  describe('abortMultipartUpload', () => {
    it('never throws even if the underlying S3 call rejects', async () => {
      mockSend.mockRejectedValue(new Error('S3 exploded'));
      const s3 = makeService();

      await expect(
        s3.abortMultipartUpload('key.jpg', 'upload-1'),
      ).resolves.toBeUndefined();

      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(AbortMultipartUploadCommand);
    });
  });

  describe('createMultipartUpload', () => {
    it('returns the UploadId when S3 provides one', async () => {
      mockSend.mockResolvedValue({ UploadId: 'upload-123' });
      const s3 = makeService();

      const uploadId = await s3.createMultipartUpload('key.jpg', 'image/jpeg');

      expect(uploadId).toBe('upload-123');
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(CreateMultipartUploadCommand);
    });

    it('throws a real Error when S3 does not return an UploadId', async () => {
      mockSend.mockResolvedValue({});
      const s3 = makeService();

      await expect(
        s3.createMultipartUpload('key.jpg', 'image/jpeg'),
      ).rejects.toThrow('S3 did not return an UploadId');
    });
  });

  describe('completeMultipartUpload', () => {
    it('sorts parts by partNumber ascending before sending, even if passed out of order', async () => {
      mockSend.mockResolvedValue({});
      const s3 = makeService();

      await s3.completeMultipartUpload('key.jpg', 'upload-1', [
        { partNumber: 3, eTag: 'etag-3' },
        { partNumber: 1, eTag: 'etag-1' },
        { partNumber: 2, eTag: 'etag-2' },
      ]);

      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(CompleteMultipartUploadCommand);
      expect(command.input.MultipartUpload.Parts).toEqual([
        { PartNumber: 1, ETag: 'etag-1' },
        { PartNumber: 2, ETag: 'etag-2' },
        { PartNumber: 3, ETag: 'etag-3' },
      ]);
    });
  });
});
