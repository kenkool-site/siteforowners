import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio } from "@/lib/templates/contrast";
import { getHomeServicesColors, getHomeServicesReadable } from "./home-services-theme";

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
  assert.equal(colors.muted, "#E8F5EE");
});

test("getHomeServicesReadable keeps dark text on muted service cards", () => {
  const colors = getHomeServicesColors({
    business_name: "Test Co",
    business_type: "home_services",
    color_theme: "home_services_neighborhood",
    services: [],
  });
  const readable = getHomeServicesReadable(colors);

  assert.ok(contrastRatio(readable.cardBodyOnMuted, colors.muted) >= 4.5);
  assert.ok(contrastRatio(readable.cardHeadingOnMuted, colors.muted) >= 3);
  assert.notEqual(readable.bodyOnBg.toLowerCase(), "#ffffff");
});
