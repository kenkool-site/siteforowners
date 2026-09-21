export interface StorageProvider {
  createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number, contentLength?: number): Promise<string>;
  getSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
}

export class R2StorageProvider implements StorageProvider {
  private readonly client: import("@aws-sdk/client-s3").S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = requireEnv("R2_ACCOUNT_ID");
    this.bucket = requireEnv("R2_BUCKET_MEMORIES");
    const { S3Client } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number, contentLength?: number): Promise<string> {
    const { PutObjectCommand } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner") as typeof import("@aws-sdk/s3-request-presigner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commandInput: any = { Bucket: this.bucket, Key: objectKey, ContentType: contentType };
    if (contentLength !== undefined) {
      commandInput.ContentLength = contentLength;
    }
    const command = new PutObjectCommand(commandInput);
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    const { GetObjectCommand } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner") as typeof import("@aws-sdk/s3-request-presigner");
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(objectKey: string): Promise<void> {
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
