import assert from "node:assert/strict";
import test from "node:test";
import { isPublicSiteLive, isOwnerAdminReachable, canTeardownDemo, canToggleSiteOffline } from "./tenant-access";

const live = {
  preview_slug: "letstrylocs-bvnuou",
  site_published: true,
  subscription_status: "active",
};

test("isPublicSiteLive: active and trialing sites are live", () => {
  assert.equal(isPublicSiteLive({ ...live, subscription_status: "active" }), true);
  assert.equal(isPublicSiteLive({ ...live, subscription_status: "trialing" }), true);
});

test("isPublicSiteLive: past_due stays live (Stripe dunning grace window)", () => {
  // Regression: a failed/blocked renewal charge flips the subscription to
  // past_due. The client's whole site must NOT 404 during the retry window.
  assert.equal(isPublicSiteLive({ ...live, subscription_status: "past_due" }), true);
});

test("isPublicSiteLive: terminal and never-activated states gate the site", () => {
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", ""]) {
    assert.equal(
      isPublicSiteLive({ ...live, subscription_status: status }),
      false,
      `expected ${status || "<empty>"} to be gated`,
    );
  }
});

test("isPublicSiteLive: missing tenant, unpublished, or no preview_slug are gated", () => {
  assert.equal(isPublicSiteLive(null), false);
  assert.equal(isPublicSiteLive({ ...live, site_published: false }), false);
  assert.equal(isPublicSiteLive({ ...live, preview_slug: null }), false);
});

test("isOwnerAdminReachable: reachable while lapsed so owners can fix billing", () => {
  // Owner admin must work even for past_due/canceled so the owner can pay.
  assert.equal(isOwnerAdminReachable({ ...live, subscription_status: "past_due" }), true);
  assert.equal(isOwnerAdminReachable({ ...live, subscription_status: "canceled", site_published: false }), true);
});

test("isOwnerAdminReachable: needs a real tenant with a rendered site", () => {
  assert.equal(isOwnerAdminReachable(null), false);
  assert.equal(isOwnerAdminReachable({ ...live, preview_slug: null }), false);
});

test("canTeardownDemo: true only for is_demo tenants", () => {
  assert.equal(canTeardownDemo({ is_demo: true }), true);
  assert.equal(canTeardownDemo({ is_demo: false }), false);
  assert.equal(canTeardownDemo({ is_demo: null }), false);
  assert.equal(canTeardownDemo(null), false);
});

test("isPublicSiteLive: trialing demo with published site + preview is live", () => {
  assert.equal(
    isPublicSiteLive({ preview_slug: "s", site_published: true, subscription_status: "trialing" }),
    true,
  );
});

test("canToggleSiteOffline: only demo tenants may be toggled offline from admin", () => {
  assert.equal(canToggleSiteOffline({ is_demo: true }), true);
  // A paying client's site must never be takeable-down through this switch.
  assert.equal(canToggleSiteOffline({ is_demo: false }), false);
  assert.equal(canToggleSiteOffline({ is_demo: null }), false);
  assert.equal(canToggleSiteOffline(null), false);
});
