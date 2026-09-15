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
      facts: [
        { key: "honoreeNames", value: "Mercy & John", confidence: 0.94, evidence: "MERCY & JOHN" },
        { key: "styleNote", value: "Glamorous fascinators", confidence: 0.93, evidence: "STYLE NOTE" },
      ],
      eventColors: [{ name: "Sage", color: "#AAB39A", confidence: 0.96, evidence: "SAGE" }],
      recipe: { ...DEFAULT_INVITATION_DESIGN_RECIPE, decoration: { ...DEFAULT_INVITATION_DESIGN_RECIPE.decoration, motif: "botanical" } },
    }),
    now: () => new Date("2026-09-15T15:00:00Z"),
  });
  assert.deepEqual(result.paletteCandidates, ["#F3F0E5", "#245A38", "#B88A53"]);
  assert.equal(result.facts[0]?.value, "Mercy & John");
  assert.equal(result.facts[1]?.key, "styleNote");
  assert.deepEqual(result.eventColors, [{ name: "Sage", color: "#AAB39A", confidence: 0.96, evidence: "SAGE" }]);
  assert.equal(result.recipe.decoration.motif, "botanical");
});

test("rejects malformed model output", async () => {
  await assert.rejects(() => analyzeInvitationReference({ bytes: new Uint8Array([1]), mediaType: "image/png", referencePath: "152b6e19-81e9-4bff-b402-77af52e2ed2a/designed_invite/reference.png" }, {
    extractPalette: async () => ["#FFFFFF"], analyzeVision: async () => "not json", now: () => new Date(),
  }), /structured analysis/i);
});

test("repairs partial model recipes and skips malformed individual facts", async () => {
  const result = await analyzeInvitationReference({
    bytes: new Uint8Array([1]), mediaType: "image/jpeg", referencePath: "152b6e19-81e9-4bff-b402-77af52e2ed2a/designed_invite/reference.jpg",
  }, {
    extractPalette: async () => ["#F4EFE7", "#1A2435", "#B98B62"],
    analyzeVision: async () => JSON.stringify({
      facts: [
        { key: "title", value: "Mercy & John", confidence: 0.96, evidence: "MERCY & JOHN" },
        { key: "unknown", value: "invented", confidence: 0.2, evidence: "" },
      ],
      recipe: {
        typography: { display: "formal-script" },
        composition: { alignment: "center" },
        decoration: { motif: "floral", divider: "flourish" },
      },
    }),
    now: () => new Date("2026-09-15T17:00:00Z"),
  });

  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0]?.value, "Mercy & John");
  assert.equal(result.recipe.typography.display, "formal-script");
  assert.equal(result.recipe.decoration.motif, "floral");
  assert.deepEqual(result.paletteCandidates, ["#F4EFE7", "#1A2435", "#B98B62"]);
});
