"use client";

import { useEffect, useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { WeekCalendar } from "../_components/WeekCalendar";
import { DayAgenda } from "../_components/DayAgenda";
import { HoursEditor } from "../_components/HoursEditor";
import { BookingActionSheet } from "../_components/BookingActionSheet";
import { UpcomingList } from "../_components/UpcomingList";
import { PendingPaymentsList, type PendingBooking } from "./_components/PendingPaymentsList";

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

interface ScheduleClientProps {
  initialWeekStart: string;       // YYYY-MM-DD (Sunday)
  bookings: BookingRow[];
  workingHours: WorkingHours | null;
  blockedDates: string[];
  initialPending?: PendingBooking[];
  /** Tenant's preview_slug — passed through to BookingActionSheet → RescheduleModal. */
  slug: string;
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

function todayIso(): string {
  return formatIso(new Date());
}

function getTodayBookings(bookings: BookingRow[]): BookingRow[] {
  const today = todayIso();
  return bookings.filter((b) => b.booking_date === today && (b.status === "confirmed" || b.status === "pending"));
}

function getNextBooking(bookings: BookingRow[]): BookingRow | null {
  const now = new Date();
  const nowIso = formatIso(now);
  return (
    bookings
      .filter((b) => b.booking_date >= nowIso && (b.status === "confirmed" || b.status === "pending"))
      .sort((a, b) => `${a.booking_date} ${a.booking_time}`.localeCompare(`${b.booking_date} ${b.booking_time}`))[0] ?? null
  );
}

export function ScheduleClient({
  initialWeekStart,
  bookings,
  workingHours,
  blockedDates: initialBlockedDates,
  initialPending = [],
  slug,
}: ScheduleClientProps) {
  const [weekStart, setWeekStart] = useState<Date>(parseIso(initialWeekStart));
  const [agendaDate, setAgendaDate] = useState<Date>(new Date());
  const [blockedDates, setBlockedDates] = useState<string[]>(initialBlockedDates);
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pending, setPending] = useState<PendingBooking[]>(initialPending);
  const todayBookings = getTodayBookings(bookings);
  const nextBooking = getNextBooking(bookings);

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

  async function handlePendingStatus(bookingId: string, toStatus: "confirmed" | "canceled") {
    const res = await fetch("/api/admin/bookings/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, toStatus }),
    });
    if (res.ok) {
      setPending((prev) => prev.filter((b) => b.id !== bookingId));
    } else {
      alert("Could not update booking status. Please try again.");
    }
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="overflow-hidden rounded-[2rem] bg-warm-deep text-pop-cream shadow-sm">
        <div className="grid gap-5 p-6 md:grid-cols-[minmax(0,1fr)_18rem] md:p-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pop-pink">Schedule</p>
            <h1 className="mt-2 max-w-2xl font-serif text-4xl font-black leading-[0.95] tracking-[-0.045em] md:text-6xl">
              Your day, clearly lined up.
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-6 text-pop-cream/70">
              Manage confirmed bookings, pending deposits, closed days, and working hours from one owner command center.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const t = new Date();
                  t.setDate(t.getDate() - t.getDay());
                  t.setHours(0, 0, 0, 0);
                  setWeekStart(t);
                  setAgendaDate(new Date());
                }}
                className="rounded-full bg-pop-pink px-4 py-2 text-xs font-black text-pop-cream transition hover:bg-pink-700"
              >
                Today
              </button>
              <a
                href="#working-hours"
                className="rounded-full border border-pop-cream/20 px-4 py-2 text-xs font-black text-pop-cream transition hover:bg-pop-cream/10"
              >
                Working hours
              </a>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-pop-cream/15 bg-pop-cream/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-200">Bookings today</p>
            <div className="mt-3 text-6xl font-black leading-none">{todayBookings.length}</div>
            <div className="mt-3 text-sm font-bold text-pop-cream/70">
              {nextBooking ? `Next: ${nextBooking.customer_name} at ${nextBooking.booking_time}` : "No upcoming booking in this window"}
            </div>
          </div>
        </div>
      </section>

      <div>
        <PendingPaymentsList
          pending={pending}
          onMarkReceived={(id) => handlePendingStatus(id, "confirmed")}
          onCancel={(id) => handlePendingStatus(id, "canceled")}
        />
      </div>

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
            <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-pop-pink">
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

      <div id="working-hours">
        <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-pop-pink">
          Working hours
        </div>
        <details open className="group rounded-[1.75rem] border border-warm-cream1 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-black text-warm-deep md:px-5">
            <span>Set days &amp; hours</span>
            <span className="text-pop-pink transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-4 md:px-5">
            <HoursEditor initial={workingHours} />
          </div>
        </details>
      </div>

      {activeBooking && (
        <BookingActionSheet
          row={activeBooking}
          slug={slug}
          onClose={() => setActiveBooking(null)}
          onStatusChange={() => setActiveBooking(null)}
        />
      )}
    </div>
  );
}
