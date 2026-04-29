// siteforowners/src/app/api/admin/bookings/[id]/reschedule/route.ts
//
// Owner-initiated reschedule. Differs from the customer endpoint (T5) in:
//   - Auth: session cookie via requireOwnerOrFounder, not HMAC token
//   - No 24h cutoff (owners can reschedule anything still active)
//   - No count cap (owners can reschedule even if count >= 1)
//   - force flag: bypasses capacity check but NEVER bypasses working hours
//   - Capacity conflict response includes conflicting customer_name for UI modal
//   - Notifications: customer-only (owner just did it themselves)
//   - reschedule_count increment is unconditional (no optimistic-concurrency pin)
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import {
  computeAvailableStarts,
  parseBookingTime,
  formatTimeRange,
  type WorkingHours,
} from "@/lib/availability";
import {
  sendBookingRescheduledCustomer,
  type BookingEmailData,
} from "@/lib/email";
import {
  sendBookingRescheduledCustomerSms,
  type BookingSmsData,
} from "@/lib/sms";
import { googleCalendarUrl } from "@/lib/calendar-links";
import { parseTime } from "@/lib/ics";

const DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateStr(d: Date): string {
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const bookingId = params.id;

  let body: { new_date?: string; new_time?: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch booking first so we can pass tenant_id to the auth helper.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, tenant_id, service_name, service_price, booking_date, booking_time, duration_minutes, customer_name, customer_phone, customer_email, customer_sms_opt_in, status, reschedule_count")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Auth: owner session (hostname-matched) or founder admin cookie.
  const auth = await requireOwnerOrFounder(
    request,
    (booking.tenant_id as string) ?? undefined,
  );
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!body.new_date || !body.new_time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (["canceled", "completed", "no_show"].includes(booking.status as string)) {
    return NextResponse.json({ error: "Booking is no longer active" }, { status: 410 });
  }

  // Validate that the new slot is in the future.
  const newStart = new Date(body.new_date + "T00:00:00");
  const newT = parseTime(body.new_time);
  newStart.setHours(newT.hours, newT.minutes, 0, 0);
  if (newStart.getTime() <= Date.now()) {
    return NextResponse.json({ error: "New slot must be in the future" }, { status: 400 });
  }

  // Working-hours + capacity validation.
  // Always enforces working hours and blocked dates.
  // Capacity (max_per_slot) is enforced when !force; skipped when force=true.
  const tenantId = booking.tenant_id as string | null;
  if (tenantId) {
    const { data: settings } = await supabase
      .from("booking_settings")
      .select("max_per_slot, working_hours, blocked_dates")
      .eq("tenant_id", tenantId)
      .single();

    const maxPerSlot = (settings?.max_per_slot as number | null) || 1;
    const blockedDates: string[] = (settings?.blocked_dates as string[] | null) ?? [];

    // Normalize DB working_hours → WorkingHours shape, applying project defaults
    // (Mon–Fri 10–19, Sat 10–17, Sun closed) for any day not set explicitly.
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
      const days = [
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
      ];
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

    const durationMinutes = (booking.duration_minutes as number) ?? 60;

    if (body.force) {
      // force=true: bypass capacity but still enforce working hours + blocked dates.
      // Pass an empty existingBookings array so computeAvailableStarts evaluates
      // only the working-hours window and blocked-date rules, not capacity.
      const availableStartHours = computeAvailableStarts({
        date: body.new_date,
        durationMinutes,
        workingHours,
        existingBookings: [],
        maxPerSlot: 1,
        blockedDates,
      });
      const requestedHour = parseBookingTime(body.new_time) / 60;
      if (!availableStartHours.includes(requestedHour)) {
        return NextResponse.json(
          { error: "That slot is outside working hours or on a blocked date" },
          { status: 409 },
        );
      }
    } else {
      // !force: enforce working hours + capacity together.
      // Exclude this booking from the conflict pool so it doesn't block itself.
      const { data: sameDay } = await supabase
        .from("bookings")
        .select("booking_time, duration_minutes, customer_name")
        .eq("tenant_id", tenantId)
        .eq("booking_date", body.new_date)
        .neq("id", bookingId)
        .in("status", ["confirmed", "pending"]);

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

      const requestedMinutes = parseBookingTime(body.new_time);
      const requestedHour = requestedMinutes / 60;

      if (!availableStartHours.includes(requestedHour)) {
        // Find the conflicting booking at that time slot so the UI can show
        // "Schedule anyway?" with the existing customer's name.
        const conflicting = (sameDay ?? []).find(
          (r) => parseBookingTime(r.booking_time as string) === requestedMinutes,
        );
        if (conflicting) {
          return NextResponse.json(
            {
              error: "That slot already has a booking",
              conflict: { customer_name: conflicting.customer_name as string },
            },
            { status: 409 },
          );
        }
        // Slot is unavailable for another reason (outside hours, blocked date).
        return NextResponse.json(
          { error: "That slot is not available" },
          { status: 409 },
        );
      }
    }
  }

  // Capture old values before update for notification payloads.
  const previousBookingDate = booking.booking_date as string;
  const previousBookingTime = booking.booking_time as string;

  // Increment reschedule_count unconditionally — no optimistic-concurrency pin
  // because owners can reschedule a booking that's already been rescheduled once.
  const newCount = (booking.reschedule_count as number) + 1;

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      booking_date: body.new_date,
      booking_time: body.new_time,
      reschedule_count: newCount,
    })
    .eq("id", bookingId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    console.error("[admin/reschedule] update failed:", { bookingId, updateError });
    return NextResponse.json(
      { error: "Update failed — please try again" },
      { status: 500 },
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
  const previewSlug = (tenant?.preview_slug as string | null) ?? undefined;

  const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000);
  const gcalUrl = googleCalendarUrl({
    title: `${booking.service_name} — ${businessName}`,
    description:
      `Service: ${booking.service_name}` +
      `${booking.service_price ? ` (${booking.service_price})` : ""}` +
      `\nCustomer: ${booking.customer_name}`,
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
    // rescheduleUrl intentionally omitted: after an owner reschedule the count
    // is >= 1, so the customer's one self-service slot is already consumed.
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

  // Notify customer only — the owner just performed this action themselves.
  Promise.allSettled([
    sendBookingRescheduledCustomer(emailData, "owner"),
    booking.customer_sms_opt_in
      ? sendBookingRescheduledCustomerSms(smsData, "owner")
      : Promise.resolve(),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[admin/reschedule] notification failed:", r.reason);
      }
    }
  });

  return NextResponse.json({ success: true, booking_id: bookingId });
}
