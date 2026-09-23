import assert from "node:assert/strict";
import test from "node:test";
import { allowedModerationStatuses, buildMemoriesEventSummary, moderationStatusForFilter } from "./host";
import type { MemoryMedia } from "./types";

function media(overrides: Partial<MemoryMedia>): MemoryMedia {
  return {
    id: "media-1", eventId: "event-1", uploaderRsvpId: null, uploaderSessionId: "session-1",
    uploaderDisplayName: null, guestSessionLevel: "anonymous", mediaKind: "photo",
    objectKeyOriginal: "original.jpg", objectKeyDisplay: "display.webp", objectKeyThumbnail: "thumb.webp",
    capturedAt: null, uploadedAt: "2026-09-21T12:00:00Z", uploadStatus: "uploaded",
    processingStatus: "ready", moderationStatus: "approved", aiStatus: "not_started",
    moderationScore: null, moderationCategories: null, ...overrides,
  };
}

test("host summary counts a contributor once and orders recent thumbnails newest first", () => {
  const summary = buildMemoriesEventSummary([
    media({ id: "older", uploadedAt: "2026-09-21T10:00:00Z" }),
    media({ id: "newer", uploadedAt: "2026-09-21T14:00:00Z" }),
    media({ id: "rsvp", uploaderSessionId: "session-2", uploaderRsvpId: "rsvp-1", mediaKind: "video" }),
    media({ id: "flagged", moderationStatus: "flagged", uploaderSessionId: "session-3" }),
  ]);
  assert.deepEqual(summary, {
    photoCount: 2,
    videoCount: 1,
    guestContributorCount: 2,
    flaggedCount: 1,
    recentThumbnailMediaIds: ["newer", "rsvp", "older"],
  });
});

test("host summary still deduplicates named contributors uploaded before session tracking", () => {
  const summary = buildMemoriesEventSummary([
    media({ id: "legacy-1", uploaderSessionId: null, uploaderDisplayName: "  Oyin  " }),
    media({ id: "legacy-2", uploaderSessionId: null, uploaderDisplayName: "oyin" }),
    media({ id: "unknown", uploaderSessionId: null, uploaderDisplayName: null }),
  ]);

  assert.equal(summary.guestContributorCount, 1);
});

test("host approval can never promote media that has not cleared automated moderation", () => {
  assert.deepEqual(allowedModerationStatuses("approve"), ["flagged", "awaiting_host_review"]);
  assert.equal(allowedModerationStatuses("approve").includes("pending"), false);
  assert.deepEqual(allowedModerationStatuses("remove"), ["approved"]);
});

test("host review filters map live to approved and pending to awaiting review", () => {
  assert.equal(moderationStatusForFilter("live"), "approved");
  assert.equal(moderationStatusForFilter("pending"), "awaiting_host_review");
  assert.equal(moderationStatusForFilter("flagged"), "flagged");
});
