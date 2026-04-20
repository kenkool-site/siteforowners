import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface WorkingHoursDay {
  open: string; // "10:00" (24h) or "10:00 AM"
  close: string;
}

function parse24hTime(t: string): number {
  // Handle both "10:00" and "10:00 AM" formats
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

function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const date = searchParams.get("date"); // "2026-04-21"

  if (!slug || !date) {
    return NextResponse.json({ error: "slug and date required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get booking settings
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("*")
    .eq("preview_slug", slug)
    .single();

  const slotDuration = settings?.slot_duration || 60;
  const buffer = settings?.buffer_minutes || 0;
  const maxPerSlot = settings?.max_per_slot || 1;
  const blockedDates: string[] = settings?.blocked_dates || [];

  // Check if date is blocked
  if (blockedDates.includes(date)) {
    return NextResponse.json({ slots: [], blocked: true });
  }

  // Get day of week
  const dateObj = new Date(date + "T12:00:00");
  const dayName = DAY_NAMES[dateObj.getDay()];

  // Get working hours for this day
  const workingHours = settings?.working_hours as Record<string, WorkingHoursDay | null> | null;
  let dayHours: WorkingHoursDay | null = null;

  if (workingHours) {
    dayHours = workingHours[dayName] || null;
  } else {
    // Default hours: Mon-Sat 10am-7pm, Sunday closed
    if (dayName === "Sunday") {
      dayHours = null;
    } else if (dayName === "Saturday") {
      dayHours = { open: "10:00 AM", close: "5:00 PM" };
    } else {
      dayHours = { open: "10:00 AM", close: "7:00 PM" };
    }
  }

  if (!dayHours) {
    return NextResponse.json({ slots: [], closed: true });
  }

  // Generate time slots
  const openMinutes = parse24hTime(dayHours.open);
  const closeMinutes = parse24hTime(dayHours.close);
  const step = slotDuration + buffer;

  const allSlots: string[] = [];
  for (let t = openMinutes; t + slotDuration <= closeMinutes; t += step) {
    allSlots.push(formatTime(t));
  }

  // Get existing bookings for this date
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("booking_time")
    .eq("preview_slug", slug)
    .eq("booking_date", date)
    .eq("status", "confirmed");

  // Count bookings per time slot
  const bookingCounts: Record<string, number> = {};
  for (const b of existingBookings || []) {
    bookingCounts[b.booking_time] = (bookingCounts[b.booking_time] || 0) + 1;
  }

  // Filter out fully booked slots
  const availableSlots = allSlots.filter(
    (slot) => (bookingCounts[slot] || 0) < maxPerSlot
  );

  return NextResponse.json({ slots: availableSlots });
}
