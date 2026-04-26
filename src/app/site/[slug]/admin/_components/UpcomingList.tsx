"use client";

import type { BookingRow } from "@/lib/admin-bookings";
import { formatTimeRange } from "@/lib/availability";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface UpcomingListProps {
  /** All bookings in the visible window (parent already filtered to the next N days). */
  bookings: BookingRow[];
  /** Reference "today" for grouping + omitting the current day. */
  today: Date;
  /** How many days forward to show, starting tomorrow. Default 7. */
  daysAhead?: number;
  onBookingClick: (row: BookingRow) => void;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function dayLabel(d: Date, todayIso: string, tomorrowIso: string): string {
  const iso = isoDate(d);
  if (iso === todayIso) return "Today";
  if (iso === tomorrowIso) return "Tomorrow";
  return `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/**
 * A flat chronological list of confirmed bookings for the next `daysAhead`
 * days, grouped by date. Designed for the mobile schedule view where the
 * single-day DayAgenda hides the upcoming overview.
 */
export function UpcomingList({
  bookings,
  today,
  daysAhead = 7,
  onBookingClick,
}: UpcomingListProps) {
  const todayIso = isoDate(today);
  const tomorrowIso = isoDate(addDays(today, 1));

  // Group confirmed bookings by date, showing tomorrow through today + daysAhead.
  const start = addDays(today, 1);
  const end = addDays(today, daysAhead);
  const startIso = isoDate(start);
  const endIso = isoDate(end);

  const groups: { date: Date; iso: string; rows: BookingRow[] }[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = addDays(start, i);
    const iso = isoDate(d);
    const rows = bookings.filter(
      (b) => b.booking_date === iso && b.status === "confirmed",
    );
    if (rows.length > 0) groups.push({ date: d, iso, rows });
  }

  if (groups.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-500">
        No upcoming bookings in the next {daysAhead} days.
      </div>
    );
  }

  // Suppress an unused-var warning for the date-range variables (kept for
  // future filtering). They make the intent clear when reading the code.
  void startIso;
  void endIso;

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.iso}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2 px-1">
            {dayLabel(g.date, todayIso, tomorrowIso)}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {g.rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onBookingClick(r)}
                className="w-full px-4 py-3 text-left flex items-baseline gap-3"
              >
                <div className="text-xs text-gray-500 w-32 shrink-0">
                  {formatTimeRange(r.booking_time, r.duration_minutes)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.customer_name}</div>
                  <div className="text-xs text-gray-500 truncate">{r.service_name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
