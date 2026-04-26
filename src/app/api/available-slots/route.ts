import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAvailableStarts, parseBookingTime, type WorkingHours } from "@/lib/availability";

interface WorkingHoursDay {
  open: string;  // "10:00" or "10:00 AM"
  close: string;
}

function parseClockTime(t: string): number {
  const amPmMatch = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1]);
    const m = parseInt(amPmMatch[2]);
    if (amPmMatch[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (amPmMatch[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function toAvailabilityWorkingHours(
  dbHours: Record<string, WorkingHoursDay | null> | null,
): WorkingHours {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const out: WorkingHours = {};
  // Defaults if no working_hours configured: Mon-Fri 10-19, Sat 10-17, Sun closed.
  const defaults: Record<string, { openHour: number; closeHour: number } | null> = {
    Sunday: null,
    Monday: { openHour: 10, closeHour: 19 },
    Tuesday: { openHour: 10, closeHour: 19 },
    Wednesday: { openHour: 10, closeHour: 19 },
    Thursday: { openHour: 10, closeHour: 19 },
    Friday: { openHour: 10, closeHour: 19 },
    Saturday: { openHour: 10, closeHour: 17 },
  };
  for (const day of days) {
    const dbDay = dbHours?.[day];
    if (dbDay === null) {
      out[day] = null;
    } else if (dbDay) {
      out[day] = {
        // v1 hourly grid: round open UP and close DOWN so bookings never
        // start before open or end after close, even if stored times have
        // sub-hour minutes (e.g. "5:30 PM" close → close at 17, not 18).
        openHour: Math.ceil(parseClockTime(dbDay.open) / 60),
        closeHour: Math.floor(parseClockTime(dbDay.close) / 60),
      };
    } else {
      out[day] = defaults[day];
    }
  }
  return out;
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const date = searchParams.get("date");
  const durationParam = searchParams.get("duration_minutes");

  if (!slug || !date) {
    return NextResponse.json({ error: "slug and date required" }, { status: 400 });
  }

  const durationMinutes = durationParam ? Number(durationParam) : 60;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 60 || durationMinutes > 480 || durationMinutes % 60 !== 0) {
    return NextResponse.json({ error: "duration_minutes must be a whole number of hours between 1 and 8" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("working_hours, blocked_dates, max_per_slot")
    .eq("preview_slug", slug)
    .maybeSingle();

  const blockedDates: string[] = settings?.blocked_dates ?? [];
  const maxPerSlot: number = settings?.max_per_slot ?? 1;
  const workingHours = toAvailabilityWorkingHours(
    (settings?.working_hours as Record<string, WorkingHoursDay | null> | null) ?? null,
  );

  const { data: bookings } = await supabase
    .from("bookings")
    .select("booking_time, duration_minutes")
    .eq("preview_slug", slug)
    .eq("booking_date", date)
    .eq("status", "confirmed");

  const existing = (bookings ?? []).map((b) => ({
    startMinutes: parseBookingTime(b.booking_time as string),
    durationMinutes: (b.duration_minutes as number) ?? 60,
  }));

  const startHours = computeAvailableStarts({
    date,
    durationMinutes,
    workingHours,
    existingBookings: existing,
    maxPerSlot,
    blockedDates,
  });

  return NextResponse.json({ slots: startHours.map(formatHour) });
}
