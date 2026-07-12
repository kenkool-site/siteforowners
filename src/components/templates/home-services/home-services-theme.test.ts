import assert from "node:assert/strict";
import test from "node:test";
import { getHomeServicesColors } from "./home-services-theme";

test("getHomeServicesColors returns approved navy/green fallback", () => {
  const colors = getHomeServicesColors({
    business_name: "Test Co",
    business_type: "home_services",
    color_theme: "home_services_neighborhood",
    services: [],
  });

  assert.equal(colors.primary, "#0C3658");
  assert.equal(colors.secondary, "#13795B");
  assert.equal(colors.accent, "#13795B");
  assert.equal(colors.background, "#FFFFFF");
  assert.equal(colors.foreground, "#102A43");
  assert.equal(colors.muted, "#F0F6F8");
});
