// src/lib/invitations/memories/gallery.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeGalleryVisible, toPublicMemoryMedia } from "./gallery";
import type { MemoryMedia } from "./types";

function baseMedia(overrides: Partial<MemoryMedia>): MemoryMedia {
  return {
    id: "media-1",
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderSessionId: "00000000-0000-4000-8000-000000000001",
    uploaderDisplayName: null,
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: "originals/event-1/media-1.jpg",
    objectKeyDisplay: "display/event-1/media-1.webp",
    objectKeyThumbnail: "thumbnails/event-1/media-1.webp",
    capturedAt: null,
    uploadedAt: "2026-09-21T00:00:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "approved",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  };
}

test("uploaded, processed, and approved media is gallery-visible", () => {
  assert.equal(computeGalleryVisible(baseMedia({})), true);
});

test("media awaiting host review is never gallery-visible", () => {
  assert.equal(computeGalleryVisible(baseMedia({ moderationStatus: "awaiting_host_review" })), false);
});

test("flagged media is never gallery-visible, even if processing finished", () => {
  assert.equal(computeGalleryVisible(baseMedia({ moderationStatus: "flagged" })), false);
});

test("media still processing is never gallery-visible regardless of moderation outcome", () => {
  assert.equal(computeGalleryVisible(baseMedia({ processingStatus: "processing", moderationStatus: "approved" })), false);
});

test("public gallery projection excludes original keys, RSVP ids, and moderation details", () => {
  const projected = toPublicMemoryMedia(baseMedia({ uploaderRsvpId: "rsvp-private", moderationCategories: ["private"] }));
  assert.deepEqual(projected, {
    id: "media-1",
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: "display/event-1/media-1.webp",
    objectKeyThumbnail: "thumbnails/event-1/media-1.webp",
    capturedAt: null,
    uploadedAt: "2026-09-21T00:00:00Z",
    momentId: null,
  });
});

test("public gallery projection carries a moment override when one is passed", () => {
  const projected = toPublicMemoryMedia(baseMedia({}), "moment-1");
  assert.equal(projected.momentId, "moment-1");
});
