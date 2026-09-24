import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("gallery route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});

// Structural, matching moderate-route.test.ts's own separation check: the
// public gallery route still returns media and Moments for timestamp
// grouping, but must no longer load the old Moment-override table or the
// classifier it fed. That system is fully superseded by the independent AI
// Highlight tab (GuestAiHighlightView / /api/memories/events/[eventId]/highlights).
test("gallery route still serves media and Moments but no longer loads Moment overrides", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /listGalleryVisibleMedia\(/);
  assert.match(source, /listMemoryMoments\(/);

  assert.doesNotMatch(source, /listMomentOverridesForEvent/);
  assert.doesNotMatch(source, /moment-classification/);
});
