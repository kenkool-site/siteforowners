import assert from "node:assert/strict";
import test from "node:test";
import { classifyMomentFromLabels } from "./moment-classification";
import type { MemoryMoment } from "./repository";

const ceremony: MemoryMoment = { id: "ceremony", name: "Ceremony", startsAt: "2026-09-22T18:00:00Z", endsAt: "2026-09-22T19:00:00Z", sortOrder: 1 };
const cakeCutting: MemoryMoment = { id: "cake", name: "Cake Cutting", startsAt: "2026-09-22T20:00:00Z", endsAt: "2026-09-22T20:30:00Z", sortOrder: 2 };
const danceFloor: MemoryMoment = { id: "dance", name: "Dance Floor", startsAt: "2026-09-22T21:00:00Z", endsAt: "2026-09-22T23:00:00Z", sortOrder: 3 };

test("a photo with cake-related labels classifies into the Cake Cutting moment", () => {
  const match = classifyMomentFromLabels(
    [{ name: "Cake", confidence: 0.95 }, { name: "Dessert", confidence: 0.8 }],
    [ceremony, cakeCutting, danceFloor],
  );
  assert.equal(match?.id, "cake");
});

test("a photo with dancing labels classifies into the Dance Floor moment, not Cake Cutting", () => {
  const match = classifyMomentFromLabels(
    [{ name: "Dance Pose", confidence: 0.9 }, { name: "Crowd", confidence: 0.7 }],
    [ceremony, cakeCutting, danceFloor],
  );
  assert.equal(match?.id, "dance");
});

test("labels matching no moment's preset keywords return null", () => {
  const match = classifyMomentFromLabels(
    [{ name: "Automobile", confidence: 0.9 }],
    [ceremony, cakeCutting, danceFloor],
  );
  assert.equal(match, null);
});

test("a moment whose name matches no preset keyword is never a candidate", () => {
  const customMoment: MemoryMoment = { id: "custom", name: "Zzyzx", startsAt: "2026-09-22T00:00:00Z", endsAt: "2026-09-22T01:00:00Z", sortOrder: 1 };
  const match = classifyMomentFromLabels([{ name: "Cake", confidence: 0.9 }], [customMoment]);
  assert.equal(match, null);
});

test("no detected labels or no moments returns null without throwing", () => {
  assert.equal(classifyMomentFromLabels([], [ceremony]), null);
  assert.equal(classifyMomentFromLabels([{ name: "Cake", confidence: 0.9 }], []), null);
});

test("more overlapping labels give a moment a higher cumulative score", () => {
  // "Person" alone matches only Ceremony's expected set; "Cake" and "Dessert" both
  // match Cake Cutting's — Cake Cutting's two matches should outscore Ceremony's one,
  // even though each individual label has the same confidence.
  const match = classifyMomentFromLabels(
    [{ name: "Person", confidence: 0.6 }, { name: "Cake", confidence: 0.6 }, { name: "Dessert", confidence: 0.6 }],
    [ceremony, cakeCutting],
  );
  assert.equal(match?.id, "cake");
});
