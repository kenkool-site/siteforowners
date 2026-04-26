import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164 } from "./sms";

test("toE164: 10-digit US number gets +1 prefix", () => {
  assert.equal(toE164("5551234567"), "+15551234567");
});

test("toE164: dashes and parens stripped", () => {
  assert.equal(toE164("(555) 123-4567"), "+15551234567");
  assert.equal(toE164("555-123-4567"), "+15551234567");
});

test("toE164: 11-digit starting with 1 → +1...", () => {
  assert.equal(toE164("15551234567"), "+15551234567");
});

test("toE164: existing E.164 input stays as-is (digits-only normalized)", () => {
  assert.equal(toE164("+15551234567"), "+15551234567");
  assert.equal(toE164("+1 (555) 123-4567"), "+15551234567");
});

test("toE164: unrecognized garbage returns null", () => {
  assert.equal(toE164(""), null);
  assert.equal(toE164("abc"), null);
  assert.equal(toE164("123"), null);
});

test("toE164: empty string returns null", () => {
  assert.equal(toE164("   "), null);
});

import { isReminderDue, type ReminderRow } from "./sms";

function row(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "b1",
    booking_date: "2026-05-02",
    status: "confirmed",
    customer_sms_opt_in: true,
    sms_reminder_sent: false,
    ...overrides,
  };
}

test("isReminderDue: true for confirmed + opted-in + not-sent + matching date", () => {
  assert.equal(isReminderDue(row(), "2026-05-02"), true);
});

test("isReminderDue: false when status is not confirmed", () => {
  assert.equal(isReminderDue(row({ status: "canceled" }), "2026-05-02"), false);
  assert.equal(isReminderDue(row({ status: "completed" }), "2026-05-02"), false);
  assert.equal(isReminderDue(row({ status: "no_show" }), "2026-05-02"), false);
});

test("isReminderDue: false when customer did not opt in", () => {
  assert.equal(isReminderDue(row({ customer_sms_opt_in: false }), "2026-05-02"), false);
});

test("isReminderDue: false when reminder already sent", () => {
  assert.equal(isReminderDue(row({ sms_reminder_sent: true }), "2026-05-02"), false);
});

test("isReminderDue: false when date does not match tomorrow", () => {
  assert.equal(isReminderDue(row({ booking_date: "2026-05-01" }), "2026-05-02"), false);
  assert.equal(isReminderDue(row({ booking_date: "2026-05-03" }), "2026-05-02"), false);
});

import { tomorrowIsoUtc } from "./sms";

test("tomorrowIsoUtc: returns next-day ISO in UTC", () => {
  assert.equal(tomorrowIsoUtc(new Date("2026-05-01T12:00:00Z")), "2026-05-02");
  assert.equal(tomorrowIsoUtc(new Date("2026-05-31T23:59:00Z")), "2026-06-01");
  assert.equal(tomorrowIsoUtc(new Date("2026-12-31T23:59:00Z")), "2027-01-01");
});
