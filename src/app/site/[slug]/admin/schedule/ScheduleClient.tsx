"use client";

import { useEffect, useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { WeekCalendar } from "../_components/WeekCalendar";
import { DayAgenda } from "../_components/DayAgenda";
import { HoursEditor } from "../_components/HoursEditor";
import { BookingActionSheet } from "../_components/BookingActionSheet";
import { UpcomingList } from "../_components/UpcomingList";

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

interface ScheduleClientProps {
  initialWeekStart: string;       // YYYY-MM-DD (Sunday)
  bookings: BookingRow[];
  workingHours: WorkingHours | null;
  blockedDates: string[];
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatIso(d: Date): string {
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

export function ScheduleClient({
  initialWeekStart,
  bookings,
  workingHours,
  blockedDates: initialBlockedDates,
}: ScheduleClientProps) {
  const [weekStart, setWeekStart] = useState<Date>(parseIso(initialWeekStart));
  const [agendaDate, setAgendaDate] = useState<Date>(new Date());
  const [blockedDates, setBlockedDates] = useState<string[]>(initialBlockedDates);
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  async function handleToggleDayBlock(iso: string, blocked: boolean): Promise<void> {
    const res = await fetch("/api/admin/bookings/block-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: blocked ? "add" : "remove", dates: [iso] }),
    });
    if (!res.ok) {
      alert("Could not update");
      return;
    }
    const data = await res.json();
    setBlockedDates((data.blocked_dates as string[]) ?? []);
  }

  return (
    <div className="space-y-4">
      {isMobile ? (
        <>
          <DayAgenda
            date={agendaDate}
            bookings={bookings.filter((b) => b.booking_date === formatIso(agendaDate))}
            workingHours={workingHours}
            blockedDates={blockedDates}
            onPrevDay={() => setAgendaDate((d) => addDays(d, -1))}
            onNextDay={() => setAgendaDate((d) => addDays(d, 1))}
            onToday={() => setAgendaDate(new Date())}
            onBookingClick={setActiveBooking}
            onToggleDayBlock={handleToggleDayBlock}
          />
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-[color:var(--admin-primary)] mb-2 px-1">
              Coming up
            </div>
            <UpcomingList
              bookings={bookings}
              today={new Date()}
              onBookingClick={setActiveBooking}
            />
          </div>
        </>
      ) : (
        <WeekCalendar
          weekStart={weekStart}
          bookings={bookings.filter((b) => {
            const wsIso = formatIso(weekStart);
            const weIso = formatIso(addDays(weekStart, 6));
            return b.booking_date >= wsIso && b.booking_date <= weIso;
          })}
          workingHours={workingHours}
          blockedDates={blockedDates}
          onPrevWeek={() => setWeekStart((d) => addDays(d, -7))}
          onNextWeek={() => setWeekStart((d) => addDays(d, 7))}
          onToday={() => {
            const t = new Date();
            t.setDate(t.getDate() - t.getDay());
            t.setHours(0, 0, 0, 0);
            setWeekStart(t);
          }}
          onBookingClick={setActiveBooking}
          onToggleDayBlock={handleToggleDayBlock}
        />
      )}

      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-[color:var(--admin-primary)] mb-2 px-1">
          Working hours
        </div>
        <details open className="bg-white border border-gray-200 rounded-lg group">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold flex items-center justify-between list-none">
            <span>Set days &amp; hours</span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-4 pb-4">
            <HoursEditor initial={workingHours} />
          </div>
        </details>
      </div>

      {activeBooking && (
        <BookingActionSheet
          row={activeBooking}
          onClose={() => setActiveBooking(null)}
          onStatusChange={() => setActiveBooking(null)}
        />
      )}
    </div>
  );
}
