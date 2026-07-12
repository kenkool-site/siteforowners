import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_SERVICES_CONTENT_DEFAULTS,
  resolveHomeServicesProcessSteps,
  resolveHomeServicesSectionCopy,
} from "./content-defaults";

test("provides polished bilingual defaults for every richer section", () => {
  assert.deepEqual(Object.keys(HOME_SERVICES_CONTENT_DEFAULTS.section_copy), [
    "services", "recent_work", "process", "reviews", "service_areas", "final_cta",
  ]);
  for (const copy of Object.values(HOME_SERVICES_CONTENT_DEFAULTS.section_copy)) {
    assert.ok(copy.title_en);
    assert.ok(copy.title_es);
  }
  assert.equal(HOME_SERVICES_CONTENT_DEFAULTS.process_steps.length, 3);
});

test("section resolver merges configured values over defaults and replaces missing values", () => {
  const resolved = resolveHomeServicesSectionCopy("services", { title_en: " What we do ", title_es: "", intro_es: "Nuestro trabajo" });
  assert.equal(resolved.title_en, "What we do");
  assert.equal(resolved.intro_es, "Nuestro trabajo");
  assert.equal(resolved.title_es, HOME_SERVICES_CONTENT_DEFAULTS.section_copy.services.title_es);
});

test("process resolver uses configured rows or falls back to approved defaults", () => {
  const custom = [{ id: "custom", title_en: "A", body_en: "B", title_es: "C", body_es: "D" }];
  assert.deepEqual(resolveHomeServicesProcessSteps(custom), custom);
  assert.deepEqual(resolveHomeServicesProcessSteps([]), HOME_SERVICES_CONTENT_DEFAULTS.process_steps);
});
