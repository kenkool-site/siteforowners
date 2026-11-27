import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// signingDate makes the link the same for everyone signed at that moment.
export type SignedDownloadOptions = { signingDate?: Date };

export interface StorageProvider {
  createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number, contentLength?: number): Promise<string>;
  getSignedDownloadUrl(objectKey: string, expiresInSeconds: number, options?: SignedDownloadOptions): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
  objectExists(objectKey: string): Promise<boolean>;
  // Optional: only R2StorageProvider's real callers (upload/complete's video
  // poster-size check, and guests-of-honor reference storage) need these, so
  // existing test fakes that implement StorageProvider don't all need updating.
  getObjectSizeBytes?(objectKey: string): Promise<number | null>;
  putObject?(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(client?: S3Client, bucket?: string) {
    this.bucket = bucket ?? requireEnv("R2_BUCKET_MEMORIES");
    if (client) {
      this.client = client;
    } else {
      const accountId = requireEnv("R2_ACCOUNT_ID");
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
          secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
        },
      });
    }
  }

  async createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number, contentLength?: number): Promise<string> {
    const commandInput: ConstructorParameters<typeof PutObjectCommand>[0] = { Bucket: this.bucket, Key: objectKey, ContentType: contentType };
    if (contentLength !== undefined) {
      commandInput.ContentLength = contentLength;
    }
    const command = new PutObjectCommand(commandInput);
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getSignedDownloadUrl(objectKey: string, expiresInSeconds: number, options: SignedDownloadOptions = {}): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds, signingDate: options.signingDate });
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }

  async putObject(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: contentType,
    }));
  }

  // Big videos upload in pieces: each piece has its own signed PUT link, so a
  // dropped signal only resends that piece. The pieces' ETags are read back
  // here when the upload finishes, so the bucket's CORS rules don't need to
  // expose the ETag header to the guest's browser.
  async createMultipartUpload(objectKey: string, contentType: string): Promise<string> {
    const response = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType }));
    if (!response.UploadId) throw new Error("R2 returned no multipart upload id");
    return response.UploadId;
  }

  async createPresignedPartUrls(objectKey: string, uploadId: string, partCount: number, expiresInSeconds: number): Promise<string[]> {
    const urls: string[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const command = new UploadPartCommand({ Bucket: this.bucket, Key: objectKey, UploadId: uploadId, PartNumber: partNumber });
      urls.push(await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds }));
    }
    return urls;
  }

  async completeMultipartUpload(objectKey: string, uploadId: string, expectedParts: number): Promise<boolean> {
    const parts: { PartNumber: number; ETag: string }[] = [];
    let marker: string | undefined;
    do {
      const listed = await this.client.send(new ListPartsCommand({ Bucket: this.bucket, Key: objectKey, UploadId: uploadId, PartNumberMarker: marker }));
      for (const part of listed.Parts ?? []) {
        if (part.PartNumber && part.ETag) parts.push({ PartNumber: part.PartNumber, ETag: part.ETag });
      }
      marker = listed.IsTruncated ? listed.NextPartNumberMarker : undefined;
    } while (marker);
    parts.sort((a, b) => a.PartNumber - b.PartNumber);
    if (parts.length !== expectedParts || parts.some((part, index) => part.PartNumber !== index + 1)) return false;
    await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: objectKey, UploadId: uploadId, MultipartUpload: { Parts: parts } }));
    return true;
  }

  async getObjectSizeBytes(objectKey: string): Promise<number | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return response.ContentLength ?? null;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
