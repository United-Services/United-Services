import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// All service spec files, candidate ID photos, and CVs live in one private
// bucket (block-all-public-access at the bucket level). Nothing here ever
// returns a raw, permanent S3 URL — every read/write goes through a
// short-lived presigned URL. See docs/BUSINESS_RULES.md rule 9.
@Injectable()
export class S3Service {
  private readonly client = new S3Client({ region: process.env.AWS_REGION });
  private readonly bucket = process.env.S3_BUCKET_NAME as string;

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async createDownloadUrl(
    key: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  // Reads only the first `maxBytes` of an object — enough to check a file
  // signature (magic bytes) against its declared content type without
  // pulling the whole object through the app server.
  async readLeadingBytes(key: string, maxBytes = 4096): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: `bytes=0-${maxBytes - 1}`,
    });
    const { Body } = await this.client.send(command);
    if (!Body) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    for await (const chunk of Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // Used to remove an object that failed post-upload validation (e.g. its
  // content doesn't match the declared type) so it never lingers in the
  // bucket referenced by nothing.
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
