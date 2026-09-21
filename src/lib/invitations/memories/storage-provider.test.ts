import assert from "node:assert/strict";
import test from "node:test";
import type { StorageProvider } from "./storage-provider";

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
