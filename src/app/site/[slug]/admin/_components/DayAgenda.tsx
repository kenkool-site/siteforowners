"use client";

import { useMemo, useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { parseBookingTime, formatTimeRange } from "@/lib/availability";

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface DayAgendaProps {
  date: Date;
  bookings: BookingRow[];                    // all bookings for this date
  workingHours: WorkingHours | null;
  blockedDates: string[];
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onBookingClick: (row: BookingRow) => void;
  onToggleDayBlock: (isoDate: string, blocked: boolean) => Promise<void>;
}

function parseClockMinutes(s: string): number {
  try { return parseBookingTime(s); }
  catch {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DayAgenda({
  date,
  bookings,
  workingHours,
  blockedDates,
  onPrevDay,
  onNextDay,
  onToday,
  onBookingClick,
  onToggleDayBlock,
}: DayAgendaProps) {
  const iso = isoDate(date);
  const weekdayName = DAYS_FULL[date.getDay()];
  const wh = workingHours?.[weekdayName];
  const dayBlocked = blockedDates.includes(iso);
  const dayClosed = wh === null;
  const [pending, setPending] = useState(false);

  const headerLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const hourRows = useMemo(() => {
    if (!wh) return [];
    const startH = Math.ceil(parseClockMinutes(wh.open) / 60);
    const endH = Math.floor(parseClockMinutes(wh.close) / 60);
    const rows: number[] = [];
    for (let h = startH; h < endH; h++) rows.push(h);
    return rows;
  }, [wh]);

  // Group bookings by their starting hour for quick lookup.
  const bookingsByHour = useMemo(() => {
    const map = new Map<number, BookingRow>();
    for (const b of bookings) {
      if (b.status !== "confirmed" && b.status !== "pending") continue;
      const startH = Math.floor(parseBookingTime(b.booking_time) / 60);
      map.set(startH, b);
    }
    return map;
  }, [bookings]);

  async function toggleBlock() {
    if (pending) return;
    setPending(true);
    try {
      await onToggleDayBlock(iso, !dayBlocked);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={onPrevDay} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">‹</button>
        <div className="flex flex-col items-center">
          <div className="text-sm font-semibold text-gray-900">{headerLabel}</div>
          <button onClick={onToday} className="text-xs text-[color:var(--admin-primary)] hover:underline">
            Today
          </button>
        </div>
        <button onClick={onNextDay} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">›</button>
      </div>

      {dayClosed ? (
        <div className="p-6 text-center text-sm text-gray-500">
          Closed on {weekdayName}s. Adjust in the working-hours editor below.
        </div>
      ) : (
        <>
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {dayBlocked ? "Day is blocked." : `${bookingsByHour.size} booking${bookingsByHour.size === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={toggleBlock}
              className={`text-xs px-2 py-1 rounded ${
                dayBlocked
                  ? "bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)]"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {dayBlocked ? "Reopen" : "Close this day"}
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {hourRows.map((h) => {
              const period = h >= 12 ? "PM" : "AM";
              const h12 = h % 12 === 0 ? 12 : h % 12;
              const booking = bookingsByHour.get(h);
              const striped = dayBlocked;
              return (
                <div
                  key={h}
                  className="px-4 py-3 flex items-center gap-3 text-sm"
                  style={{
                    backgroundImage: striped
                      ? "repeating-linear-gradient(45deg, var(--admin-primary-light, #fed7e2), var(--admin-primary-light, #fed7e2) 4px, white 4px, white 8px)"
                      : undefined,
                  }}
                >
                  <div className="w-16 text-gray-500 text-xs">{`${h12}:00 ${period}`}</div>
                  {booking ? (
                    <button
                      type="button"
                      onClick={() => onBookingClick(booking)}
                      className={`flex-1 text-left${booking.status === "pending" ? " border-l-4 border-amber-500 pl-2 bg-amber-50 rounded" : ""}`}
                    >
                      <div className="font-semibold">
                        {booking.customer_name}
                        {booking.status === "pending" && (
                          <span className="ml-2 inline-block bg-amber-500 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
                            Pending
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {booking.service_name} · {formatTimeRange(booking.booking_time, booking.duration_minutes)}
                      </div>
                    </button>
                  ) : (
                    <div className="flex-1 text-gray-400">Open</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
