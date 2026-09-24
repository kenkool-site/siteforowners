import assert from "node:assert/strict";
import test from "node:test";
import { resolveSwipeNavigation } from "./MediaLightbox";

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
