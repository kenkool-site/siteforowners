import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_NAV_ICON_PATHS, getAdminNavIconName } from "./admin-nav-icons";

test("admin nav icon names are semantic instead of letter glyphs", () => {
  assert.equal(getAdminNavIconName("Home"), "home");
  assert.equal(getAdminNavIconName("Schedule"), "calendar");
  assert.equal(getAdminNavIconName("Services"), "briefcase");
  assert.equal(getAdminNavIconName("Updates"), "edit");
  assert.equal(getAdminNavIconName("Leads"), "mail");
  assert.equal(getAdminNavIconName("Billing"), "card");
  assert.equal(getAdminNavIconName("Settings"), "settings");
});

test("admin nav icons expose svg paths for every shell destination", () => {
  for (const iconName of [
    "home",
    "calendar",
    "briefcase",
    "edit",
    "mail",
    "card",
    "settings",
    "more",
  ] as const) {
    assert.ok(ADMIN_NAV_ICON_PATHS[iconName].length > 0);
  }
});
