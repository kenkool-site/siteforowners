import assert from "node:assert/strict";
import test from "node:test";
import { zonedWallTimeToUtcIso } from "./event-time";
import {
  countdownParts,
  directionsHref,
  eventPhase,
  eventSiteGuestUrl,
  formatEventWhen,
  untilDateLabel,
} from "./event-site";
import { suggestTimeZoneFromPlace } from "./venue-timezone";

test("1:00 PM in Dallas is 19:00Z and 1:00 PM in New York is 18:00Z", () => {
  assert.equal(zonedWallTimeToUtcIso("2026-12-19T13:00", "America/Chicago"), "2026-12-19T19:00:00.000Z");
  assert.equal(zonedWallTimeToUtcIso("2026-12-19T13:00", "America/New_York"), "2026-12-19T18:00:00.000Z");
});

test("the clock guests see follows the event timezone", () => {
  const chicagoInstant = "2026-12-19T19:00:00.000Z";
  const newYorkInstant = "2026-12-19T18:00:00.000Z";
  assert.match(formatEventWhen(chicagoInstant, "America/Chicago", "en") ?? "", /1:00\s*PM/);
  assert.match(formatEventWhen(chicagoInstant, "America/Chicago", "en") ?? "", /December 19, 2026/);
  assert.match(formatEventWhen(newYorkInstant, "America/Chicago", "en") ?? "", /12:00\s*PM/);
  assert.match(formatEventWhen(newYorkInstant, "America/New_York", "en") ?? "", /1:00\s*PM/);
});

test("countdown measures the instant and the until-date uses the event's calendar day", () => {
  const start = "2026-12-19T19:00:00.000Z";
  const now = new Date("2026-11-15T15:41:00.000Z");
  assert.equal(eventPhase(start, now), "upcoming");
  assert.deepEqual(countdownParts(start, now), { days: 34, hours: 3, minutes: 19, seconds: 0 });
  assert.match(untilDateLabel(start, "America/Chicago", "en") ?? "", /December 19/);

  const lateUtcMorning = "2026-01-01T05:30:00.000Z";
  assert.match(untilDateLabel(lateUtcMorning, "America/Chicago", "en") ?? "", /December 31/);
  assert.match(untilDateLabel(lateUtcMorning, "UTC", "en") ?? "", /January 1/);
});

test("once the event starts the countdown is absent instead of a stuck zero clock", () => {
  const start = "2026-12-19T19:00:00.000Z";
  assert.equal(eventPhase(start, new Date(start)), "thanks");
  assert.equal(countdownParts(start, new Date(start)), null);
  assert.equal(countdownParts(start, new Date("2026-12-19T19:00:01.000Z")), null);
  assert.equal(countdownParts(null, new Date(start)), null);
  assert.equal(eventPhase(null, new Date(start)), "undated");
});

test("a daylight-saving spring-forward gap counts one real hour, not two wall-clock hours", () => {
  const oneAm = zonedWallTimeToUtcIso("2026-03-08T01:00", "America/New_York");
  const threeAm = zonedWallTimeToUtcIso("2026-03-08T03:00", "America/New_York");
  assert.equal(oneAm, "2026-03-08T06:00:00.000Z");
  assert.equal(threeAm, "2026-03-08T07:00:00.000Z");
  assert.match(formatEventWhen(oneAm, "America/New_York", "en") ?? "", /1:00\s*AM/);
  assert.match(formatEventWhen(threeAm, "America/New_York", "en") ?? "", /3:00\s*AM/);
  assert.deepEqual(countdownParts(threeAm, new Date(oneAm)), { days: 0, hours: 1, minutes: 0, seconds: 0 });
});

test("a Texas venue suggests America/Chicago and a New York venue suggests America/New_York", () => {
  assert.equal(suggestTimeZoneFromPlace("4381 US-377, Aubrey, TX 76227", "The Bliss at Aubrey"), "America/Chicago");
  assert.equal(suggestTimeZoneFromPlace("Dallas, Texas", null), "America/Chicago");
  assert.equal(suggestTimeZoneFromPlace("10 Main Street, Brooklyn, NY 11201", null), "America/New_York");
  assert.equal(suggestTimeZoneFromPlace("Somewhere nice", "The Garden"), null);
});

test("directions use a saved map link, or a maps search of the address", () => {
  assert.equal(directionsHref("4381 US-377, Aubrey, TX 76227", null), "https://www.google.com/maps/search/?api=1&query=4381%20US-377%2C%20Aubrey%2C%20TX%2076227");
  assert.equal(directionsHref("42 Celebration Way", "https://maps.example.test/garden"), "https://maps.example.test/garden");
  assert.equal(directionsHref("  ", "  "), null);
});

test("event-site marketing links keep the referral slug and the event_site UTM set", () => {
  const url = new URL(eventSiteGuestUrl("mercy-john", "footer"));
  assert.equal(url.origin + url.pathname, "https://www.invitespot.app/");
  assert.equal(url.searchParams.get("from"), "mercy-john");
  assert.equal(url.searchParams.get("utm_source"), "event_site");
  assert.equal(url.searchParams.get("utm_medium"), "guest_page");
  assert.equal(url.searchParams.get("utm_campaign"), "mercy-john");
  assert.equal(url.searchParams.get("utm_content"), "footer");
});
