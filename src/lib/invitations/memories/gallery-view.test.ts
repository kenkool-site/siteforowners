import assert from "node:assert/strict";
import test from "node:test";
import { groupMediaByTime, momentForMedia } from "./gallery-view";
import type { PublicMemoryMedia } from "./gallery";

const item: PublicMemoryMedia = {
  id: "media-1", mediaKind: "photo", uploaderDisplayName: "Jamie",
  objectKeyDisplay: "display.webp", objectKeyThumbnail: "thumb.webp",
  capturedAt: "2026-09-22T20:00:00Z", uploadedAt: "2026-09-22T20:01:00Z",
};

test("gallery groups recent evening, afternoon, and earlier media", () => {
  const grouped = groupMediaByTime([
    item,
    { ...item, id: "afternoon", capturedAt: "2026-09-22T11:00:00Z" },
    { ...item, id: "earlier", capturedAt: "2026-09-20T20:00:00Z" },
  ], new Date("2026-09-22T22:00:00Z"));
  assert.deepEqual(grouped.tonight.map((row) => row.id), ["media-1"]);
  assert.deepEqual(grouped.thisAfternoon.map((row) => row.id), ["afternoon"]);
  assert.deepEqual(grouped.earlier.map((row) => row.id), ["earlier"]);
});

test("moment membership uses the first matching sort order", () => {
  const found = momentForMedia(item, [
    { id: "later-sort", name: "Later", startsAt: "2026-09-22T19:00:00Z", endsAt: "2026-09-22T21:00:00Z", sortOrder: 2 },
    { id: "first-sort", name: "First", startsAt: "2026-09-22T19:00:00Z", endsAt: "2026-09-22T21:00:00Z", sortOrder: 1 },
  ]);
  assert.equal(found?.id, "first-sort");
});
