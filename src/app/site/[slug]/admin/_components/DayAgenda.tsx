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
    <div className="overflow-hidden rounded-[1.75rem] border border-warm-cream1 bg-white">
      <div className="flex items-center justify-between border-b border-warm-cream1 px-4 py-3">
        <button onClick={onPrevDay} className="grid h-9 w-9 place-items-center rounded-full bg-warm-cream2 text-sm font-black text-warm-textMuted hover:bg-warm-cream1">‹</button>
        <div className="flex flex-col items-center">
          <div className="text-sm font-black text-warm-deep">{headerLabel}</div>
          <button onClick={onToday} className="text-xs font-black text-pop-pink hover:underline">
            Today
          </button>
        </div>
        <button onClick={onNextDay} className="grid h-9 w-9 place-items-center rounded-full bg-warm-cream2 text-sm font-black text-warm-textMuted hover:bg-warm-cream1">›</button>
      </div>

      {dayClosed ? (
        <div className="p-6 text-center text-sm font-bold text-warm-textMuted">
          Closed on {weekdayName}s. Adjust in the working-hours editor below.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-warm-cream1 px-4 py-3">
            <span className="text-xs font-bold text-warm-textMuted">
              {dayBlocked ? "Day is blocked." : `${bookingsByHour.size} booking${bookingsByHour.size === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={toggleBlock}
              className={`rounded-full px-3 py-2 text-xs font-black ${
                dayBlocked
                  ? "bg-pink-50 text-pop-pink ring-1 ring-pink-100"
                  : "border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
              }`}
            >
              {dayBlocked ? "Reopen" : "Close this day"}
            </button>
          </div>
          <div className="divide-y divide-warm-cream1">
            {hourRows.map((h) => {
              const period = h >= 12 ? "PM" : "AM";
              const h12 = h % 12 === 0 ? 12 : h % 12;
              const booking = bookingsByHour.get(h);
              const striped = dayBlocked;
              return (
                <div
                  key={h}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                  style={{
                    backgroundImage: striped
                      ? "repeating-linear-gradient(45deg, #fdf0f6, #fdf0f6 4px, white 4px, white 8px)"
                      : undefined,
                  }}
                >
                  <div className="w-16 text-xs font-black text-warm-textMuted/80">{`${h12}:00 ${period}`}</div>
                  {booking ? (
                    <button
                      type="button"
                      onClick={() => onBookingClick(booking)}
                      className={`flex-1 rounded-2xl px-3 py-2 text-left ${
                        booking.status === "pending"
                          ? "border-l-4 border-orange-500 bg-orange-50"
                          : "border-l-4 border-pop-pink bg-pink-50"
                      }`}
                    >
                      <div className="font-black text-warm-deep">
                        {booking.customer_name}
                        {booking.status === "pending" && (
                          <span className="ml-2 inline-block rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                            Pending
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-warm-textMuted">
                        {booking.service_name} · {formatTimeRange(booking.booking_time, booking.duration_minutes)}
                      </div>
                    </button>
                  ) : (
                    <div className="flex-1 rounded-2xl border border-dashed border-warm-cream1 px-3 py-2 font-bold text-warm-textMuted/55">Open</div>
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
