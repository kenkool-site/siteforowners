import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalBusinessJsonLd } from "./seo-localbusiness";
import type { PreviewData } from "@/lib/ai/types";

function siteData(preview: Partial<PreviewData>, overrides: Record<string, unknown> = {}) {
  return {
    preview: { business_name: "Acme", business_type: "salon", services: [], color_theme: "salon_gold", ...preview } as PreviewData,
    bookingHours: null,
    isDemo: false,
    ...overrides,
  } as Parameters<typeof buildLocalBusinessJsonLd>[0];
}

test("returns null for demo tenants", () => {
  const out = buildLocalBusinessJsonLd(siteData({}, { isDemo: true }), "https://acme.com/");
  assert.equal(out, null);
});

test("returns null when there is no business name", () => {
  const out = buildLocalBusinessJsonLd(siteData({ business_name: "  " }), "https://acme.com/");
  assert.equal(out, null);
});

test("emits @context, name, and url for a minimal valid business", () => {
  const out = buildLocalBusinessJsonLd(siteData({ business_name: "Acme Salon" }), "https://acme.com/") as Record<string, unknown>;
  assert.equal(out["@context"], "https://schema.org");
  assert.equal(out.name, "Acme Salon");
  assert.equal(out.url, "https://acme.com/");
});

test("maps each business_type to the correct schema.org @type", () => {
  const cases: [PreviewData["business_type"], string][] = [
    ["salon", "HairSalon"],
    ["barbershop", "HairSalon"],
    ["braids", "HairSalon"],
    ["locs", "HairSalon"],
    ["nails", "NailSalon"],
    ["restaurant", "Restaurant"],
  ];
  for (const [type, expected] of cases) {
    const out = buildLocalBusinessJsonLd(siteData({ business_type: type }), "https://x.com/") as Record<string, unknown>;
    assert.equal(out["@type"], expected, `business_type ${type}`);
  }
});

test("falls back to LocalBusiness for an unknown type", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({ business_type: "spaceship" as unknown as PreviewData["business_type"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(out["@type"], "LocalBusiness");
});
