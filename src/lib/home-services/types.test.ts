import assert from "node:assert/strict";
import test from "node:test";
import { parseHomeServicesConfig } from "./types";

test("parseHomeServicesConfig returns safe empty defaults", () => {
  assert.deepEqual(parseHomeServicesConfig(null), {
    trust_points: [],
    gallery_projects: [],
    why_us_points: [],
    section_copy: {},
    process_steps: [],
    service_areas: [],
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

test("parseHomeServicesConfig accepts normalized notification destinations", () => {
  const value = parseHomeServicesConfig({
    notification: {
      channel: "whatsapp",
      destination_e164: "(832) 555-0147",
      sms_fallback_e164: "5551234567",
    },
  });
  assert.deepEqual(value.notification, {
    channel: "whatsapp",
    destination_e164: "+18325550147",
    sms_fallback_e164: "+15551234567",
  });
});

test("parseHomeServicesConfig drops invalid notification config", () => {
  assert.equal(parseHomeServicesConfig({ notification: { channel: "email", destination_e164: "+18325550147" } }).notification, undefined);
  assert.equal(parseHomeServicesConfig({ notification: { channel: "sms", destination_e164: "bad" } }).notification, undefined);
});

test("parses structured process and areas while preserving legacy summary", () => {
  const config = parseHomeServicesConfig({
    coverage_summary_en: "Serving Richmond",
    process_steps: [{ id: "one", title_en: "Tell us", body_en: "Send details", title_es: "Cuéntenos", body_es: "Envíe detalles" }],
    service_areas: [{ id: "richmond", name: "Richmond", zip_codes: ["77406", "77469-1234"] }],
  });
  assert.equal(config.process_steps.length, 1);
  assert.deepEqual(config.service_areas[0].zip_codes, ["77406", "77469-1234"]);
  assert.equal(config.coverage_summary_en, "Serving Richmond");
});

test("defensively trims, limits, and removes invalid or duplicate public rows", () => {
  const config = parseHomeServicesConfig({
    section_copy: { services: { title_en: "  Our services  ", title_es: 12 } },
    process_steps: Array.from({ length: 5 }, (_, index) => ({
      id: ` step-${index} `, title_en: " English ", body_en: " Body ", title_es: " Español ", body_es: " Texto ",
    })),
    service_areas: [
      { id: "one", name: " Richmond ", zip_codes: [" 77406 ", "bad", "77406"] },
      { id: "two", name: "richmond", zip_codes: ["77469"] },
      { id: "three", name: "Katy", zip_codes: ["77406", "77450"] },
    ],
    sections: { show_process: false, show_reviews: true },
  });
  assert.deepEqual(config.section_copy.services, { title_en: "Our services" });
  assert.equal(config.process_steps.length, 3);
  assert.deepEqual(config.service_areas, [
    { id: "one", name: "Richmond", zip_codes: ["77406"] },
    { id: "three", name: "Katy", zip_codes: ["77450"] },
  ]);
  assert.deepEqual(config.sections, { show_process: false, show_reviews: true });
});
