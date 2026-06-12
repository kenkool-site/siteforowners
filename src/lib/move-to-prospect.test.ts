import test from "node:test";
import assert from "node:assert/strict";
import { buildProspectLead } from "./move-to-prospect";

test("buildProspectLead maps a demo tenant to an interested_leads row", () => {
  const row = buildProspectLead({
    preview_slug: "letstrylocs-abc",
    business_name: "Let's Try Locs",
    owner_name: "Tonia",
    phone: "12088132219",
    email: "owner@example.com",
  });
  assert.equal(row.preview_slug, "letstrylocs-abc");
  assert.equal(row.business_name, "Let's Try Locs");
  assert.equal(row.owner_name, "Tonia");
  assert.equal(row.phone, "12088132219");
  assert.equal(row.email, "owner@example.com");
});

test("buildProspectLead defaults phone to empty string (column is NOT NULL)", () => {
  const row = buildProspectLead({
    preview_slug: "novara-xyz",
    business_name: "Novara Beauty Luxe",
    owner_name: "Novara",
    phone: null,
    email: null,
  });
  assert.equal(row.phone, "");
  assert.equal(row.email, null);
});

test("buildProspectLead falls back owner_name to business name, then 'Owner'", () => {
  const fromBusiness = buildProspectLead({
    preview_slug: "s",
    business_name: "Styled By Jazmin",
    owner_name: null,
    phone: "1",
    email: null,
  });
  assert.equal(fromBusiness.owner_name, "Styled By Jazmin");

  const fallback = buildProspectLead({
    preview_slug: "s",
    business_name: null,
    owner_name: null,
    phone: "1",
    email: null,
  });
  assert.equal(fallback.owner_name, "Owner");
  assert.equal(fallback.business_name, "Unknown");
});

test("buildProspectLead throws when preview_slug is missing", () => {
  assert.throws(
    () =>
      buildProspectLead({
        preview_slug: null,
        business_name: "X",
        owner_name: "Y",
        phone: "1",
        email: null,
      }),
    /preview_slug/,
  );
});
