"use client";

import { useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { formatTimeRange } from "@/lib/availability";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const INITIAL_ROW_LIMIT = 5;

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
 *
 * Shows the first INITIAL_ROW_LIMIT bookings by default; the rest are
 * gated behind a "Show all" button so the page doesn't become a long
 * scroll for tenants with a busy week.
 */
export function UpcomingList({
  bookings,
  today,
  daysAhead = 7,
  onBookingClick,
}: UpcomingListProps) {
  const [showAll, setShowAll] = useState(false);
  const todayIso = isoDate(today);
  const tomorrowIso = isoDate(addDays(today, 1));

  const start = addDays(today, 1);

  const groups: { date: Date; iso: string; rows: BookingRow[] }[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = addDays(start, i);
    const iso = isoDate(d);
    const rows = bookings.filter(
      (b) => b.booking_date === iso && (b.status === "confirmed" || b.status === "pending"),
    );
    if (rows.length > 0) groups.push({ date: d, iso, rows });
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-warm-cream1 bg-white p-4 text-center text-sm font-bold text-warm-textMuted">
        No upcoming bookings in the next {daysAhead} days.
      </div>
    );
  }

  // Total booking count across all groups, for the "Show all (N)" label.
  const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const overLimit = totalRows > INITIAL_ROW_LIMIT;

  // When collapsed, walk the groups in order and stop as soon as we've
  // shown INITIAL_ROW_LIMIT bookings. Partial groups are kept as-is so a
  // group's date header is never orphaned from its rows.
  const visibleGroups: typeof groups = [];
  if (showAll || !overLimit) {
    visibleGroups.push(...groups);
  } else {
    let remaining = INITIAL_ROW_LIMIT;
    for (const g of groups) {
      if (remaining <= 0) break;
      const slice = g.rows.slice(0, remaining);
      visibleGroups.push({ ...g, rows: slice });
      remaining -= slice.length;
    }
  }

  return (
    <div className="space-y-3">
      {visibleGroups.map((g) => (
        <div key={g.iso}>
          <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-pop-pink">
            {dayLabel(g.date, todayIso, tomorrowIso)}
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-warm-cream1 bg-white">
            {g.rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onBookingClick(r)}
                className={`flex w-full items-baseline gap-3 border-b border-warm-cream1 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-pink-50/60 ${
                  r.status === "pending" ? "border-l-4 border-l-orange-500 bg-orange-50" : ""
                }`}
              >
                <div className="w-32 shrink-0 text-xs font-black text-pop-pink">
                  {formatTimeRange(r.booking_time, r.duration_minutes)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-warm-deep">
                    {r.customer_name}
                    {r.status === "pending" && (
                      <span className="ml-2 inline-block rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs font-bold text-warm-textMuted">{r.service_name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {overLimit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full py-2 text-sm font-black text-pop-pink hover:underline"
        >
          {showAll ? "Show less" : `Show all ${totalRows} upcoming →`}
        </button>
      )}
    </div>
  );
}
