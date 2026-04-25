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

import { computeAvailableStarts, type WorkingHours } from "./availability";

const FULL_WEEK: WorkingHours = {
  Sunday: null,
  Monday: { openHour: 9, closeHour: 17 },
  Tuesday: { openHour: 9, closeHour: 17 },
  Wednesday: { openHour: 9, closeHour: 17 },
  Thursday: { openHour: 9, closeHour: 17 },
  Friday: { openHour: 9, closeHour: 17 },
  Saturday: { openHour: 10, closeHour: 14 },
};

test("computeAvailableStarts: 1h service, no bookings, weekday → all hours", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: 3h service shrinks the window from the end", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 180,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14]);
});

test("computeAvailableStarts: closed weekday returns []", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-26",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, []);
});

test("computeAvailableStarts: blocked date returns []", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: ["2026-04-27"],
  });
  assert.deepEqual(starts, []);
});

test("computeAvailableStarts: existing 1h booking removes only its hour", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [{ startMinutes: 11 * 60, durationMinutes: 60 }],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 10, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: 3h service blocked by 1h booking in middle of day", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 180,
    workingHours: FULL_WEEK,
    existingBookings: [{ startMinutes: 12 * 60, durationMinutes: 60 }],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 13, 14]);
});

test("computeAvailableStarts: max_per_slot=2 doubles capacity", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [{ startMinutes: 11 * 60, durationMinutes: 60 }],
    maxPerSlot: 2,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: service longer than working day returns []", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-25",
    durationMinutes: 300,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, []);
});

test("computeAvailableStarts: Saturday short hours", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-25",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [10, 11, 12, 13]);
});
