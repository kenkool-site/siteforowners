import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBookingsByDate, BookingRow } from "./admin-bookings";

function b(id: string, date: string, time = "10:00 AM"): BookingRow {
  return {
    id,
    booking_date: date,
    booking_time: time,
    customer_name: "Cust",
    customer_phone: "555",
    service_name: "Svc",
    status: "confirmed",
  };
}

test("groupBookingsByDate: groups rows by date, sorted ascending", () => {
  const rows = [
    b("3", "2026-04-26"),
    b("1", "2026-04-24"),
    b("2", "2026-04-24"),
    b("4", "2026-04-25"),
  ];
  const groups = groupBookingsByDate(rows);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].date, "2026-04-24");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[1].date, "2026-04-25");
  assert.equal(groups[2].date, "2026-04-26");
});

test("groupBookingsByDate: empty input returns empty array", () => {
  assert.deepEqual(groupBookingsByDate([]), []);
});

test("groupBookingsByDate: preserves row order within a date group", () => {
  const rows = [b("a", "2026-04-24", "10:00 AM"), b("b", "2026-04-24", "2:00 PM")];
  const groups = groupBookingsByDate(rows);
  assert.equal(groups[0].rows[0].id, "a");
  assert.equal(groups[0].rows[1].id, "b");
});
