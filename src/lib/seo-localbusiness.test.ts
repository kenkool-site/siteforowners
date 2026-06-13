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

test("description prefers google_business_description, then seo_description, then hero_subheadline", () => {
  const withGbp = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: { google_business_description: "GBP desc", seo_description: "SEO desc", hero_subheadline: "Hero" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(withGbp.description, "GBP desc");

  const withSeo = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: { google_business_description: "  ", seo_description: "SEO desc", hero_subheadline: "Hero" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(withSeo.description, "SEO desc");

  const withHero = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: { google_business_description: "", seo_description: "", hero_subheadline: "Hero" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(withHero.description, "Hero");
});

test("omits telephone, image, logo, and description when absent or empty", () => {
  const out = buildLocalBusinessJsonLd(siteData({ phone: "  ", images: [] }), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("telephone" in out));
  assert.ok(!("image" in out));
  assert.ok(!("logo" in out));
  assert.ok(!("description" in out));
});

test("includes telephone, image, and logo when present", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({
      phone: "+1 718 555 0100",
      images: ["https://cdn/x.jpg", "https://cdn/y.jpg"],
      generated_copy: { en: {}, logo: "https://cdn/logo.png" } as unknown as PreviewData["generated_copy"],
    }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(out.telephone, "+1 718 555 0100");
  assert.equal(out.image, "https://cdn/x.jpg");
  assert.equal(out.logo, "https://cdn/logo.png");
});
