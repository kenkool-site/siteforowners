import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeServicesConfigForPreview,
  deriveServiceAreaSummary,
} from "./build-preview-config";

test("deriveServiceAreaSummary extracts city from a full address", () => {
  assert.equal(
    deriveServiceAreaSummary("123 Main St, Dallas, TX 75201", "en"),
    "Serving Dallas and nearby areas",
  );
  assert.equal(
    deriveServiceAreaSummary("123 Main St, Dallas, TX 75201", "es"),
    "Servicio en Dallas y zonas cercanas",
  );
});

test("buildHomeServicesConfigForPreview seeds trust points and hides estimate on previews", () => {
  const config = buildHomeServicesConfigForPreview({
    phone: "(214) 555-0100",
    serviceAreaAddress: "Plano, TX",
  });

  assert.ok(config.trust_points.length >= 3);
  assert.equal(config.sections.show_estimate, false);
  assert.equal(config.notification, undefined);
  assert.match(config.coverage_summary_en, /Plano/i);
  assert.equal(config.message_links.sms_e164, "+12145550100");
});
