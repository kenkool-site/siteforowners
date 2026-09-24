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
