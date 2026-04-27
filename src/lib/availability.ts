// Pure booking-availability primitives. Half-open intervals throughout.
// v3: free-form integer-minute durations (Spec 4 polish). Slot starts
// remain on the hour for predictable customer-facing slot grids.

/**
 * A booking interval, half-open: `[startMinutes, startMinutes + durationMinutes)`.
 * Touching intervals (one ends as another starts) do NOT overlap.
 */
export type BookingInterval = {
  startMinutes: number;
  durationMinutes: number;
};

export function bookingsOverlap(a: BookingInterval, b: BookingInterval): boolean {
  const aEnd = a.startMinutes + a.durationMinutes;
  const bEnd = b.startMinutes + b.durationMinutes;
  return a.startMinutes < bEnd && b.startMinutes < aEnd;
}

/**
 * Returns true iff inserting `candidate` would push the count of
 * concurrent bookings to or above `maxPerSlot` at any moment its
 * interval spans. Walks the candidate's range in 1-minute steps so
 * arbitrary integer-minute durations (e.g. 47, 70) are checked
 * correctly — finer than the booking grid for safety, but trivially
 * cheap (a 3h booking with 20 existing same-day bookings is 3600
 * iterations).
 *
 * Per-moment rather than per-overlap so a 3h booking that touches two
 * non-overlapping 1h bookings on a `maxPerSlot=2` calendar is still
 * allowed where capacity exists.
 */
export function wouldExceedCapacity(
  candidate: BookingInterval,
  existing: BookingInterval[],
  maxPerSlot: number,
): boolean {
  const candidateEnd = candidate.startMinutes + candidate.durationMinutes;
  for (let m = candidate.startMinutes; m < candidateEnd; m++) {
    let count = 0;
    for (const b of existing) {
      const bEnd = b.startMinutes + b.durationMinutes;
      if (m >= b.startMinutes && m < bEnd) count++;
    }
    if (count >= maxPerSlot) return true;
  }
  return false;
}

export type DayHours = { openHour: number; closeHour: number };
export type WorkingHours = Record<string, DayHours | null>;

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export type AvailabilityInput = {
  /** ISO date "YYYY-MM-DD" */
  date: string;
  durationMinutes: number;
  workingHours: WorkingHours;
  existingBookings: BookingInterval[];
  maxPerSlot: number;
  blockedDates: string[];
};

/**
 * Returns the list of valid start hours (0-23) for a service of the
 * given duration on the given date, considering working hours, blocked
 * dates, existing bookings, and per-slot capacity.
 *
 * v1 assumes 60-minute granularity (durations are whole hours, starts
 * land on the hour).
 */
export function computeAvailableStarts(input: AvailabilityInput): number[] {
  const {
    date,
    durationMinutes,
    workingHours,
    existingBookings,
    maxPerSlot,
    blockedDates,
  } = input;

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`durationMinutes must be a positive integer: got ${durationMinutes}`);
  }

  if (blockedDates.includes(date)) return [];

  const parts = date.split("-").map(Number);
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekdayName = WEEKDAY_NAMES[utc.getUTCDay()];
  const day = workingHours[weekdayName];
  if (!day) return [];

  const durationHours = durationMinutes / 60;
  const result: number[] = [];
  for (let h = day.openHour; h + durationHours <= day.closeHour; h++) {
    const candidate: BookingInterval = {
      startMinutes: h * 60,
      durationMinutes,
    };
    if (!wouldExceedCapacity(candidate, existingBookings, maxPerSlot)) {
      result.push(h);
    }
  }
  return result;
}

/** Parse a "10:00 AM" / "1:30 PM" string into minutes since midnight. */
export function parseBookingTime(s: string): number {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`invalid booking_time: "${s}"`);
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const period = m[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (period === "PM") hour += 12;
  return hour * 60 + minute;
}

/** Format minutes-since-midnight back into "1:30 PM". */
function formatMinutes(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * Format a duration in minutes as "1h", "30m", "1h 30m", etc.
 * Pure: no I/O. v2 grid: 30-minute granularity.
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTimeRange(startStr: string, durationMinutes: number): string {
  const start = parseBookingTime(startStr);
  return `${formatMinutes(start)} – ${formatMinutes(start + durationMinutes)}`;
}
