import assert from "node:assert/strict";
import test from "node:test";
import { buildOutdoorServicesPreset } from "./preset-outdoor-services";

test("outdoor preset is bilingual and contains no unsupported claims", () => {
  const preset = buildOutdoorServicesPreset();
  assert.equal(preset.business_type, "home_services");
  assert.equal(preset.services.length, 8);
  assert.ok(preset.generated_copy.en.hero_headline);
  assert.ok(preset.generated_copy.es.hero_headline);
  const serialized = JSON.stringify(preset).toLowerCase();
  for (const claim of ["insured", "licensed", "4.9", "15 years"]) {
    assert.equal(serialized.includes(claim), false);
  }
});
