import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeVisits, VisitRow } from "./admin-visits";

function row(day: string, count: number): VisitRow {
  return { day, count };
}

// Reference date: Friday 2026-04-24
// Current week: Mon 04-20 through Sun 04-26
// Previous week: Mon 04-13 through Sun 04-19
const REF = new Date("2026-04-24T12:00:00Z");

test("shapeVisits: sums current week and previous week totals", () => {
  const rows: VisitRow[] = [
    row("2026-04-13", 3), row("2026-04-15", 2), row("2026-04-19", 5),
    row("2026-04-20", 4), row("2026-04-22", 8), row("2026-04-24", 7),
  ];
  const s = shapeVisits(rows, REF);
  assert.equal(s.thisWeek, 19);
  assert.equal(s.lastWeek, 10);
});

test("shapeVisits: sparkline has 7 entries Mon→Sun", () => {
  const rows: VisitRow[] = [
    row("2026-04-20", 4), row("2026-04-22", 8), row("2026-04-24", 7),
  ];
  const s = shapeVisits(rows, REF);
  assert.equal(s.sparkline.length, 7);
  assert.equal(s.sparkline[0].day, "Mon");
  assert.equal(s.sparkline[0].count, 4);
  assert.equal(s.sparkline[1].day, "Tue");
  assert.equal(s.sparkline[1].count, 0);
  assert.equal(s.sparkline[2].day, "Wed");
  assert.equal(s.sparkline[2].count, 8);
  assert.equal(s.sparkline[4].day, "Fri");
  assert.equal(s.sparkline[4].count, 7);
  assert.equal(s.sparkline[6].day, "Sun");
  assert.equal(s.sparkline[6].count, 0);
});

test("shapeVisits: trendPct rounds to integer", () => {
  const rows: VisitRow[] = [row("2026-04-13", 10), row("2026-04-20", 13)];
  const s = shapeVisits(rows, REF);
  assert.equal(s.trendPct, 30);
});

test("shapeVisits: trendPct is null when last week was 0", () => {
  const rows: VisitRow[] = [row("2026-04-20", 5)];
  const s = shapeVisits(rows, REF);
  assert.equal(s.trendPct, null);
});

test("shapeVisits: no rows → all zeros, trendPct null", () => {
  const s = shapeVisits([], REF);
  assert.equal(s.thisWeek, 0);
  assert.equal(s.lastWeek, 0);
  assert.equal(s.trendPct, null);
  assert.equal(s.sparkline.length, 7);
  for (const d of s.sparkline) assert.equal(d.count, 0);
});

test("shapeVisits: ignores rows outside the two-week window", () => {
  const rows: VisitRow[] = [
    row("2026-04-06", 99), row("2026-05-04", 99), row("2026-04-20", 3),
  ];
  const s = shapeVisits(rows, REF);
  assert.equal(s.thisWeek, 3);
  assert.equal(s.lastWeek, 0);
});
