import assert from "node:assert/strict";
import test from "node:test";
import { smsSegmentCount } from "./sms-segments";
import {
  calendarDaysUntilEvent,
  daysToGoText,
  substituteDaysToGo,
} from "./days-to-go";

const START = "2026-12-19T19:00:00.000Z";
const ZONE = "America/New_York";

test("calendar days follow the event timezone, including the midnight boundary", () => {
  assert.equal(calendarDaysUntilEvent(START, ZONE, new Date("2026-12-07T16:00:00.000Z")), 12);
  assert.equal(calendarDaysUntilEvent(START, ZONE, new Date("2026-12-18T15:00:00.000Z")), 1);
  assert.equal(calendarDaysUntilEvent(START, ZONE, new Date("2026-12-19T15:00:00.000Z")), 0);
  assert.equal(calendarDaysUntilEvent(START, ZONE, new Date("2026-12-19T20:00:00.000Z")), 0);
  assert.equal(calendarDaysUntilEvent(START, ZONE, new Date("2026-12-20T15:00:00.000Z")), -1);

  const midnight = "2026-12-19T05:00:00.000Z";
  assert.equal(calendarDaysUntilEvent(midnight, ZONE, new Date("2026-12-19T04:59:00.000Z")), 1);
  assert.equal(calendarDaysUntilEvent(midnight, ZONE, new Date("2026-12-19T05:00:00.000Z")), 0);
  assert.equal(calendarDaysUntilEvent(midnight, ZONE, new Date("2026-12-20T04:30:00.000Z")), 0);
  assert.equal(calendarDaysUntilEvent(midnight, ZONE, new Date("2026-12-20T05:30:00.000Z")), -1);
});

test("a missing timezone uses New York, and an explicit zone can disagree around midnight", () => {
  const startsAt = "2026-01-15T03:30:00.000Z";
  const now = new Date("2026-01-14T15:00:00.000Z");
  assert.equal(calendarDaysUntilEvent(startsAt, null, now), 0);
  assert.equal(calendarDaysUntilEvent(startsAt, "  ", now), 0);
  assert.equal(calendarDaysUntilEvent(startsAt, "Not/AZone", now), 0);
  assert.equal(calendarDaysUntilEvent(startsAt, "UTC", now), 1);

  const late = "2026-12-19T08:30:00.000Z";
  const almost = new Date("2026-12-19T07:30:00.000Z");
  assert.equal(calendarDaysUntilEvent(late, "America/Los_Angeles", almost), 1);
  assert.equal(calendarDaysUntilEvent(late, "America/New_York", almost), 0);
});

test("a missing or invalid start cannot be counted", () => {
  const now = new Date("2026-12-07T16:00:00.000Z");
  assert.equal(calendarDaysUntilEvent(null, ZONE, now), null);
  assert.equal(calendarDaysUntilEvent("", ZONE, now), null);
  assert.equal(calendarDaysUntilEvent("not-a-date", ZONE, now), null);
  assert.equal(calendarDaysUntilEvent(START, ZONE, new Date(Number.NaN)), null);
});

test("the phrase is grammatical in English and Spanish, and blank once the day has passed", () => {
  assert.equal(daysToGoText(12, "en"), "12 days to go");
  assert.equal(daysToGoText(2, "en"), "2 days to go");
  assert.equal(daysToGoText(1, "en"), "1 day to go");
  assert.equal(daysToGoText(0, "en"), "today's the day");
  assert.equal(daysToGoText(-1, "en"), "");
  assert.equal(daysToGoText(null, "en"), "");

  assert.equal(daysToGoText(12, "es"), "faltan 12 días");
  assert.equal(daysToGoText(1, "es"), "falta 1 día");
  assert.equal(daysToGoText(0, "es"), "¡es hoy!");
  assert.equal(daysToGoText(-3, "es"), "");
});

test("substitution fills the token, and an empty countdown leaves a readable sentence", () => {
  assert.equal(
    substituteDaysToGo("Hi Ada, just {days_to_go} until our celebration!", "12 days to go"),
    "Hi Ada, just 12 days to go until our celebration!",
  );
  assert.equal(
    substituteDaysToGo("Hi Ada, just {days_to_go} until our celebration!", "1 day to go"),
    "Hi Ada, just 1 day to go until our celebration!",
  );
  assert.equal(
    substituteDaysToGo("Hi Ada, just {days_to_go} until our celebration!", "today's the day"),
    "Hi Ada, just today's the day until our celebration!",
  );
  assert.equal(
    substituteDaysToGo("Hi Ada, just {days_to_go} until our celebration!", ""),
    "Hi Ada, just until our celebration!",
  );
  assert.equal(
    substituteDaysToGo("Please RSVP by Friday. {days_to_go}. We would love to plan for you.", "12 days to go"),
    "Please RSVP by Friday. 12 days to go. We would love to plan for you.",
  );
  assert.equal(
    substituteDaysToGo("Please RSVP by Friday. {days_to_go}. We would love to plan for you.", ""),
    "Please RSVP by Friday. We would love to plan for you.",
  );
  assert.equal(
    substituteDaysToGo("A reminder from Mercy: {days_to_go}", ""),
    "A reminder from Mercy",
  );
  assert.equal(
    substituteDaysToGo("A note: {days_to_go}.", "¡es hoy!"),
    "A note: ¡es hoy!",
  );
  assert.equal(substituteDaysToGo("Hola Ada, {days_to_go}!", ""), "Hola Ada!");
  assert.equal(substituteDaysToGo("See you Saturday", "12 days to go"), "See you Saturday");
  assert.equal(substituteDaysToGo("{days_to_go}", ""), "");

  const letter = substituteDaysToGo(
    "Hi Ada,\n\nJust {days_to_go} until our celebration. We would love to see you there.\n\n- Mercy and John",
    "",
  );
  assert.equal(
    letter,
    "Hi Ada,\n\nJust until our celebration. We would love to see you there.\n\n- Mercy and John",
  );
  assert.doesNotMatch(letter, /  /);
});

test("the Spanish countdown stays GSM-7 once accents that SMS cannot send are folded", () => {
  for (const phrase of ["faltan 12 dias", "falta 1 dia", "¡es hoy!"]) {
    assert.equal(smsSegmentCount(phrase).encoding, "gsm");
  }
});
