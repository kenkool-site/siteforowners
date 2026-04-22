import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOURS,
  resolveDisplayHours,
  getHoursSource,
  parseGoogleHoursString,
} from "./businessHours";

test("DEFAULT_HOURS: weekdays 10am-7pm, Saturday 10am-5pm, Sunday closed", () => {
  assert.deepEqual(DEFAULT_HOURS.Monday, { open: "10:00 AM", close: "7:00 PM" });
  assert.deepEqual(DEFAULT_HOURS.Friday, { open: "10:00 AM", close: "7:00 PM" });
  assert.deepEqual(DEFAULT_HOURS.Saturday, { open: "10:00 AM", close: "5:00 PM" });
  assert.deepEqual(DEFAULT_HOURS.Sunday, { open: "", close: "", closed: true });
});

test("resolveDisplayHours: booking hours win when present", () => {
  const booking = { Monday: { open: "8:00 AM", close: "6:00 PM" } };
  const preview = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  const result = resolveDisplayHours(booking, preview);
  assert.deepEqual(result.Monday, { open: "8:00 AM", close: "6:00 PM" });
});

test("resolveDisplayHours: preview hours used when no booking hours", () => {
  const preview = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  const result = resolveDisplayHours(null, preview);
  assert.deepEqual(result.Monday, { open: "9:00 AM", close: "5:00 PM" });
});

test("resolveDisplayHours: defaults used when neither source has data", () => {
  const result = resolveDisplayHours(null, null);
  assert.deepEqual(result, DEFAULT_HOURS);
});

test("resolveDisplayHours: empty objects fall through to defaults", () => {
  const result = resolveDisplayHours({}, {});
  assert.deepEqual(result, DEFAULT_HOURS);
});

test("resolveDisplayHours: booking_settings null day means closed", () => {
  // booking_settings stores closed days as null. Convert to {closed: true}.
  const booking = {
    Monday: { open: "9:00 AM", close: "5:00 PM" },
    Sunday: null,
  };
  const result = resolveDisplayHours(booking, null);
  assert.deepEqual(result.Sunday, { open: "", close: "", closed: true });
  assert.deepEqual(result.Monday, { open: "9:00 AM", close: "5:00 PM" });
});

test("getHoursSource: 'google' when previews.hours equals imported_hours", () => {
  const hours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  assert.equal(getHoursSource(null, hours, hours), "google");
});

test("getHoursSource: 'custom' when previews.hours differs from imported_hours", () => {
  const previewHours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  const importedHours = { Monday: { open: "10:00 AM", close: "6:00 PM" } };
  assert.equal(getHoursSource(null, previewHours, importedHours), "custom");
});

test("getHoursSource: 'custom' when previews.hours set but imported_hours null", () => {
  const previewHours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  assert.equal(getHoursSource(null, previewHours, null), "custom");
});

test("getHoursSource: 'default' when previews.hours is null", () => {
  assert.equal(getHoursSource(null, null, null), "default");
});

test("getHoursSource: 'booking' when booking_settings exists (regardless of preview hours)", () => {
  const booking = { Monday: { open: "8:00 AM", close: "6:00 PM" } };
  const previewHours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  assert.equal(getHoursSource(booking, previewHours, null), "booking");
});

test("parseGoogleHoursString: parses semicolon-separated weekday descriptions", () => {
  const input =
    "Monday: 10:00 AM – 7:00 PM; Tuesday: 10:00 AM – 7:00 PM; Sunday: Closed";
  const result = parseGoogleHoursString(input);
  assert.deepEqual(result.Monday, { open: "10:00 AM", close: "7:00 PM" });
  assert.deepEqual(result.Sunday, { open: "", close: "", closed: true });
});

test("parseGoogleHoursString: returns empty object for null/empty input", () => {
  assert.deepEqual(parseGoogleHoursString(null), {});
  assert.deepEqual(parseGoogleHoursString(""), {});
});
