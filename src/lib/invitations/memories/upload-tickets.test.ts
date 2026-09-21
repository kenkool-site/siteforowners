import assert from "node:assert/strict";
import test from "node:test";
import { createMemoriesUploadTicket, verifyMemoriesUploadTicket } from "./upload-tickets";

const secret = "x".repeat(32);

test("a ticket verifies for the exact event and media it was issued for", () => {
  const { ticket, objectKey } = createMemoriesUploadTicket("event-1", "media-1", "photo", "image/jpeg", secret);
  assert.equal(objectKey, "originals/event-1/media-1.jpg");
  assert.equal(verifyMemoriesUploadTicket(ticket, "event-1", "media-1", secret), true);
});

test("a ticket for one media item is rejected against a different media id", () => {
  const { ticket } = createMemoriesUploadTicket("event-1", "media-1", "photo", "image/jpeg", secret);
  assert.equal(verifyMemoriesUploadTicket(ticket, "event-1", "media-2", secret), false);
});

test("video tickets use a video-appropriate extension", () => {
  const { objectKey } = createMemoriesUploadTicket("event-1", "media-2", "video", undefined, secret);
  assert.equal(objectKey, "originals/event-1/media-2.mp4");
});

test("the object key extension follows the guest's declared content type, not a hardcoded jpg", () => {
  // The Worker dispatches on this extension, so a HEIC uploaded under a .jpg key
  // is what previously dead-lettered silently.
  for (const [contentType, expected] of [
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/heic", "heic"],
    ["video/quicktime", "mov"],
  ] as const) {
    const { objectKey } = createMemoriesUploadTicket("event-1", "media-3", "photo", contentType, secret);
    assert.equal(objectKey, `originals/event-1/media-3.${expected}`, contentType);
  }
});

test("content type parameters and casing do not defeat extension detection", () => {
  const { objectKey } = createMemoriesUploadTicket("event-1", "media-4", "photo", "IMAGE/PNG; charset=binary", secret);
  assert.equal(objectKey, "originals/event-1/media-4.png");
});

test("an unknown content type falls back to the media kind's default extension", () => {
  const photo = createMemoriesUploadTicket("event-1", "media-5", "photo", "application/octet-stream", secret);
  assert.equal(photo.objectKey, "originals/event-1/media-5.jpg");
  const video = createMemoriesUploadTicket("event-1", "media-6", "video", "application/octet-stream", secret);
  assert.equal(video.objectKey, "originals/event-1/media-6.mp4");
});
