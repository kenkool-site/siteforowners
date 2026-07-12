import assert from "node:assert/strict";
import test from "node:test";
import { buildOutdoorServicesPreset } from "./preset-outdoor-services";
import { parseHomeServicesConfig } from "./types";

test("outdoor preset is bilingual and contains no unsupported claims", () => {
  const preset = buildOutdoorServicesPreset();
  assert.equal(preset.business_type, "home_services");
  assert.equal(preset.services.length, 8);
  const copy = preset.generated_copy;
  assert.ok(copy);
  assert.ok(copy.en.hero_headline);
  assert.ok(copy.es.hero_headline);
  const serialized = JSON.stringify(preset).toLowerCase();
  for (const claim of ["insured", "licensed", "4.9", "15 years"]) {
    assert.equal(serialized.includes(claim), false);
  }
});

test("seeds three bilingual process steps but no invented areas", () => {
  const config = parseHomeServicesConfig(
    buildOutdoorServicesPreset().generated_copy?.home_services_config,
  );

  assert.equal(config.process_steps.length, 3);
  assert.deepEqual(config.process_steps.map(({ body_en, body_es }) => ({ body_en, body_es })), [
    { body_en: "Share a few details about your project.", body_es: "Comparta algunos detalles sobre su proyecto." },
    { body_en: "We’ll review the work and provide a clear estimate.", body_es: "Revisaremos el trabajo y le daremos un estimado claro." },
    { body_en: "Choose a convenient time to get the job done.", body_es: "Elija un horario conveniente para realizar el trabajo." },
  ]);
  assert.deepEqual(config.service_areas, []);
});
