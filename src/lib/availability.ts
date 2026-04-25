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
 * concurrent bookings for any minute it spans above `maxPerSlot`.
 */
export function wouldExceedCapacity(
  candidate: BookingInterval,
  existing: BookingInterval[],
  maxPerSlot: number,
): boolean {
  const overlaps = existing.filter((b) => bookingsOverlap(candidate, b));
  return overlaps.length >= maxPerSlot;
}
