// src/lib/invitations/memories/nearby-media.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { findNearbyMatches, getNearbyMedia, NEARBY_MAX_RESULTS, NEARBY_WINDOW_MS } from "./nearby-media";
import type { PublicMemoryMedia } from "./gallery";

const ANCHOR_TIME = "2026-09-24T22:08:00.000Z";

function media(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: `display/${id}.webp`,
    objectKeyThumbnail: `thumb/${id}.webp`,
    capturedAt: ANCHOR_TIME,
    uploadedAt: ANCHOR_TIME,
    ...overrides,
  };
}

test("NEARBY_WINDOW_MS is 3 minutes", () => {
  assert.equal(NEARBY_WINDOW_MS, 3 * 60 * 1000);
});

test("NEARBY_MAX_RESULTS is 12", () => {
  assert.equal(NEARBY_MAX_RESULTS, 12);
});

test("includes a candidate captured before the target, within the window", () => {
  const target = media("anchor");
  const before = media("before", { capturedAt: "2026-09-24T22:06:00.000Z" });
  const result = findNearbyMatches(target, [before], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["before"]);
});

test("includes a candidate captured after the target, within the window", () => {
  const target = media("anchor");
  const after = media("after", { capturedAt: "2026-09-24T22:10:00.000Z" });
  const result = findNearbyMatches(target, [after], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["after"]);
});

test("includes a candidate exactly at the window boundary", () => {
  const target = media("anchor");
  const boundary = media("boundary", { capturedAt: "2026-09-24T22:11:00.000Z" });
  const result = findNearbyMatches(target, [boundary], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["boundary"]);
});

test("excludes a candidate just past the window boundary", () => {
  const target = media("anchor");
  const tooFar = media("too-far", { capturedAt: "2026-09-24T22:11:00.001Z" });
  const result = findNearbyMatches(target, [tooFar], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("excludes the target itself even though its own delta is zero", () => {
  const target = media("anchor");
  const result = findNearbyMatches(target, [target], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("excludes a candidate with no capturedAt", () => {
  const target = media("anchor");
  const noTimestamp = media("no-ts", { capturedAt: null });
  const result = findNearbyMatches(target, [noTimestamp], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("returns nothing when the target itself has no capturedAt", () => {
  const target = media("anchor", { capturedAt: null });
  const other = media("other");
  const result = findNearbyMatches(target, [other], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("sorts multiple matches nearest-first, regardless of input order", () => {
  const target = media("anchor");
  const far = media("far", { capturedAt: "2026-09-24T22:10:30.000Z" });
  const near = media("near", { capturedAt: "2026-09-24T22:08:10.000Z" });
  const result = findNearbyMatches(target, [far, near], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["near", "far"]);
});

test("returns an empty array when there are no candidates", () => {
  const target = media("anchor");
  assert.deepEqual(findNearbyMatches(target, [], NEARBY_WINDOW_MS), []);
});

// createAdminClient() has no injection seam and this test environment has no
// live Supabase credentials wired up (see repository.test.ts's own header
// comment and repository-missing-descriptors-rpc.integration.test.ts) — every
// test in this module touching a createAdminClient()-backed function asserts
// on its source instead of invoking it, matching that established convention.
test("getNearbyMedia looks up the anchor, gates on gallery-visibility and the memoriesEnabled setting, queries a captured_at-bounded window, and matches/caps against that pool", () => {
  const source = getNearbyMedia.toString();
  assert.match(source, /getMemoryMediaById/);
  assert.match(source, /computeGalleryVisible/);
  // Gated on the host's memoriesEnabled setting, the same way every other
  // listing endpoint in this codebase is (see gallery/route.ts) — a host who
  // switched Memories off must not leave this lookup enumerable.
  assert.match(source, /getEventMemoriesSettings/);
  assert.match(source, /memoriesEnabled/);
  // Queries memory_media directly with a captured_at window (indexed by
  // memory_media_event_captured_idx) instead of a full-event
  // listGalleryVisibleMedia scan filtered in JS.
  assert.match(source, /captured_at/);
  assert.match(source, /\.gte\(/);
  assert.match(source, /\.lte\(/);
  assert.match(source, /findNearbyMatches/);
  // Caps the result set nearest-first after matching, so a busy moment can't
  // render an unbounded strip/detour cluster.
  assert.match(source, /NEARBY_MAX_RESULTS/);
  assert.match(source, /\.slice\(/);
});
