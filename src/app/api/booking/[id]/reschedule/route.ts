// siteforowners/src/app/api/booking/[id]/reschedule/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/reschedule-token";
import { computeAvailableStarts, parseBookingTime, formatTimeRange, type WorkingHours } from "@/lib/availability";
import {
  sendBookingRescheduledCustomer,
  sendBookingRescheduledOwner,
  type BookingEmailData,
} from "@/lib/email";
import {
  sendBookingRescheduledCustomerSms,
  sendBookingRescheduledOwnerSms,
  type BookingSmsData,
} from "@/lib/sms";
import { googleCalendarUrl } from "@/lib/calendar-links";
import { parseTime } from "@/lib/ics";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function dateStr(dateObj: Date): string {
  return `${DAYS[dateObj.getDay()]}, ${MONTHS[dateObj.getMonth()]} ${dateObj.getDate()}`;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const bookingId = params.id;
  let body: { token?: { e?: number; s?: string }; new_date?: string; new_time?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const exp = body.token?.e;
  const sig = body.token?.s;
  if (!exp || !sig || !body.new_date || !body.new_time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const tokenResult = verifyToken({ bookingId, expiry: exp, signature: sig });
  if (!tokenResult.ok) {
    return NextResponse.json({ error: tokenResult.reason }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, tenant_id, service_name, service_price, booking_date, booking_time, duration_minutes, customer_name, customer_phone, customer_email, customer_sms_opt_in, status, reschedule_count")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (["canceled", "completed", "no_show"].includes(booking.status as string)) {
    return NextResponse.json({ error: "Booking is no longer active" }, { status: 410 });
  }
  if ((booking.reschedule_count as number) >= 1) {
    return NextResponse.json({ error: "This booking has already been rescheduled" }, { status: 409 });
  }

  // 24h cutoff. Compute original start in floating local time, same as the
  // .ics + token expiry math so the boundary stays consistent.
  const originalStart = new Date((booking.booking_date as string) + "T00:00:00");
  const orig = parseTime(booking.booking_time as string);
  originalStart.setHours(orig.hours, orig.minutes, 0, 0);
  if (originalStart.getTime() - Date.now() < TWENTY_FOUR_HOURS_MS) {
    return NextResponse.json(
      { error: "Online reschedule is not available within 24 hours of your booking" },
      { status: 409 },
    );
  }

  // Validate the new slot is in the future.
  const newStart = new Date(body.new_date + "T00:00:00");
  const newT = parseTime(body.new_time);
  newStart.setHours(newT.hours, newT.minutes, 0, 0);
  if (newStart.getTime() <= Date.now()) {
    return NextResponse.json({ error: "New slot must be in the future" }, { status: 400 });
  }

  // Full slot validation via computeAvailableStarts — handles working-hour
  // defaults, open/close window, blocked dates, duration fit, and capacity.
  // Excludes this booking from the conflict pool so it doesn't block itself.
  const tenantId = booking.tenant_id as string | null;
  if (tenantId) {
    const { data: settings } = await supabase
      .from("booking_settings")
      .select("max_per_slot, working_hours, blocked_dates")
      .eq("tenant_id", tenantId)
      .single();
    const maxPerSlot = (settings?.max_per_slot as number | null) || 1;
    const blockedDates: string[] = (settings?.blocked_dates as string[] | null) ?? [];

    // Convert DB working_hours to the WorkingHours shape that computeAvailableStarts
    // expects, applying project-wide defaults (Mon–Fri 10–19, Sat 10–17, Sun closed).
    type WorkingHoursDay = { open: string; close: string };
    const parseClockTime = (t: string): number => {
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
    };
    const toWorkingHours = (
      dbHours: Record<string, WorkingHoursDay | null> | null,
    ): WorkingHours => {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const defaults: Record<string, { openHour: number; closeHour: number } | null> = {
        Sunday: null,
        Monday: { openHour: 10, closeHour: 19 },
        Tuesday: { openHour: 10, closeHour: 19 },
        Wednesday: { openHour: 10, closeHour: 19 },
        Thursday: { openHour: 10, closeHour: 19 },
        Friday: { openHour: 10, closeHour: 19 },
        Saturday: { openHour: 10, closeHour: 17 },
      };
      const out: WorkingHours = {};
      for (const day of days) {
        const dbDay = dbHours?.[day];
        if (dbDay === null) {
          out[day] = null;
        } else if (dbDay) {
          out[day] = {
            openHour: Math.ceil(parseClockTime(dbDay.open) / 60),
            closeHour: Math.floor(parseClockTime(dbDay.close) / 60),
          };
        } else {
          out[day] = defaults[day];
        }
      }
      return out;
    };
    const workingHours = toWorkingHours(
      settings?.working_hours as Record<string, WorkingHoursDay | null> | null,
    );

    const { data: sameDay } = await supabase
      .from("bookings")
      .select("booking_time, duration_minutes")
      .eq("tenant_id", tenantId)
      .eq("booking_date", body.new_date)
      .neq("id", bookingId)
      .in("status", ["confirmed", "pending"]);

    const durationMinutes = (booking.duration_minutes as number) ?? 60;
    const existing = (sameDay ?? []).map((r) => ({
      startMinutes: parseBookingTime(r.booking_time as string),
      durationMinutes: (r.duration_minutes as number) ?? 60,
    }));

    const availableStartHours = computeAvailableStarts({
      date: body.new_date,
      durationMinutes,
      workingHours,
      existingBookings: existing,
      maxPerSlot,
      blockedDates,
    });

    // new_time must land exactly on an available hourly start.
    const requestedMinutes = parseBookingTime(body.new_time);
    const requestedHour = requestedMinutes / 60;
    if (!availableStartHours.includes(requestedHour)) {
      return NextResponse.json({ error: "That slot is not available" }, { status: 409 });
    }
  }

  // Capture old date/time before the update so we can include them in
  // notifications. The row has the new values after the UPDATE returns.
  const previousBookingDate = booking.booking_date as string;
  const previousBookingTime = booking.booking_time as string;

  // Optimistic concurrency: only update if reschedule_count is still 0.
  // This protects against a race where two reschedules submit at once.
  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      booking_date: body.new_date,
      booking_time: body.new_time,
      reschedule_count: 1,
    })
    .eq("id", bookingId)
    .eq("reschedule_count", 0)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    console.error("[reschedule] update failed:", { bookingId, updateError });
    return NextResponse.json(
      { error: "Booking just changed — please refresh and try again" },
      { status: 409 },
    );
  }

  // Build notification payloads.
  const previousDateObj = new Date(previousBookingDate + "T00:00:00");
  const newDateObj = new Date(body.new_date + "T00:00:00");
  const durationMinutes = (booking.duration_minutes as number) ?? 60;

  const tenantInfo = tenantId
    ? await supabase
        .from("tenants")
        .select("business_name, phone, address, email, sms_phone, preview_slug")
        .eq("id", tenantId)
        .maybeSingle()
    : { data: null };
  const tenant = tenantInfo.data;
  const businessName = (tenant?.business_name as string) || "Business";
  const businessPhone = (tenant?.phone as string) || "";
  const businessAddress = (tenant?.address as string) || "";
  const ownerEmail = (tenant?.email as string) || "";
  const ownerSmsPhone = (tenant?.sms_phone as string | null) ?? (tenant?.phone as string | null) ?? "";
  const previewSlug = (tenant?.preview_slug as string | null) ?? undefined;

  // Customer just used their one reschedule quota — omit the link from the
  // confirmation email so they can't attempt another online reschedule.

  const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000);
  const gcalUrl = googleCalendarUrl({
    title: `${booking.service_name} — ${businessName}`,
    description: `Service: ${booking.service_name}${booking.service_price ? ` (${booking.service_price})` : ""}\nCustomer: ${booking.customer_name}`,
    location: businessAddress || undefined,
    startDate: newStart,
    endDate: newEnd,
  });

  const emailData: BookingEmailData = {
    businessName,
    businessPhone,
    businessAddress,
    serviceName: booking.service_name as string,
    servicePrice: (booking.service_price as string | null) ?? undefined,
    date: dateStr(newDateObj),
    time: body.new_time,
    customerName: booking.customer_name as string,
    customerPhone: booking.customer_phone as string,
    customerEmail: (booking.customer_email as string | null) ?? undefined,
    ownerEmail: ownerEmail || undefined,
    previewSlug,
    bookingId,
    googleCalendarUrl: gcalUrl,
    previousDate: dateStr(previousDateObj),
    previousTime: previousBookingTime,
    rescheduleUrl: undefined,
  };

  const smsData: BookingSmsData = {
    businessName,
    serviceName: booking.service_name as string,
    date: dateStr(newDateObj),
    time: formatTimeRange(body.new_time, durationMinutes),
    customerName: booking.customer_name as string,
    customerPhone: booking.customer_phone as string,
    businessAddress: businessAddress || undefined,
    previousDate: dateStr(previousDateObj),
    previousTime: previousBookingTime,
  };

  // Await the notifications: Vercel terminates the serverless function as
  // soon as the response is sent, so fire-and-forget loses any async work
  // that hasn't finished. Customer waits ~1s for the response.
  const results = await Promise.allSettled([
    sendBookingRescheduledCustomer(emailData, "customer"),
    sendBookingRescheduledOwner(ownerEmail, emailData),
    booking.customer_sms_opt_in ? sendBookingRescheduledCustomerSms(smsData, "customer") : Promise.resolve(),
    sendBookingRescheduledOwnerSms(ownerSmsPhone, smsData),
  ]);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("Reschedule notification failed:", r.reason);
    }
  }

  return NextResponse.json({ success: true, booking_id: bookingId });
}
