import assert from "node:assert/strict";
import test from "node:test";
import { parseHomeServicesConfig } from "./types";

test("parseHomeServicesConfig returns safe empty defaults", () => {
  assert.deepEqual(parseHomeServicesConfig(null), {
    trust_points: [],
    gallery_projects: [],
    why_us_points: [],
    coverage_summary_en: "",
    coverage_summary_es: "",
    message_links: {},
    sections: {},
  });
});

test("parseHomeServicesConfig keeps only valid bilingual entries", () => {
  const value = parseHomeServicesConfig({
    trust_points: [{ id: "free", label_en: "Free estimates", label_es: "Estimados gratis" }],
    gallery_projects: "invalid",
    why_us_points: [{ id: "local", title_en: "Local", title_es: "Locales" }],
  });
  assert.equal(value.trust_points.length, 1);
  assert.deepEqual(value.gallery_projects, []);
  assert.equal(value.why_us_points.length, 1);
});
