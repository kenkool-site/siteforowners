import assert from "node:assert/strict";
import test from "node:test";
import {
  parseInvitationEventSchedule,
  normalizeInvitationEventSchedule,
  computeInferredScheduleRanges,
  MAX_EVENT_SCHEDULE_ITEMS,
} from "./event-schedule";

test("trims fields, drops empty rows, and sorts by startsAt ascending", () => {
  assert.deepEqual(
    parseInvitationEventSchedule([
      { name: " Wedding Reception ", startsAt: "2026-10-03T19:30:00.000Z" },
      { name: "", startsAt: "" },
      { name: " Wedding Ceremony ", startsAt: "2026-10-03T17:00:00.000Z", locationName: " St. Mary's ", locationAddress: " 123 Chapel St " },
    ]),
    {
      ok: true,
      value: [
        { name: "Wedding Ceremony", startsAt: "2026-10-03T17:00:00.000Z", locationName: "St. Mary's", locationAddress: "123 Chapel St" },
        { name: "Wedding Reception", startsAt: "2026-10-03T19:30:00.000Z" },
      ],
    },
  );
});

test("blank optional location fields normalize to absent, not empty strings", () => {
  const result = parseInvitationEventSchedule([
    { name: "Cocktail Hour", startsAt: "2026-10-03T18:00:00.000Z", locationName: "  ", locationAddress: "" },
  ]);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value[0], { name: "Cocktail Hour", startsAt: "2026-10-03T18:00:00.000Z" });
  assert.equal("locationName" in result.value[0], false);
  assert.equal("locationAddress" in result.value[0], false);
});

test("a single set location field (without the other) is preserved on its own", () => {
  const result = parseInvitationEventSchedule([
    { name: "Reception", startsAt: "2026-10-03T19:00:00.000Z", locationName: "The Grand Ballroom" },
  ]);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value[0], { name: "Reception", startsAt: "2026-10-03T19:00:00.000Z", locationName: "The Grand Ballroom" });
});

test("rejects a non-array, an oversized array, a missing/invalid name, and a missing/invalid startsAt", () => {
  assert.equal(parseInvitationEventSchedule("not an array").ok, false);
  assert.equal(
    parseInvitationEventSchedule(
      Array.from({ length: MAX_EVENT_SCHEDULE_ITEMS + 1 }, (_, index) => ({ name: `Item ${index}`, startsAt: "2026-10-03T17:00:00.000Z" })),
    ).ok,
    false,
  );
  assert.equal(parseInvitationEventSchedule([{ name: "x".repeat(81), startsAt: "2026-10-03T17:00:00.000Z" }]).ok, false);
  assert.equal(parseInvitationEventSchedule([{ startsAt: "2026-10-03T17:00:00.000Z" }]).ok, false);
  assert.equal(parseInvitationEventSchedule([{ name: "Ceremony", startsAt: "not a date" }]).ok, false);
  assert.equal(parseInvitationEventSchedule([{ name: "Ceremony" }]).ok, false);
});

test("rejects an over-length location name or address", () => {
  assert.equal(
    parseInvitationEventSchedule([{ name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z", locationName: "x".repeat(121) }]).ok,
    false,
  );
  assert.equal(
    parseInvitationEventSchedule([{ name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z", locationAddress: "x".repeat(301) }]).ok,
    false,
  );
});

test("normalize falls back to an empty array for invalid input instead of throwing", () => {
  assert.deepEqual(normalizeInvitationEventSchedule("garbage"), []);
  assert.deepEqual(normalizeInvitationEventSchedule(null), []);
  assert.deepEqual(normalizeInvitationEventSchedule(undefined), []);
});

test("computeInferredScheduleRanges: each item's end is the next item's start", () => {
  const items = [
    { name: "Ceremony", startsAt: "2026-10-03T17:00:00.000Z" },
    { name: "Cocktail Hour", startsAt: "2026-10-03T18:30:00.000Z" },
  ];
  assert.deepEqual(computeInferredScheduleRanges(items), [
    { item: items[0], startsAt: "2026-10-03T17:00:00.000Z", endsAt: "2026-10-03T18:30:00.000Z" },
    { item: items[1], startsAt: "2026-10-03T18:30:00.000Z", endsAt: "2026-10-03T20:30:00.000Z" },
  ]);
});

test("computeInferredScheduleRanges: a single item gets a 2-hour inferred end", () => {
  const items = [{ name: "Reception", startsAt: "2026-10-03T19:00:00.000Z" }];
  assert.deepEqual(computeInferredScheduleRanges(items), [
    { item: items[0], startsAt: "2026-10-03T19:00:00.000Z", endsAt: "2026-10-03T21:00:00.000Z" },
  ]);
});

test("computeInferredScheduleRanges: an empty list returns an empty list", () => {
  assert.deepEqual(computeInferredScheduleRanges([]), []);
});

test("computeInferredScheduleRanges: falls back to the 2-hour default when the next item shares (or precedes) the current item's start time", () => {
  const items = [
    { name: "Cocktail Hour", startsAt: "2026-10-03T17:00:00.000Z" },
    { name: "Photos", startsAt: "2026-10-03T17:00:00.000Z" },
    { name: "Reception", startsAt: "2026-10-03T19:00:00.000Z" },
  ];
  const result = computeInferredScheduleRanges(items);
  assert.deepEqual(result[0], { item: items[0], startsAt: "2026-10-03T17:00:00.000Z", endsAt: "2026-10-03T19:00:00.000Z" });
  assert.deepEqual(result[1], { item: items[1], startsAt: "2026-10-03T17:00:00.000Z", endsAt: "2026-10-03T19:00:00.000Z" });
});
