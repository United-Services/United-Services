import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface MultipartPart {
  partNumber: number;
  eTag: string;
}

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

  // Actual uploaded size — a presigned PUT URL doesn't cap request size on
  // its own, so a client-declared size check alone isn't enough for a
  // public/unauthenticated endpoint; this is the real, post-upload check.
  async getObjectSize(key: string): Promise<number> {
    const { ContentLength } = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return ContentLength ?? 0;
  }

  // Used to remove an object that failed post-upload validation (e.g. its
  // content doesn't match the declared type) so it never lingers in the
  // bucket referenced by nothing.
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  // Moves a validated upload from its presigned-writable "pending" key to
  // its permanent key, then deletes the pending object. Presigned PUT
  // URLs are reusable until they expire (not single-use), so a content
  // check performed once at confirm time is meaningless unless the
  // key it validated can no longer be overwritten afterward — this closes
  // that window by ensuring nothing ever trusts/references the pending
  // key again once it's been promoted.
  async promoteUpload(pendingKey: string, permanentKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(pendingKey)}`,
        Key: permanentKey,
      }),
    );
    await this.deleteObject(pendingKey);
  }

  // --- Multipart upload: lets the browser upload a large file in chunks
  // (~5-8MB parts) instead of one atomic PUT. Each part is presigned
  // individually, so if the connection drops mid-upload the client only
  // needs to re-request presigned URLs for the parts it hasn't completed
  // yet and resume from there, instead of restarting the whole file.

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!UploadId) throw new Error('S3 did not return an UploadId');
    return UploadId;
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds = 300,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MultipartPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client
      .send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      )
      .catch(() => undefined);
  }
}
