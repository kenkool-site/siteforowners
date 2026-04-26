"use client";

import { useMemo, useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { parseBookingTime } from "@/lib/availability";

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface WeekCalendarProps {
  weekStart: Date;                           // Sunday
  bookings: BookingRow[];                    // bookings whose date falls in [weekStart, weekStart+7)
  workingHours: WorkingHours | null;
  blockedDates: string[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onBookingClick: (row: BookingRow) => void;
  onToggleDayBlock: (isoDate: string, blocked: boolean) => Promise<void>;
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

// "10:00" or "10:00 AM" → minutes
function parseClockMinutes(s: string): number {
  try { return parseBookingTime(s); }
  catch {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }
}

const HOUR_PX = 48;     // pixel height of one hour row

export function WeekCalendar({
  weekStart,
  bookings,
  workingHours,
  blockedDates,
  onPrevWeek,
  onNextWeek,
  onToday,
  onBookingClick,
  onToggleDayBlock,
}: WeekCalendarProps) {
  const [popoverDay, setPopoverDay] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Compute the visible hour range across the 7 days.
  const { firstHour, lastHour } = useMemo(() => {
    let minOpen = 10 * 60;
    let maxClose = 19 * 60;
    if (workingHours) {
      const opens: number[] = [];
      const closes: number[] = [];
      for (const day of DAYS_FULL) {
        const w = workingHours[day];
        if (w) {
          opens.push(parseClockMinutes(w.open));
          closes.push(parseClockMinutes(w.close));
        }
      }
      if (opens.length > 0) minOpen = Math.min(...opens);
      if (closes.length > 0) maxClose = Math.max(...closes);
    }
    return {
      firstHour: Math.floor(minOpen / 60),
      lastHour: Math.ceil(maxClose / 60),
    };
  }, [workingHours]);

  const days = useMemo(() => {
    const out: { date: Date; iso: string; weekdayName: string; weekdayShort: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      out.push({
        date: d,
        iso: isoDate(d),
        weekdayName: DAYS_FULL[d.getDay()],
        weekdayShort: DAYS_SHORT[d.getDay()],
      });
    }
    return out;
  }, [weekStart]);

  const today = isoDate(new Date());
  const monthLabel = `${weekStart.toLocaleString("en-US", { month: "long" })} ${weekStart.getDate()} – ${addDays(weekStart, 6).toLocaleString("en-US", { month: "long" })} ${addDays(weekStart, 6).getDate()}, ${addDays(weekStart, 6).getFullYear()}`;

  async function toggleBlock(iso: string) {
    if (pending) return;
    const isBlocked = blockedDates.includes(iso);
    setPending(true);
    try {
      await onToggleDayBlock(iso, !isBlocked);
      setPopoverDay(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header pager */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button onClick={onPrevWeek} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">‹</button>
          <button onClick={onToday} className="px-3 py-1 text-sm hover:bg-gray-50 rounded">Today</button>
          <button onClick={onNextWeek} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">›</button>
        </div>
        <div className="text-sm font-semibold text-gray-900">{monthLabel}</div>
        <div className="w-20" />
      </div>

      {/* Week grid */}
      <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
        {/* Day headers */}
        <div />
        {days.map((d) => {
          const isToday = d.iso === today;
          const dayClosed = workingHours?.[d.weekdayName] === null || blockedDates.includes(d.iso);
          return (
            <div key={d.iso} className="relative border-l border-gray-100">
              <button
                type="button"
                onClick={() => setPopoverDay(popoverDay === d.iso ? null : d.iso)}
                className={`w-full px-2 py-2 text-center ${isToday ? "bg-[var(--admin-primary-light)]" : ""}`}
              >
                <div className={`text-[10px] font-semibold ${isToday ? "text-[color:var(--admin-primary)]" : "text-gray-500"}`}>
                  {d.weekdayShort} {d.date.getDate()}
                </div>
                {dayClosed && <div className="text-[9px] text-[color:var(--admin-primary)]">Closed</div>}
              </button>
              {popoverDay === d.iso && (
                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs w-40">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggleBlock(d.iso)}
                    className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded"
                  >
                    {blockedDates.includes(d.iso) ? "Reopen this day" : "Closed this day"}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Hour rows */}
        {Array.from({ length: lastHour - firstHour }, (_, i) => {
          const h = firstHour + i;
          const period = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 === 0 ? 12 : h % 12;
          return (
            <div key={`row-${h}`} className="contents">
              <div className="text-[10px] text-right pr-1 text-gray-400" style={{ height: HOUR_PX, lineHeight: `${HOUR_PX}px` }}>
                {h12}{period === "AM" ? "a" : "p"}
              </div>
              {days.map((d) => {
                const wh = workingHours?.[d.weekdayName];
                const dayClosed = wh === null;
                const dayBlocked = blockedDates.includes(d.iso);
                const striped = dayClosed || dayBlocked;
                return (
                  <div
                    key={`${d.iso}-${h}`}
                    className="border-l border-t border-gray-100 relative"
                    style={{
                      height: HOUR_PX,
                      backgroundImage: striped
                        ? "repeating-linear-gradient(45deg, var(--admin-primary-light, #fed7e2), var(--admin-primary-light, #fed7e2) 4px, white 4px, white 8px)"
                        : undefined,
                    }}
                  />
                );
              })}
            </div>
          );
        })}

        {/* Booking blocks (absolute-positioned overlay per day column) */}
        {days.map((d, dayIdx) => {
          const dayBookings = bookings.filter(
            (b) => b.booking_date === d.iso && b.status === "confirmed",
          );
          return (
            <div
              key={`overlay-${d.iso}`}
              className="absolute pointer-events-none"
              style={{
                gridColumn: dayIdx + 2,
                gridRow: `2 / span ${lastHour - firstHour}`,
                position: "relative",
              }}
            >
              {dayBookings.map((b) => {
                const startMin = parseBookingTime(b.booking_time);
                const startHourFloat = startMin / 60;
                const top = (startHourFloat - firstHour) * HOUR_PX;
                const height = ((b.duration_minutes ?? 60) / 60) * HOUR_PX - 1;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onBookingClick(b)}
                    className="absolute left-0.5 right-0.5 rounded text-[10px] text-left px-1 py-0.5 pointer-events-auto overflow-hidden"
                    style={{
                      top,
                      height,
                      backgroundColor: "var(--admin-primary)",
                      color: "white",
                    }}
                  >
                    <div className="font-semibold truncate">{b.customer_name}</div>
                    <div className="opacity-80 truncate">{b.service_name}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
