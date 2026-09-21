import assert from "node:assert/strict";
import test from "node:test";
import { createMemoriesUploadTicket, verifyMemoriesUploadTicket } from "./upload-tickets";

const secret = "x".repeat(32);

test("a ticket verifies for the exact event and media it was issued for", () => {
  const { ticket, objectKey } = createMemoriesUploadTicket("event-1", "media-1", "photo", secret);
  assert.equal(objectKey, "originals/event-1/media-1.jpg");
  assert.equal(verifyMemoriesUploadTicket(ticket, "event-1", "media-1", secret), true);
});

test("a ticket for one media item is rejected against a different media id", () => {
  const { ticket } = createMemoriesUploadTicket("event-1", "media-1", "photo", secret);
  assert.equal(verifyMemoriesUploadTicket(ticket, "event-1", "media-2", secret), false);
});

test("video tickets use a video-appropriate extension", () => {
  const { objectKey } = createMemoriesUploadTicket("event-1", "media-2", "video", secret);
  assert.equal(objectKey, "originals/event-1/media-2.mp4");
});
