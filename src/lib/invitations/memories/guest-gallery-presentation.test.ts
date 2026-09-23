import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleOptimisticUploads, type GuestUploadPreview } from "./guest-gallery-presentation";

function upload(overrides: Partial<GuestUploadPreview> = {}): GuestUploadPreview {
  return {
    id: "upload-1",
    fileName: "photo.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1000,
    status: "uploading",
    progress: 50,
    previewUrl: "blob:photo",
    ...overrides,
  };
}

test("publishing previews disappear when the server gallery contains the uploaded media", () => {
  const items = [upload({ status: "done", progress: 100, mediaId: "media-1", completedAt: 1_000 })];
  assert.equal(visibleOptimisticUploads(items, new Set(), 2_000).length, 1);
  assert.equal(visibleOptimisticUploads(items, new Set(["media-1"]), 2_000).length, 0);
});

test("stale completed previews and failed uploads do not remain in the gallery", () => {
  const items = [
    upload({ id: "old", status: "done", mediaId: "media-old", completedAt: 1_000 }),
    upload({ id: "failed", status: "failed", error: "generic" }),
  ];
  assert.deepEqual(visibleOptimisticUploads(items, new Set(), 32_001), []);
});
