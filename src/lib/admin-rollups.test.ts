import { test } from "node:test";
import assert from "node:assert/strict";
import { todayRange, currentIsoWeekRange, previousIsoWeekRange } from "./admin-rollups";

test("todayRange: returns [YYYY-MM-DD] string for today (UTC)", () => {
  const d = new Date("2026-04-24T15:30:00Z");
  const r = todayRange(d);
  assert.equal(r.start, "2026-04-24");
  assert.equal(r.end, "2026-04-24");
});

test("currentIsoWeekRange: Friday 2026-04-24 → Mon 04-20 to Sun 04-26", () => {
  const fri = new Date("2026-04-24T15:30:00Z");
  const r = currentIsoWeekRange(fri);
  assert.equal(r.start, "2026-04-20");
  assert.equal(r.end, "2026-04-26");
});

test("currentIsoWeekRange: Sunday 2026-04-26 → still 04-20 to 04-26", () => {
  const sun = new Date("2026-04-26T12:00:00Z");
  const r = currentIsoWeekRange(sun);
  assert.equal(r.start, "2026-04-20");
  assert.equal(r.end, "2026-04-26");
});

test("currentIsoWeekRange: Monday 2026-04-27 → next week 04-27 to 05-03", () => {
  const mon = new Date("2026-04-27T12:00:00Z");
  const r = currentIsoWeekRange(mon);
  assert.equal(r.start, "2026-04-27");
  assert.equal(r.end, "2026-05-03");
});

test("previousIsoWeekRange: Friday 2026-04-24 → 04-13 to 04-19", () => {
  const fri = new Date("2026-04-24T15:30:00Z");
  const r = previousIsoWeekRange(fri);
  assert.equal(r.start, "2026-04-13");
  assert.equal(r.end, "2026-04-19");
});

test("currentIsoWeekRange: crosses month boundary", () => {
  const thu = new Date("2026-04-30T09:00:00Z");
  const r = currentIsoWeekRange(thu);
  assert.equal(r.start, "2026-04-27");
  assert.equal(r.end, "2026-05-03");
});
