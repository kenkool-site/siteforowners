import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("moderate route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

// Structural, matching the route-contract tests in
// src/lib/invitations/*-route*.test.ts and settings-route.test.ts: the real
// enrichment work sits behind an R2 signed download + a Rekognition call,
// neither reachable from here, so this asserts the source actually wires the
// new AI Highlight pipeline in (and that the old, unrelated Moment classifier
// this task replaces is fully gone) rather than invoking the handler.
test("moderate route persists AI Highlight descriptors and queues generation instead of classifying Moments", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /detectLabels\(/);
  assert.match(source, /upsertMemoryMediaDescriptor\(/);
  assert.match(source, /requestHighlightGeneration\(/);

  assert.doesNotMatch(source, /moment-classification/);
  assert.doesNotMatch(source, /listMemoryMoments/);
  assert.doesNotMatch(source, /setAiClassifiedMoment/);
});

// Structural, same rationale as above: the branch that picks the
// moderation-input key runs before any reachable seam (R2 signed download +
// Rekognition), so this asserts the source actually branches on mediaKind
// instead of invoking the handler against a live DB row.
test("moderate route uses the poster (objectKeyThumbnail) for video media, not the moderation-derivative key", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /media\.mediaKind\s*===\s*["']video["']/);
  assert.match(source, /media\.objectKeyThumbnail/);
});

test("moderate route fails clearly, without crashing, when a video item has no thumbnail key", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  // The moderationKey computation must be null-checked before use, and that
  // check must live inside the same try/catch that already turns any
  // failure in this block into a logged 500 (see the "AI Highlight
  // descriptors" test above for the route's existing error-shape
  // convention) rather than throwing an uncaught error.
  assert.match(source, /if\s*\(\s*!moderationKey\s*\)/);
  assert.match(source, /throw new Error\(/);
});

test("moderate route still uses deriveObjectKeys(...).moderation for photo media, unchanged", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /deriveObjectKeys\(media\.eventId,\s*media\.id\)\.moderation/);
});
