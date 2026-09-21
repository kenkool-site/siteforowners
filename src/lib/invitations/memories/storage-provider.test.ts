import assert from "node:assert/strict";
import test from "node:test";
import type { StorageProvider } from "./storage-provider";

class FakeStorageProvider implements StorageProvider {
  public readonly uploadUrls: string[] = [];
  async createPresignedUploadUrl(objectKey: string): Promise<string> {
    const url = `https://fake.r2/${objectKey}`;
    this.uploadUrls.push(url);
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
