import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_TYPES,
  escapeHtml,
  parseMarketingLead,
  mapMarketingTypeToWizardType,
  buildWizardPrefillUrl,
  instagramHref,
  externalHref,
} from "./marketing-lead";

test("BUSINESS_TYPES includes existing homepage options and new beauty demo options", () => {
  assert.ok(BUSINESS_TYPES.includes("Braids"));
  assert.ok(BUSINESS_TYPES.includes("Locs"));
  assert.ok(BUSINESS_TYPES.includes("Nails"));
  assert.ok(BUSINESS_TYPES.includes("Lashes / brows"));
  assert.ok(BUSINESS_TYPES.includes("Spa / skincare"));
});

test("parseMarketingLead accepts the existing homepage payload", () => {
  const result = parseMarketingLead({
    businessName: "  Crown Nails  ",
    email: " owner@example.com ",
    phone: " 555-123-4567 ",
    businessAddress: " 123 Main St ",
    businessType: "Nails",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.businessName, "Crown Nails");
  assert.equal(result.value.email, "owner@example.com");
  assert.equal(result.value.phone, "555-123-4567");
  assert.equal(result.value.businessAddress, "123 Main St");
  assert.equal(result.value.businessType, "Nails");
  assert.equal(result.value.source, "homepage");
});

test("parseMarketingLead accepts the /demo portfolio payload", () => {
  const result = parseMarketingLead({
    businessName: "Velvet Lash Studio",
    email: "lash@example.com",
    phone: "555-444-3333",
    businessType: "Lashes / brows",
    bookingUrl: "https://booksy.com/x",
    instagramUrl: "velvetlash",
    notes: "I want something premium like the demo.",
    source: "demo",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.source, "demo");
  assert.equal(result.value.bookingUrl, "https://booksy.com/x");
  assert.equal(result.value.instagramUrl, "velvetlash");
  assert.equal(result.value.notes, "I want something premium like the demo.");
});

test("parseMarketingLead rejects missing required fields", () => {
  const result = parseMarketingLead({
    businessName: "",
    email: "owner@example.com",
    phone: "555-123-4567",
    businessType: "Nails",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "Business name, email, phone, and business type are required.");
});

test("parseMarketingLead rejects unsupported business type", () => {
  const result = parseMarketingLead({
    businessName: "Any Shop",
    email: "owner@example.com",
    phone: "555-123-4567",
    businessType: "Restaurant",
  });

  assert.equal(result.ok, false);
});

test("parseMarketingLead trims long optional notes to the accepted maximum", () => {
  const result = parseMarketingLead({
    businessName: "Crown Nails",
    email: "owner@example.com",
    phone: "555-123-4567",
    businessType: "Nails",
    notes: "x".repeat(1300),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.notes.length, 1200);
});

test("escapeHtml escapes email body values", () => {
  assert.equal(
    escapeHtml(`<script>"x" & 'y'</script>`),
    "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
  );
});

test("mapMarketingTypeToWizardType maps known beauty types to wizard types", () => {
  assert.equal(mapMarketingTypeToWizardType("Braids"), "braids");
  assert.equal(mapMarketingTypeToWizardType("Locs"), "braids");
  assert.equal(mapMarketingTypeToWizardType("Haircuts"), "salon");
  assert.equal(mapMarketingTypeToWizardType("Nails"), "nails");
  assert.equal(mapMarketingTypeToWizardType("Salon"), "salon");
  assert.equal(mapMarketingTypeToWizardType("Hair"), "salon");
  assert.equal(mapMarketingTypeToWizardType("Barber / grooming"), "barbershop");
});

test("mapMarketingTypeToWizardType maps outdoor services to home_services", () => {
  assert.equal(mapMarketingTypeToWizardType("Outdoor / home services"), "home_services");
});

test("BUSINESS_TYPES includes outdoor / home services", () => {
  assert.ok(BUSINESS_TYPES.includes("Outdoor / home services"));
});

test("mapMarketingTypeToWizardType returns '' for types with no wizard equivalent", () => {
  assert.equal(mapMarketingTypeToWizardType("Lashes / brows"), "");
  assert.equal(mapMarketingTypeToWizardType("Spa / skincare"), "");
  assert.equal(mapMarketingTypeToWizardType("Other beauty business"), "");
  assert.equal(mapMarketingTypeToWizardType("Restaurant"), ""); // not a marketing type at all
});

test("buildWizardPrefillUrl includes mapped type and url-encodes fields", () => {
  const url = buildWizardPrefillUrl({
    id: "abc-123",
    business_name: "Crown & Co",
    business_type: "Nails",
    phone: "555-1234",
    business_address: "1 Main St, Brooklyn",
    booking_url: "https://booksy.com/x",
    instagram_url: "velvetlash",
    notes: "loved the demo",
  });
  assert.ok(url.startsWith("/preview?"));
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(qs.get("lead"), "abc-123");
  assert.equal(qs.get("name"), "Crown & Co");
  assert.equal(qs.get("type"), "nails");
  assert.equal(qs.get("phone"), "555-1234");
  assert.equal(qs.get("address"), "1 Main St, Brooklyn");
  assert.equal(qs.get("link"), "https://booksy.com/x");
  assert.equal(qs.get("instagram"), "velvetlash");
  assert.equal(qs.get("desc"), "loved the demo");
});

test("buildWizardPrefillUrl omits empty optional fields and unmapped type", () => {
  const url = buildWizardPrefillUrl({
    id: "id-1",
    business_name: "Lash Bar",
    business_type: "Lashes / brows",
    phone: "",
    business_address: null,
    booking_url: null,
    instagram_url: null,
    notes: null,
  });
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(qs.get("lead"), "id-1");
  assert.equal(qs.get("name"), "Lash Bar");
  assert.equal(qs.has("type"), false);
  assert.equal(qs.has("phone"), false);
  assert.equal(qs.has("address"), false);
  assert.equal(qs.has("link"), false);
  assert.equal(qs.has("instagram"), false);
  assert.equal(qs.has("desc"), false);
});

test("instagramHref builds a profile URL from a bare handle", () => {
  assert.equal(instagramHref("velvetlash"), "https://instagram.com/velvetlash");
  assert.equal(instagramHref("@velvetlash"), "https://instagram.com/velvetlash");
  assert.equal(instagramHref("instagram.com/velvetlash"), "https://instagram.com/velvetlash");
  assert.equal(instagramHref("https://instagram.com/velvetlash"), "https://instagram.com/velvetlash");
  assert.equal(instagramHref(""), "");
  assert.equal(instagramHref(null), "");
});

test("externalHref ensures a scheme", () => {
  assert.equal(externalHref("booksy.com/x"), "https://booksy.com/x");
  assert.equal(externalHref("https://booksy.com/x"), "https://booksy.com/x");
  assert.equal(externalHref("http://x.com"), "http://x.com");
  assert.equal(externalHref(""), "");
  assert.equal(externalHref(undefined), "");
});
