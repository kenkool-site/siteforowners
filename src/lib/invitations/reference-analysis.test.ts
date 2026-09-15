import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "./design-recipe";
import { normalizeInvitationReferenceAnalysis } from "./reference-analysis";

const analysis = {
  schemaVersion: 2,
  referencePath: "152b6e19-81e9-4bff-b402-77af52e2ed2a/designed_invite/reference.png",
  model: "claude-haiku-4-5-20251001",
  createdAt: "2026-09-15T15:00:00.000Z",
  facts: [{ key: "honoreeNames", value: "Mercy & John", confidence: 0.94, evidence: "MERCY & JOHN" }],
  paletteCandidates: ["#1e522e", "#d4a373"],
  recipe: DEFAULT_INVITATION_DESIGN_RECIPE,
};

test("normalizes private analysis and bounds confidence", () => {
  const result = normalizeInvitationReferenceAnalysis({ ...analysis, facts: [{ ...analysis.facts[0], confidence: 4 }] });
  assert.equal(result?.schemaVersion, 3);
  assert.equal(result?.facts[0]?.confidence, 1);
  assert.deepEqual(result?.paletteCandidates, ["#1E522E", "#D4A373"]);
  assert.deepEqual(result?.eventColors, []);
});

test("normalizes structured style notes and visibly labeled colors", () => {
  const result = normalizeInvitationReferenceAnalysis({
    ...analysis,
    schemaVersion: 3,
    facts: [{ key: "styleNote", value: "Glamorous fascinators", confidence: 0.93, evidence: "STYLE NOTE" }],
    eventColors: [{ name: " Sage ", color: "#aab39a", confidence: 0.96, evidence: "SAGE" }],
  });
  assert.equal(result?.facts[0]?.key, "styleNote");
  assert.deepEqual(result?.eventColors, [{ name: "Sage", color: "#AAB39A", confidence: 0.96, evidence: "SAGE" }]);
});

test("drops malformed extracted color rows without losing valid analysis", () => {
  const result = normalizeInvitationReferenceAnalysis({
    ...analysis,
    schemaVersion: 3,
    eventColors: [
      { name: "Sage", color: "green", confidence: 0.9, evidence: "SAGE" },
      { name: "Petal", color: "#E3C4C8", confidence: 0.9, evidence: "PETAL" },
    ],
  });
  assert.deepEqual(result?.eventColors, [{ name: "Petal", color: "#E3C4C8", confidence: 0.9, evidence: "PETAL" }]);
});

test("rejects malformed analysis rather than leaking partial model output", () => {
  assert.equal(normalizeInvitationReferenceAnalysis({ ...analysis, facts: [{ ...analysis.facts[0], key: "ownerEmail" }] }), null);
  assert.equal(normalizeInvitationReferenceAnalysis({ ...analysis, referencePath: "../reference.png" }), null);
});

test("migration adds private analysis storage and a service-role-only limiter", () => {
  const sql = readFileSync("supabase/migrations/046_invitation_reference_analysis.sql", "utf8");
  assert.match(sql, /design_recipe jsonb/i);
  assert.match(sql, /reference_analysis jsonb/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reserve_invitation_analysis_attempt[\s\S]*FROM PUBLIC/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reserve_invitation_analysis_attempt[\s\S]*TO service_role/i);
});
