import assert from "node:assert/strict";
import test from "node:test";
import type { S3Client } from "@aws-sdk/client-s3";
import type { StorageProvider } from "./storage-provider";
import { R2StorageProvider } from "./storage-provider";

class FakeStorageProvider implements StorageProvider {
  public readonly uploadUrls: string[] = [];
  public readonly uploadContentLengths: (number | undefined)[] = [];
  async createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number, contentLength?: number): Promise<string> {
    const url = `https://fake.r2/${objectKey}`;
    this.uploadUrls.push(url);
    this.uploadContentLengths.push(contentLength);
    return url;
  }
  async getSignedDownloadUrl(objectKey: string): Promise<string> {
    return `https://fake.r2/${objectKey}?signed=1`;
  }
  async deleteObject(): Promise<void> {}
  async objectExists(): Promise<boolean> {
    return true;
  }
}

test("a fake StorageProvider satisfies the interface consumers rely on", async () => {
  const provider: StorageProvider = new FakeStorageProvider();
  const url = await provider.createPresignedUploadUrl("originals/event-1/media-1.jpg", "image/jpeg", 900);
  assert.match(url, /media-1\.jpg/);
});

test("createPresignedUploadUrl accepts and records contentLength parameter", async () => {
  const provider = new FakeStorageProvider();
  const url = await provider.createPresignedUploadUrl("originals/event-1/media-1.jpg", "image/jpeg", 900, 5242880);
  assert.match(url, /media-1\.jpg/);
  assert.equal(provider.uploadContentLengths.length, 1);
  assert.equal(provider.uploadContentLengths[0], 5242880);
});

test("createPresignedUploadUrl defaults contentLength to undefined when not provided", async () => {
  const provider = new FakeStorageProvider();
  const url = await provider.createPresignedUploadUrl("originals/event-1/media-2.jpg", "image/jpeg", 900);
  assert.match(url, /media-2\.jpg/);
  assert.equal(provider.uploadContentLengths.length, 1);
  assert.equal(provider.uploadContentLengths[0], undefined);
});

test("objectExists returns true when HeadObjectCommand succeeds", async () => {
  const mockClient = {
    send: async () => {
      return {};
    },
  } as unknown as S3Client;

  const provider = new R2StorageProvider(mockClient, "test-bucket");
  const exists = await provider.objectExists("originals/event-1/media-1-poster.jpg");
  assert.equal(exists, true);
});

test("objectExists returns false when the object is missing (404)", async () => {
  const mockClient = {
    send: async () => {
      const error = new Error("Not Found") as { $metadata?: { httpStatusCode?: number } };
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    },
  } as unknown as S3Client;

  const provider = new R2StorageProvider(mockClient, "test-bucket");
  const exists = await provider.objectExists("originals/event-1/media-1-poster.jpg");
  assert.equal(exists, false);
});

test("objectExists rethrows a non-404 error", async () => {
  const mockClient = {
    send: async () => {
      const error = new Error("Server Error") as { $metadata?: { httpStatusCode?: number } };
      error.$metadata = { httpStatusCode: 500 };
      throw error;
    },
  } as unknown as S3Client;

  const provider = new R2StorageProvider(mockClient, "test-bucket");
  await assert.rejects(() => provider.objectExists("originals/event-1/media-1-poster.jpg"));
});

// getObjectSizeBytes backs upload/complete's post-hoc poster size cap — added
// after a fixed contentLength signed into the poster's presigned PUT URL
// broke every real poster upload with a signature mismatch (its real size
// isn't known until after that URL is issued). See upload/init and
// upload/complete's own comments for the full story.
test("getObjectSizeBytes returns the object's real ContentLength when HeadObjectCommand succeeds", async () => {
  const mockClient = {
    send: async () => ({ ContentLength: 123456 }),
  } as unknown as S3Client;

  const provider = new R2StorageProvider(mockClient, "test-bucket");
  const size = await provider.getObjectSizeBytes("posters/event-1/media-1.jpg");
  assert.equal(size, 123456);
});

test("getObjectSizeBytes returns null when the object is missing (404)", async () => {
  const mockClient = {
    send: async () => {
      const error = new Error("Not Found") as { $metadata?: { httpStatusCode?: number } };
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    },
  } as unknown as S3Client;

  const provider = new R2StorageProvider(mockClient, "test-bucket");
  const size = await provider.getObjectSizeBytes("posters/event-1/media-1.jpg");
  assert.equal(size, null);
});

test("getObjectSizeBytes rethrows a non-404 error", async () => {
  const mockClient = {
    send: async () => {
      const error = new Error("Server Error") as { $metadata?: { httpStatusCode?: number } };
      error.$metadata = { httpStatusCode: 500 };
      throw error;
    },
  } as unknown as S3Client;

  const provider = new R2StorageProvider(mockClient, "test-bucket");
  await assert.rejects(() => provider.getObjectSizeBytes("posters/event-1/media-1.jpg"));
});
