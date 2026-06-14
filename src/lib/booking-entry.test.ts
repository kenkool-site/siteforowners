import assert from "node:assert/strict";
import test from "node:test";
import { shouldAutoOpenInSiteCalendar } from "./booking-entry";

test("opens the in-site calendar for in_site_only tenants", () => {
  assert.equal(shouldAutoOpenInSiteCalendar("in_site_only", false), true);
});

test("opens the in-site calendar for both-mode tenants", () => {
  // The /booking entry point is explicitly for in-site booking, so it skips
  // the in-site-vs-external choice dialog that the homepage CTA shows.
  assert.equal(shouldAutoOpenInSiteCalendar("both", false), true);
});

test("does not auto-open for external_only tenants with no in-site booking", () => {
  assert.equal(shouldAutoOpenInSiteCalendar("external_only", false), false);
});

test("opens when internal booking is available even if mode says external_only", () => {
  // Defensive: showInternalBooking is true when a tenant has services but no
  // booking_url, which is the in-site flow regardless of the legacy mode value.
  assert.equal(shouldAutoOpenInSiteCalendar("external_only", true), true);
});
