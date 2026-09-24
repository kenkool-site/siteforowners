import assert from "node:assert/strict";
import test from "node:test";
import { groupMediaByTime, momentForMedia } from "./gallery-view";
import type { PublicMemoryMedia } from "./gallery";

const item: PublicMemoryMedia = {
  id: "media-1", mediaKind: "photo", uploaderDisplayName: "Jamie",
  objectKeyDisplay: "display.webp", objectKeyThumbnail: "thumb.webp",
  capturedAt: "2026-09-22T20:00:00Z", uploadedAt: "2026-09-22T20:01:00Z",
  momentId: null,
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

test("a photo taken before every defined moment falls back to the nearest one", () => {
  const early = { ...item, capturedAt: "2026-09-22T17:00:00Z" };
  const found = momentForMedia(early, [
    { id: "ceremony", name: "Ceremony", startsAt: "2026-09-22T18:00:00Z", endsAt: "2026-09-22T19:00:00Z", sortOrder: 1 },
    { id: "reception", name: "Reception", startsAt: "2026-09-22T19:00:00Z", endsAt: "2026-09-22T23:00:00Z", sortOrder: 2 },
  ]);
  assert.equal(found?.id, "ceremony");
});

test("a photo taken after every defined moment falls back to the nearest one", () => {
  const late = { ...item, capturedAt: "2026-09-23T01:00:00Z" };
  const found = momentForMedia(late, [
    { id: "ceremony", name: "Ceremony", startsAt: "2026-09-22T18:00:00Z", endsAt: "2026-09-22T19:00:00Z", sortOrder: 1 },
    { id: "reception", name: "Reception", startsAt: "2026-09-22T19:00:00Z", endsAt: "2026-09-22T23:00:00Z", sortOrder: 2 },
  ]);
  assert.equal(found?.id, "reception");
});

test("a photo taken in a gap between two moments (the first ran long) falls back to the nearer one", () => {
  // Ceremony scheduled to end 19:00 but really ran until ~19:20; Reception doesn't
  // start until 19:30. A photo at 19:10 is closer to Ceremony's end (10 min) than
  // to Reception's start (20 min).
  const duringOverrun = { ...item, capturedAt: "2026-09-22T19:10:00Z" };
  const found = momentForMedia(duringOverrun, [
    { id: "ceremony", name: "Ceremony", startsAt: "2026-09-22T18:00:00Z", endsAt: "2026-09-22T19:00:00Z", sortOrder: 1 },
    { id: "reception", name: "Reception", startsAt: "2026-09-22T19:30:00Z", endsAt: "2026-09-22T23:00:00Z", sortOrder: 2 },
  ]);
  assert.equal(found?.id, "ceremony");
});

test("a tie between two equidistant moments keeps the earlier sortOrder", () => {
  // Exactly halfway between Ceremony's end (19:00) and Reception's start (19:20).
  const midpoint = { ...item, capturedAt: "2026-09-22T19:10:00Z" };
  const found = momentForMedia(midpoint, [
    { id: "ceremony", name: "Ceremony", startsAt: "2026-09-22T18:00:00Z", endsAt: "2026-09-22T19:00:00Z", sortOrder: 1 },
    { id: "reception", name: "Reception", startsAt: "2026-09-22T19:20:00Z", endsAt: "2026-09-22T23:00:00Z", sortOrder: 2 },
  ]);
  assert.equal(found?.id, "ceremony");
});

test("no moments defined yet returns null, not a crash", () => {
  assert.equal(momentForMedia(item, []), null);
});

test("momentForMedia ignores an AI override entirely — the Moments tab is time-only", () => {
  // item's capturedAt (20:00) falls inside "on-time"; momentId points elsewhere,
  // but the regular Moments tab must never disagree with the host's own schedule.
  const classified = { ...item, momentId: "content-matched" };
  const found = momentForMedia(classified, [
    { id: "on-time", name: "On Time", startsAt: "2026-09-22T19:00:00Z", endsAt: "2026-09-22T21:00:00Z", sortOrder: 1 },
    { id: "content-matched", name: "Content Matched", startsAt: "2026-09-23T00:00:00Z", endsAt: "2026-09-23T01:00:00Z", sortOrder: 2 },
  ]);
  assert.equal(found?.id, "on-time");
});
