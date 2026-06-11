import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAdminTabs } from "./admin-navigation";

const tenant = {
  business_name: "Bella Studio",
  booking_tool: "internal",
  checkout_mode: "mockup",
};

test("owner navigation includes Profile and removes duplicate destinations", () => {
  const labels = buildAdminTabs(tenant).map((tab) => tab.label);

  assert.ok(labels.includes("Profile"));
  assert.equal(labels.includes("Photos"), false);
  assert.equal(labels.includes("Settings"), false);
});

test("Profile remains a desktop destination after Billing", () => {
  const tabs = buildAdminTabs(tenant);
  const billingIndex = tabs.findIndex((tab) => tab.label === "Billing");
  const profileIndex = tabs.findIndex((tab) => tab.label === "Profile");

  assert.equal(tabs[profileIndex]?.href, "/admin/profile");
  assert.equal(profileIndex, billingIndex + 1);
});

test("conditional schedule, services, and orders behavior is preserved", () => {
  const external = buildAdminTabs({
    ...tenant,
    booking_tool: "acuity",
    checkout_mode: "pickup",
  }).map((tab) => tab.label);

  assert.equal(external.includes("Schedule"), false);
  assert.equal(external.includes("Services"), false);
  assert.equal(external.includes("Orders"), true);
});
