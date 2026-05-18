import { parseTime } from "@/lib/ics";

/**
 * Appointment end instant using the same local-date construction as create-booking
 * and reschedule (booking_date + T00:00:00 parse, then setHours from booking_time).
 */
export function bookingEndDate(
  bookingDate: string,
  bookingTime: string,
  durationMinutes: number,
): Date {
  const dateObj = new Date(bookingDate + "T00:00:00");
  const { hours, minutes } = parseTime(bookingTime);
  dateObj.setHours(hours, minutes, 0, 0);
  return new Date(dateObj.getTime() + durationMinutes * 60 * 1000);
}

/** True iff now is past (scheduled end + delay). */
export function isReviewSmsDue(
  now: Date,
  bookingDate: string,
  bookingTime: string,
  durationMinutes: number,
  delayMs: number,
): boolean {
  const end = bookingEndDate(bookingDate, bookingTime, durationMinutes);
  return now.getTime() >= end.getTime() + delayMs;
}

export function reviewRequestDelayMs(): number {
  const raw = Number(process.env.REVIEW_REQUEST_DELAY_HOURS);
  const hours = Number.isFinite(raw) && raw >= 0 ? raw : 3;
  return hours * 60 * 60 * 1000;
}
