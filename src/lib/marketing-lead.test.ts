import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_TYPES,
  escapeHtml,
  parseMarketingLead,
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
    businessLink: "https://instagram.com/velvetlash",
    notes: "I want something premium like the demo.",
    source: "demo",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.source, "demo");
  assert.equal(result.value.businessLink, "https://instagram.com/velvetlash");
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
