import assert from "node:assert/strict";
import test from "node:test";
import { eventIcsContents, googleEventCalendarUrl } from "./calendar";

test("Google Calendar carries the event's absolute start and end instants", () => {
  const url = googleEventCalendarUrl({
    title: "Mia & Lee",
    startsAt: "2026-10-10T18:00:00-04:00",
    endsAt: "2026-10-10T23:00:00-04:00",
    timezone: "America/New_York",
    location: "The Garden",
    description: "Celebrate with us",
  });
  const parsed = new URL(url);

  assert.equal(`${parsed.origin}${parsed.pathname}`, "https://calendar.google.com/calendar/render");
  assert.equal(parsed.searchParams.get("text"), "Mia & Lee");
  assert.equal(parsed.searchParams.get("dates"), "20261010T220000Z/20261011T030000Z");
  assert.equal(parsed.searchParams.get("ctz"), "America/New_York");
});

test("calendar outputs default a missing end to exactly four hours after start", () => {
  const input = {
    uid: "event-123",
    title: "A celebration",
    startsAt: "2026-10-10T18:00:00-04:00",
    endsAt: null,
    timezone: "America/New_York",
    location: "The Garden",
    description: "Celebrate with us",
  };

  assert.equal(
    new URL(googleEventCalendarUrl(input)).searchParams.get("dates"),
    "20261010T220000Z/20261011T020000Z",
  );
  assert.match(eventIcsContents(input), /DTEND:20261011T020000Z\r\n/);
});

test("ICS output escapes authored text and emits a stable event UID", () => {
  const ics = eventIcsContents({
    uid: "event/123",
    title: "Mia, Lee; and family",
    startsAt: "2026-10-10T18:00:00-04:00",
    endsAt: "2026-10-10T23:00:00-04:00",
    timezone: "America/New_York",
    location: "Garden\\Hall; Brooklyn, NY",
    description: "First line\r\nSecond line",
  });

  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /UID:event-123@siteforowners\.com\r\n/);
  assert.match(ics, /SUMMARY:Mia\\, Lee\\; and family\r\n/);
  assert.match(ics, /LOCATION:Garden\\\\Hall\\; Brooklyn\\, NY\r\n/);
  assert.match(ics, /DESCRIPTION:First line\\nSecond line\r\n/);
  assert.match(ics, /DTSTART:20261010T220000Z\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test("calendar helpers reject invalid start and end instants", () => {
  const base = {
    title: "A celebration",
    startsAt: "not-a-date",
    endsAt: null,
    location: "",
    description: "",
  };
  assert.throws(() => googleEventCalendarUrl(base), /valid start/i);
  assert.throws(
    () => eventIcsContents({ ...base, startsAt: "2026-10-10T18:00:00Z", endsAt: "invalid" }),
    /valid end/i,
  );
});
