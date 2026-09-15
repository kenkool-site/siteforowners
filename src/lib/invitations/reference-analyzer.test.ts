import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "./design-recipe";
import { analyzeInvitationReference } from "./reference-analyzer";

test("combines sampled colors with constrained vision analysis", async () => {
  const result = await analyzeInvitationReference({
    bytes: new Uint8Array([1]), mediaType: "image/png", referencePath: "152b6e19-81e9-4bff-b402-77af52e2ed2a/designed_invite/reference.png",
  }, {
    extractPalette: async () => ["#F3F0E5", "#245A38", "#B88A53"],
    analyzeVision: async () => JSON.stringify({
      facts: [{ key: "honoreeNames", value: "Mercy & John", confidence: 0.94, evidence: "MERCY & JOHN" }],
      recipe: { ...DEFAULT_INVITATION_DESIGN_RECIPE, decoration: { ...DEFAULT_INVITATION_DESIGN_RECIPE.decoration, motif: "botanical" } },
    }),
    now: () => new Date("2026-09-15T15:00:00Z"),
  });
  assert.deepEqual(result.paletteCandidates, ["#F3F0E5", "#245A38", "#B88A53"]);
  assert.equal(result.facts[0]?.value, "Mercy & John");
  assert.equal(result.recipe.decoration.motif, "botanical");
});

test("rejects malformed model output", async () => {
  await assert.rejects(() => analyzeInvitationReference({ bytes: new Uint8Array([1]), mediaType: "image/png", referencePath: "152b6e19-81e9-4bff-b402-77af52e2ed2a/designed_invite/reference.png" }, {
    extractPalette: async () => ["#FFFFFF"], analyzeVision: async () => "not json", now: () => new Date(),
  }), /structured analysis/i);
});
