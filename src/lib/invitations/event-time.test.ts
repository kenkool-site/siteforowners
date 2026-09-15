import assert from "node:assert/strict";
import test from "node:test";
import { defaultInvitationExpiry, zonedWallTimeToUtcIso } from "./event-time";

test("default expiry is the first instant after the following local calendar day", () => {
  for (const [start, zone, expected] of [
    ["2026-03-07T22:00:00Z", "America/New_York", "2026-03-09T04:00:00.000Z"],
    ["2026-10-31T22:00:00Z", "America/New_York", "2026-11-02T05:00:00.000Z"],
    ["2026-12-31T23:00:00Z", "Asia/Tokyo", "2027-01-02T15:00:00.000Z"],
    ["2026-10-03T02:00:00Z", "America/Los_Angeles", "2026-10-04T07:00:00.000Z"],
  ]) assert.equal(defaultInvitationExpiry(start!, zone!), expected);
});

test("event start uses the selected event timezone instead of the browser timezone", () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";

  try {
    assert.equal(new Date("2026-07-01T09:00").toISOString(), "2026-07-01T16:00:00.000Z");
    assert.equal(
      zonedWallTimeToUtcIso("2026-07-01T09:00", "America/New_York"),
      "2026-07-01T13:00:00.000Z",
    );
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("event start rejects invalid and nonexistent local times", () => {
  assert.throws(
    () => zonedWallTimeToUtcIso("not-a-date", "America/New_York"),
    /Enter a valid local date and time/,
  );
  assert.throws(
    () => zonedWallTimeToUtcIso("2026-03-08T02:30", "America/New_York"),
    /does not exist in America\/New_York/,
  );
});
