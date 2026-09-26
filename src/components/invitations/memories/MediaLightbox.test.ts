import assert from "node:assert/strict";
import test from "node:test";
import { formatCapturedAt, resolveNearbyTap, resolveSwipeNavigation } from "./MediaLightbox";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";

// resolveSwipeNavigation is pure and DOM-free by design specifically so it
// can be tested directly — jsdom has no Touch or PointerEvent constructors,
// so simulating a real swipe gesture end-to-end isn't possible in this test
// environment. See MediaLightbox.tsx's own comment on this function.

test("a small drag below the threshold does not navigate", () => {
  assert.equal(resolveSwipeNavigation(10, 1, 5), null);
  assert.equal(resolveSwipeNavigation(-10, 1, 5), null);
  assert.equal(resolveSwipeNavigation(0, 1, 5), null);
});

test("a leftward swipe past the threshold advances to the next photo", () => {
  assert.equal(resolveSwipeNavigation(-60, 1, 5), 2);
});

test("a rightward swipe past the threshold goes back to the previous photo", () => {
  assert.equal(resolveSwipeNavigation(60, 2, 5), 1);
});

test("swiping left on the last photo does not navigate past the end", () => {
  assert.equal(resolveSwipeNavigation(-60, 4, 5), null);
});

test("swiping right on the first photo does not navigate before the start", () => {
  assert.equal(resolveSwipeNavigation(60, 0, 5), null);
});

test("navigation is scoped only to the list passed in — a category's own media count, not some other total", () => {
  // A 3-photo category: the 3rd photo (index 2) is already the last item, so
  // swiping left must not advance further, regardless of how many photos
  // exist in the whole gallery or other categories.
  assert.equal(resolveSwipeNavigation(-60, 2, 3), null);
  // The middle photo can still go either way within that same 3-photo scope.
  assert.equal(resolveSwipeNavigation(-60, 1, 3), 2);
  assert.equal(resolveSwipeNavigation(60, 1, 3), 0);
});

test("exactly at the threshold counts as a swipe", () => {
  assert.equal(resolveSwipeNavigation(-50, 0, 5), 1);
  assert.equal(resolveSwipeNavigation(50, 1, 5), 0);
});

function mediaItem(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: `display/${id}.webp`,
    objectKeyThumbnail: `thumb/${id}.webp`,
    capturedAt: "2026-09-24T22:08:00.000Z",
    uploadedAt: "2026-09-24T22:08:00.000Z",
    ...overrides,
  };
}

test("resolveNearbyTap: a tapped id already in the current list resolves to list mode at its index", () => {
  const currentMedia = [mediaItem("a"), mediaItem("b"), mediaItem("c")];
  const result = resolveNearbyTap(currentMedia, "b", [mediaItem("b"), mediaItem("z")]);
  assert.deepEqual(result, { mode: "list", index: 1 });
});

test("resolveNearbyTap: a tapped id outside the current list resolves to detour mode using the supplied cluster", () => {
  const currentMedia = [mediaItem("a"), mediaItem("b")];
  const cluster = [mediaItem("a"), mediaItem("z")];
  const result = resolveNearbyTap(currentMedia, "z", cluster);
  assert.deepEqual(result, { mode: "detour", media: cluster, index: 1 });
});

test("resolveNearbyTap: prefers the current list over the cluster when a tapped id happens to be in both", () => {
  const currentMedia = [mediaItem("a"), mediaItem("b")];
  const cluster = [mediaItem("b"), mediaItem("z")];
  const result = resolveNearbyTap(currentMedia, "b", cluster);
  assert.deepEqual(result, { mode: "list", index: 1 });
});

test("resolveNearbyTap: returns null when the tapped id is in neither the current list nor the cluster", () => {
  const currentMedia = [mediaItem("a")];
  const result = resolveNearbyTap(currentMedia, "ghost", [mediaItem("z")]);
  assert.equal(result, null);
});

// formatCapturedAt uses the environment's own default locale (matching this
// codebase's existing bare toLocaleString()/toLocaleDateString() convention,
// e.g. OwnerMomentsManager.tsx), so these tests compute their expectation the
// same way rather than hardcoding a literal string that would drift with the
// test environment's ICU locale data.
test("formatCapturedAt combines a short date and a short time", () => {
  const iso = "2026-09-24T22:08:00.000Z";
  const date = new Date(iso);
  const expectedDay = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const expectedTime = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  assert.equal(formatCapturedAt(iso), `${expectedDay}, ${expectedTime}`);
});

test("formatCapturedAt reflects a different instant distinctly", () => {
  const morning = formatCapturedAt("2026-01-01T09:05:00.000Z");
  const evening = formatCapturedAt("2026-06-15T20:45:00.000Z");
  assert.notEqual(morning, evening);
});
