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

test("wouldExceedCapacity: 3h candidate with maxPerSlot=2 fits between two non-overlapping 1h bookings", () => {
  // Existing [10,11) and [12,13). Candidate [10,13). Hour 10 has 1/2,
  // hour 11 has 0/2, hour 12 has 1/2 — all under cap, so candidate fits.
  assert.equal(wouldExceedCapacity(bk(10, 3), [bk(10, 1), bk(12, 1)], 2), false);
});

test("wouldExceedCapacity: 3h candidate with maxPerSlot=2 rejected when one hour is at cap", () => {
  // Existing [11,12) and [11,12). Hour 11 has 2/2 — at cap, candidate rejected.
  assert.equal(wouldExceedCapacity(bk(10, 3), [bk(11, 1), bk(11, 1)], 2), true);
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

test("computeAvailableStarts: throws on durationMinutes=0", () => {
  assert.throws(
    () => computeAvailableStarts({
      date: "2026-04-27",
      durationMinutes: 0,
      workingHours: FULL_WEEK,
      existingBookings: [],
      maxPerSlot: 1,
      blockedDates: [],
    }),
    /durationMinutes must be a positive integer/,
  );
});

test("computeAvailableStarts: throws on non-integer duration", () => {
  assert.throws(
    () => computeAvailableStarts({
      date: "2026-04-27",
      durationMinutes: 12.5,
      workingHours: FULL_WEEK,
      existingBookings: [],
      maxPerSlot: 1,
      blockedDates: [],
    }),
    /durationMinutes must be a positive integer/,
  );
});

import { parseBookingTime, formatTimeRange, formatDuration } from "./availability";

test("parseBookingTime: throws on garbage input", () => {
  assert.throws(() => parseBookingTime("13:00"), /invalid booking_time/);
  assert.throws(() => parseBookingTime(""), /invalid booking_time/);
  assert.throws(() => parseBookingTime("10:00"), /invalid booking_time/);
});

test("parseBookingTime: '10:00 AM' → 600 (10 * 60)", () => {
  assert.equal(parseBookingTime("10:00 AM"), 600);
});

test("parseBookingTime: '12:00 PM' (noon) → 720", () => {
  assert.equal(parseBookingTime("12:00 PM"), 720);
});

test("parseBookingTime: '12:00 AM' (midnight) → 0", () => {
  assert.equal(parseBookingTime("12:00 AM"), 0);
});

test("parseBookingTime: '1:30 PM' → 13*60 + 30 = 810", () => {
  assert.equal(parseBookingTime("1:30 PM"), 810);
});

test("formatTimeRange: 10:00 AM, 60min → '10:00 AM – 11:00 AM'", () => {
  assert.equal(formatTimeRange("10:00 AM", 60), "10:00 AM – 11:00 AM");
});

test("formatTimeRange: 10:00 AM, 180min → '10:00 AM – 1:00 PM'", () => {
  assert.equal(formatTimeRange("10:00 AM", 180), "10:00 AM – 1:00 PM");
});

test("formatDuration: 30 minutes → '30m'", () => {
  assert.equal(formatDuration(30), "30m");
});

test("formatDuration: 60 minutes → '1h'", () => {
  assert.equal(formatDuration(60), "1h");
});

test("formatDuration: 90 minutes → '1h 30m'", () => {
  assert.equal(formatDuration(90), "1h 30m");
});

test("formatDuration: 150 minutes → '2h 30m'", () => {
  assert.equal(formatDuration(150), "2h 30m");
});

test("formatDuration: 480 minutes → '8h'", () => {
  assert.equal(formatDuration(480), "8h");
});

test("formatDuration: 0 minutes → '0m'", () => {
  assert.equal(formatDuration(0), "0m");
});

test("computeAvailableStarts: accepts 30-minute durations", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 30,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  // 9-17 working hours, 30-min service can start at every whole hour 9..16
  assert.equal(starts.length, 8);
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: accepts arbitrary integer durations (45 min)", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 45,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  // 9-17 working hours, 45-min service can start every whole hour 9..16
  // (last start 16:00 → 16:45 finishes before 17:00 close)
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: 70-min booking conflicts at fine granularity", () => {
  // Existing 70-min booking at 10:00 → 10:00–11:10. Candidate slot at 11:00
  // overlaps minutes 11:00–11:10 → must be excluded with maxPerSlot=1.
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [{ startMinutes: 10 * 60, durationMinutes: 70 }],
    maxPerSlot: 1,
    blockedDates: [],
  });
  // Hours 9..16 minus 10 (booked) and 11 (overlaps the 11:00–11:10 tail
  // of the existing 70-min booking).
  assert.deepEqual(starts, [9, 12, 13, 14, 15, 16]);
});

test("wouldExceedCapacity: catches sub-hour overlap (30-min existing booking)", () => {
  // Candidate 10:00-13:00 (3h). Existing 30-min booking at 10:30-11:00.
  // Without 30-min walk this would miss the overlap; with 30-min walk it
  // catches at m=630.
  const candidate = bk(10, 3);
  const existing = [{ startMinutes: 10 * 60 + 30, durationMinutes: 30 }];
  assert.equal(wouldExceedCapacity(candidate, existing, 1), true);
});

test("wouldExceedCapacity: 90-min candidate fits in a 90-min gap", () => {
  // Existing bookings at 09:00-10:30 and 12:00-13:00.
  // Candidate 90-min at 10:30 (start=630) ends at 12:00 (end=720).
  // No overlap. Should pass.
  const candidate = { startMinutes: 10 * 60 + 30, durationMinutes: 90 };
  const existing = [
    { startMinutes: 9 * 60, durationMinutes: 90 },
    { startMinutes: 12 * 60, durationMinutes: 60 },
  ];
  assert.equal(wouldExceedCapacity(candidate, existing, 1), false);
});
