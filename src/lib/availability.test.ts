import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsOverlap, type BookingInterval } from "./availability";

function bk(startHour: number, durationHours: number): BookingInterval {
  return { startMinutes: startHour * 60, durationMinutes: durationHours * 60 };
}

test("bookingsOverlap: non-touching intervals do not overlap", () => {
  assert.equal(bookingsOverlap(bk(9, 1), bk(11, 1)), false);
});

test("bookingsOverlap: touching intervals (a ends when b starts) do not overlap", () => {
  assert.equal(bookingsOverlap(bk(9, 1), bk(10, 1)), false);
});

test("bookingsOverlap: overlapping intervals are detected", () => {
  assert.equal(bookingsOverlap(bk(9, 3), bk(10, 1)), true);
});

test("bookingsOverlap: nested interval is detected", () => {
  assert.equal(bookingsOverlap(bk(10, 3), bk(11, 1)), true);
});

test("bookingsOverlap: identical intervals overlap", () => {
  assert.equal(bookingsOverlap(bk(10, 1), bk(10, 1)), true);
});

import { wouldExceedCapacity } from "./availability";

test("wouldExceedCapacity: empty existing returns false for any candidate", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [], 1), false);
});

test("wouldExceedCapacity: max_per_slot=1, one overlapping booking → exceeds", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(10, 1)], 1), true);
});

test("wouldExceedCapacity: max_per_slot=2, one overlapping booking → ok", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(10, 1)], 2), false);
});

test("wouldExceedCapacity: max_per_slot=2, two overlapping bookings → exceeds", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(10, 1), bk(10, 1)], 2), true);
});

test("wouldExceedCapacity: non-overlapping existing booking is ignored", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(12, 1)], 1), false);
});

test("wouldExceedCapacity: 3h candidate blocked by single 1h existing in middle", () => {
  assert.equal(wouldExceedCapacity(bk(10, 3), [bk(11, 1)], 1), true);
});
