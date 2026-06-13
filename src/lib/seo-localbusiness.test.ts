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

test("emits PostalAddress with streetAddress and addressLocality from seo_locality", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({ address: "123 Main St, Brooklyn", seo_locality: "Brooklyn, NY" }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.deepEqual(out.address, {
    "@type": "PostalAddress",
    streetAddress: "123 Main St, Brooklyn",
    addressLocality: "Brooklyn, NY",
  });
  assert.equal(out.areaServed, "Brooklyn, NY");
});

test("omits addressLocality when there is no seo_locality, and omits address node entirely when no address text", () => {
  const withAddr = buildLocalBusinessJsonLd(siteData({ address: "123 Main St" }), "https://x.com/") as Record<string, unknown>;
  assert.deepEqual(withAddr.address, { "@type": "PostalAddress", streetAddress: "123 Main St" });
  assert.ok(!("areaServed" in withAddr));

  const noAddr = buildLocalBusinessJsonLd(siteData({ address: "  ", seo_locality: null }), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("address" in noAddr));
});

test("sameAs contains only non-empty social links, in IG/FB/TikTok order", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: {}, social_links: { instagram: "https://instagram.com/acme", facebook: "  ", tiktok: "https://tiktok.com/@acme" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.deepEqual(out.sameAs, ["https://instagram.com/acme", "https://tiktok.com/@acme"]);
});

test("omits sameAs when there are no social links", () => {
  const out = buildLocalBusinessJsonLd(siteData({}), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("sameAs" in out));
});
