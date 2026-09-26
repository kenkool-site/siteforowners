// src/lib/invitations/memories/highlight-classifier.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFallbackHighlights,
  classifyIntoHostGroups,
  shouldQueueHighlightGeneration,
} from "./highlight-classifier";
import type { MemoryHighlightGroup, MemoryMediaDescriptor } from "./highlight-types";

function descriptor(overrides: Partial<MemoryMediaDescriptor> & { mediaId: string }): MemoryMediaDescriptor {
  return {
    mediaKind: "photo",
    labels: [],
    ...overrides,
  };
}

function hostGroup(overrides: Partial<MemoryHighlightGroup> & { id: string }): MemoryHighlightGroup {
  return {
    eventId: "event-1",
    name: "Untitled",
    description: null,
    semanticKey: "untitled",
    source: "host_defined",
    sortOrder: 0,
    isVisible: true,
    ...overrides,
  };
}

test("one descriptor can belong to multiple fallback groups", () => {
  const groups = classifyFallbackHighlights([
    descriptor({
      mediaId: "m1",
      labels: [
        { name: "Cake", confidence: 0.98 },
        { name: "Food", confidence: 0.91 },
      ],
    }),
  ]);
  assert.deepEqual(groups.map((group) => group.semanticKey).sort(), ["cake", "food-drinks"]);
  assert.deepEqual(groups.flatMap((group) => group.mediaIds), ["m1", "m1"]);
});

test("a dance-floor photo classifies into the dancing group", () => {
  const groups = classifyFallbackHighlights([
    descriptor({ mediaId: "m2", labels: [{ name: "Dance Floor", confidence: 0.75 }] }),
  ]);
  assert.deepEqual(
    groups.map((group) => group.semanticKey),
    ["dancing"],
  );
  assert.deepEqual(groups[0].mediaIds, ["m2"]);
});

test("a label below the confidence threshold is ignored", () => {
  const groups = classifyFallbackHighlights([
    descriptor({ mediaId: "m3", labels: [{ name: "Cake", confidence: 0.59 }] }),
  ]);
  assert.deepEqual(groups, []);
});

test("a label at exactly the confidence threshold still counts", () => {
  const groups = classifyFallbackHighlights([
    descriptor({ mediaId: "m3b", labels: [{ name: "Cake", confidence: 0.6 }] }),
  ]);
  assert.deepEqual(groups.map((group) => group.semanticKey), ["cake"]);
});

test("labels that match no category produce no groups", () => {
  const groups = classifyFallbackHighlights([
    descriptor({ mediaId: "m4", labels: [{ name: "Sky", confidence: 0.99 }] }),
  ]);
  assert.deepEqual(groups, []);
});

test("label matching is case-insensitive and whitespace-tolerant", () => {
  const groups = classifyFallbackHighlights([
    descriptor({ mediaId: "m5", labels: [{ name: "  CAKE  ", confidence: 0.9 }] }),
  ]);
  assert.deepEqual(groups.map((group) => group.semanticKey), ["cake"]);
});

test("the same media id is not duplicated within a single fallback group", () => {
  const groups = classifyFallbackHighlights([
    descriptor({
      mediaId: "m6",
      labels: [
        { name: "Cake", confidence: 0.9 },
        { name: "Wedding Cake", confidence: 0.9 },
      ],
    }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].mediaIds, ["m6"]);
});

test("multiple descriptors accumulate into the same fallback group without duplication", () => {
  const groups = classifyFallbackHighlights([
    descriptor({ mediaId: "m7", labels: [{ name: "Champagne", confidence: 0.8 }] }),
    descriptor({ mediaId: "m8", labels: [{ name: "Food", confidence: 0.8 }] }),
    descriptor({ mediaId: "m7", labels: [{ name: "Champagne", confidence: 0.8 }] }),
  ]);
  const foodDrinks = groups.find((group) => group.semanticKey === "food-drinks");
  assert.ok(foodDrinks);
  assert.deepEqual(foodDrinks!.mediaIds.sort(), ["m7", "m8"]);
});

test("classifyIntoHostGroups assigns a descriptor whose label exactly matches a host group's name", () => {
  const groups = [hostGroup({ id: "g1", name: "Cake Cutting", semanticKey: "cake-cutting" })];
  const assignments = classifyIntoHostGroups(
    [descriptor({ mediaId: "m9", labels: [{ name: "Cake Cutting", confidence: 0.8 }] })],
    groups,
  );
  assert.deepEqual(assignments, [{ groupId: "g1", mediaId: "m9" }]);
});

test("classifyIntoHostGroups assigns a descriptor whose label exactly matches a word in a host group's description", () => {
  const groups = [
    hostGroup({ id: "g2", name: "Golden Hour", description: "Sunset portraits by the lake", semanticKey: "golden-hour" }),
  ];
  const assignments = classifyIntoHostGroups(
    [descriptor({ mediaId: "m10", labels: [{ name: "Portraits", confidence: 0.7 }] })],
    groups,
  );
  assert.deepEqual(assignments, [{ groupId: "g2", mediaId: "m10" }]);
});

test("classifyIntoHostGroups ignores low-confidence labels and non-matching labels", () => {
  const groups = [hostGroup({ id: "g3", name: "Cake Cutting", semanticKey: "cake-cutting" })];
  const assignments = classifyIntoHostGroups(
    [
      descriptor({ mediaId: "m11", labels: [{ name: "Cake Cutting", confidence: 0.4 }] }),
      descriptor({ mediaId: "m12", labels: [{ name: "Fireworks", confidence: 0.9 }] }),
    ],
    groups,
  );
  assert.deepEqual(assignments, []);
});

test("classifyIntoHostGroups does not duplicate an assignment for repeated matching labels", () => {
  const groups = [hostGroup({ id: "g4", name: "Cake Cutting", semanticKey: "cake-cutting" })];
  const assignments = classifyIntoHostGroups(
    [
      descriptor({
        mediaId: "m13",
        labels: [
          { name: "Cake Cutting", confidence: 0.8 },
          { name: "Cake Cutting", confidence: 0.9 },
        ],
      }),
    ],
    groups,
  );
  assert.deepEqual(assignments, [{ groupId: "g4", mediaId: "m13" }]);
});

test("shouldQueueHighlightGeneration queues the initial generation once any media is approved", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 1,
      lastGeneratedCount: 0,
      hasPublishedGeneration: false,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: true,
      msSinceLastGeneration: null,
    }),
    true,
  );
});

test("shouldQueueHighlightGeneration refreshes fallback output below the floor as new items are approved", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 7,
      lastGeneratedCount: 6,
      hasPublishedGeneration: true,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: true,
      msSinceLastGeneration: 0,
    }),
    true,
  );
});

test("shouldQueueHighlightGeneration switches to dynamic mode the moment the count reaches the floor", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 8,
      lastGeneratedCount: 7,
      hasPublishedGeneration: true,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: true,
      msSinceLastGeneration: 0,
    }),
    true,
  );
});

test("shouldQueueHighlightGeneration withholds regeneration above the floor until the interval is reached", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 17,
      lastGeneratedCount: 8,
      hasPublishedGeneration: true,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: true,
      msSinceLastGeneration: 60 * 60 * 1000, // 1 hour — well under the max-wait fallback
    }),
    false,
  );
});

test("shouldQueueHighlightGeneration regenerates once the interval above the floor is reached", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 18,
      lastGeneratedCount: 8,
      hasPublishedGeneration: true,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: true,
      msSinceLastGeneration: 0,
    }),
    true,
  );
});

test("shouldQueueHighlightGeneration never queues over an existing pending generation", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 20,
      lastGeneratedCount: 8,
      hasPublishedGeneration: true,
      hasPendingGeneration: true,
      hasNewApprovedMediaSinceLastGeneration: true,
      msSinceLastGeneration: null,
    }),
    false,
  );
});

test("shouldQueueHighlightGeneration never queues when nothing new was approved, even if churn (a deletion plus a fresh approval) left the raw count unchanged", () => {
  // Regression for the 2026-09-26 production incident: approvedCount equals
  // lastGeneratedCount here (as it would when one photo was permanently
  // deleted and a different one approved in between), which a count-only
  // comparison can't distinguish from "genuinely nothing happened."
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 39,
      lastGeneratedCount: 39,
      hasPublishedGeneration: true,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: false,
      msSinceLastGeneration: 2 * 24 * 60 * 60 * 1000, // 2 days — time alone must not force a queue either
    }),
    false,
  );
});

test("shouldQueueHighlightGeneration applies the same 'nothing new' gate below the dynamic floor too", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 5,
      lastGeneratedCount: 5,
      hasPublishedGeneration: true,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: false,
      msSinceLastGeneration: 0,
    }),
    false,
  );
});

test("shouldQueueHighlightGeneration regenerates a trailing handful of new items once enough time has passed, even without a full batch", () => {
  assert.equal(
    shouldQueueHighlightGeneration({
      approvedCount: 43, // only 4 new since the last run — short of REGENERATION_INTERVAL (10)
      lastGeneratedCount: 39,
      hasPublishedGeneration: true,
      hasPendingGeneration: false,
      hasNewApprovedMediaSinceLastGeneration: true,
      msSinceLastGeneration: 5 * 60 * 60 * 1000, // 5 hours — past the 4-hour max wait
    }),
    true,
  );
});
