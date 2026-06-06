import test from "node:test";
import assert from "node:assert/strict";
import { buildTenantRow, buildBookingSettingsRow } from "./provision-tenant";

const PENDING = {
  business_name: "Let's Try Locs",
  booking_mode: "external_only",
  notification_email: "owner@example.com",
  deposit_required: true,
  deposit_mode: "fixed",
  deposit_value: 25,
  deposit_cashapp: "$locs",
  deposit_zelle: null,
  deposit_other_label: null,
  deposit_other_value: null,
};

test("buildTenantRow builds a demo row (trialing, is_demo, subdomain, published)", () => {
  const row = buildTenantRow({
    previewSlug: "letstrylocs-abc",
    businessName: "Let's Try Locs",
    ownerName: "Tonia",
    status: "trialing",
    isDemo: true,
    bookingMode: "external_only",
    email: "owner@example.com",
    subdomain: "letstrylocs",
    sitePublished: true,
  });
  assert.equal(row.subscription_status, "trialing");
  assert.equal(row.is_demo, true);
  assert.equal(row.subdomain, "letstrylocs");
  assert.equal(row.site_published, true);
  assert.equal(row.preview_slug, "letstrylocs-abc");
  assert.equal(row.booking_mode, "external_only");
  assert.equal(row.email, "owner@example.com");
  assert.equal("stripe_customer_id" in row, false);
});

test("buildTenantRow builds a paid row (active, is_demo false, stripe ids, no subdomain key)", () => {
  const row = buildTenantRow({
    previewSlug: "letstrylocs-abc",
    businessName: "Let's Try Locs",
    ownerName: "Tonia",
    status: "active",
    isDemo: false,
    bookingMode: "in_site_only",
    email: null,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  });
  assert.equal(row.subscription_status, "active");
  assert.equal(row.is_demo, false);
  assert.equal(row.stripe_customer_id, "cus_1");
  assert.equal(row.stripe_subscription_id, "sub_1");
  assert.equal("subdomain" in row, false);
  assert.equal("site_published" in row, false);
});

test("buildTenantRow falls back owner_name to business name then 'Owner'", () => {
  const row = buildTenantRow({
    previewSlug: "s", businessName: "Biz", ownerName: "",
    status: "trialing", isDemo: true, bookingMode: "in_site_only", email: null,
  });
  assert.equal(row.owner_name, "Biz");
});

test("buildBookingSettingsRow maps pending deposit fields", () => {
  const row = buildBookingSettingsRow("tenant-1", "letstrylocs-abc", PENDING, "2026-06-05T00:00:00.000Z");
  assert.deepEqual(row, {
    tenant_id: "tenant-1",
    preview_slug: "letstrylocs-abc",
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 25,
    deposit_cashapp: "$locs",
    deposit_zelle: null,
    deposit_other_label: null,
    deposit_other_value: null,
    updated_at: "2026-06-05T00:00:00.000Z",
  });
});

test("buildBookingSettingsRow coerces missing deposit_required to false", () => {
  const row = buildBookingSettingsRow("t", "s", { ...PENDING, deposit_required: null }, "2026-06-05T00:00:00.000Z");
  assert.equal(row.deposit_required, false);
});
