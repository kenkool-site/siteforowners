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
