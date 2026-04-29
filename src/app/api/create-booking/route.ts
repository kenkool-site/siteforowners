import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateIcs, parseTime } from "@/lib/ics";
import { googleCalendarUrl } from "@/lib/calendar-links";
import { sendBookingNotification, sendBookingConfirmation, sendBookingPendingDepositEmail } from "@/lib/email";
import { wouldExceedCapacity, parseBookingTime, formatTimeRange } from "@/lib/availability";
import {
  sendBookingOwnerNotification,
  sendBookingCustomerConfirmation,
  sendBookingPendingDepositCustomer,
  type BookingSmsData,
} from "@/lib/sms";
import { computeDeposit, parseServicePrice } from "@/lib/deposit";
import type { AddOn } from "@/lib/ai/types";
import { validateAddOns } from "@/lib/validation/add-ons";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      preview_slug,
      service_name,
      service_price,
      duration_minutes,
      booking_date,
      booking_time,
      customer_name,
      customer_phone,
      customer_email,
      customer_notes,
      customer_sms_opt_in,
      selected_add_ons,
      add_ons_total_price,
    } = body;

    if (!preview_slug || !service_name || !booking_date || !booking_time || !customer_name || !customer_phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const durationMinutes = Number.isInteger(duration_minutes) ? Number(duration_minutes) : 60;
    if (durationMinutes < 5 || durationMinutes > 720) {
      return NextResponse.json(
        { error: "duration_minutes must be an integer between 5 and 720 minutes" },
        { status: 400 }
      );
    }

    let validatedAddOns: AddOn[] | null = null;
    let validatedAddOnsPrice: number | null = null;
    if (selected_add_ons !== undefined && selected_add_ons !== null) {
      const aoResult = validateAddOns(selected_add_ons);
      if (!aoResult.ok) {
        return NextResponse.json(
          { error: "Invalid selected_add_ons", errors: aoResult.errors },
          { status: 400 },
        );
      }
      if (aoResult.value.length > 0) {
        validatedAddOns = aoResult.value;
        const sumDuration = validatedAddOns.reduce((s, a) => s + a.duration_delta_minutes, 0);
        if (durationMinutes < sumDuration) {
          return NextResponse.json(
            { error: "duration_minutes is less than the sum of selected add-on durations" },
            { status: 400 },
          );
        }
        if (typeof add_ons_total_price === "number" && Number.isFinite(add_ons_total_price) && add_ons_total_price >= 0) {
          validatedAddOnsPrice = Number(add_ons_total_price.toFixed(2));
        } else {
          validatedAddOnsPrice = Number(
            validatedAddOns.reduce((s, a) => s + a.price_delta, 0).toFixed(2),
          );
        }
      }
    }

    const smsOptIn = customer_sms_opt_in === true;

    const supabase = createAdminClient();

    // Find the tenant for this preview
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, business_name, phone, email, address")
      .eq("preview_slug", preview_slug)
      .single();

    // Also get preview data for business info fallback
    const { data: preview } = await supabase
      .from("previews")
      .select("business_name, phone, address")
      .eq("slug", preview_slug)
      .single();

    const businessName = tenant?.business_name || preview?.business_name || "Business";
    const businessPhone = tenant?.phone || preview?.phone || "";
    const businessAddress = tenant?.address || preview?.address || "";
    const tenantId = tenant?.id;
    const ownerEmail = tenant?.email || "";

    // Check for conflicts + load deposit settings
    let bookingSettings: {
      max_per_slot?: number | null;
      deposit_required?: boolean | null;
      deposit_mode?: string | null;
      deposit_value?: number | null;
      deposit_instructions?: string | null;
    } | null = null;

    if (tenantId) {
      const { data: settings } = await supabase
        .from("booking_settings")
        .select("max_per_slot, deposit_required, deposit_mode, deposit_value, deposit_instructions")
        .eq("tenant_id", tenantId)
        .single();

      bookingSettings = settings;

      const maxPerSlot = settings?.max_per_slot || 1;

      // Spec 5: pending bookings reserve slots too, otherwise two
      // customers could each book the same slot while waiting on deposits.
      // Owner cancels stale pendings to free slots.
      const { data: sameDay } = await supabase
        .from("bookings")
        .select("booking_time, duration_minutes")
        .eq("tenant_id", tenantId)
        .eq("booking_date", booking_date)
        .in("status", ["confirmed", "pending"]);

      const candidate = {
        startMinutes: parseBookingTime(booking_time),
        durationMinutes,
      };
      const existing = (sameDay ?? []).map((r) => ({
        startMinutes: parseBookingTime(r.booking_time as string),
        durationMinutes: (r.duration_minutes as number) ?? 60,
      }));

      if (wouldExceedCapacity(candidate, existing, maxPerSlot)) {
        return NextResponse.json(
          { error: "This time slot is no longer available. Please choose another time." },
          { status: 409 }
        );
      }
    }

    // Spec 5: deposit calculation. If the tenant requires a deposit and the
    // computed amount > 0, the booking enters as 'pending' and the customer
    // gets the deposit-pending email + SMS instead of the standard confirmation.
    const depositSettings = {
      deposit_required: !!bookingSettings?.deposit_required,
      deposit_mode: (bookingSettings?.deposit_mode as "fixed" | "percent" | null) ?? null,
      deposit_value: (bookingSettings?.deposit_value as number | null) ?? null,
    };
    const basePrice = parseServicePrice(service_price ?? "");
    const addOnTotal = Array.isArray(validatedAddOns)
      ? validatedAddOns.reduce((sum: number, a: { price_delta: number }) => sum + a.price_delta, 0)
      : 0;
    const depositAmount = computeDeposit(depositSettings, basePrice, addOnTotal);
    const isPending = depositSettings.deposit_required && depositAmount > 0;
    const initialStatus = isPending ? "pending" : "confirmed";

    // Create the booking
    const { data: booking, error: insertError } = await supabase
      .from("bookings")
      .insert({
        tenant_id: tenantId || null,
        preview_slug,
        service_name,
        service_price: service_price || null,
        duration_minutes: durationMinutes,
        booking_date,
        booking_time,
        customer_name,
        customer_phone,
        customer_email: customer_email || null,
        customer_notes: customer_notes || null,
        customer_sms_opt_in: smsOptIn,
        selected_add_ons: validatedAddOns,
        add_ons_total_price: validatedAddOnsPrice,
        status: initialStatus,
        deposit_amount: depositAmount > 0 ? depositAmount : null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Booking insert error:", insertError);
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }

    // Build dates for .ics
    const dateObj = new Date(booking_date + "T00:00:00");
    const { hours, minutes } = parseTime(booking_time);
    const startDate = new Date(dateObj);
    startDate.setHours(hours, minutes, 0);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    const dayName = DAYS[dateObj.getDay()];
    const monthName = MONTHS[dateObj.getMonth()];
    const dateStr = `${dayName}, ${monthName} ${dateObj.getDate()}`;

    const icsTitle = `${service_name} — ${businessName}`;
    const icsDescription = `Service: ${service_name}${service_price ? ` (${service_price})` : ""}\nCustomer: ${customer_name}\nPhone: ${customer_phone}${customer_notes ? `\nNotes: ${customer_notes}` : ""}`;

    // .ics for the owner email (still attached — owner relationship is
    // already established, no Gmail first-contact friction).
    const icsContent = generateIcs({
      title: icsTitle,
      description: icsDescription,
      location: businessAddress || undefined,
      startDate,
      endDate,
      organizerName: businessName,
      attendeeName: customer_name,
      attendeeEmail: customer_email || undefined,
    });

    // Google Calendar deep-link for the customer email body.
    const gcalUrl = googleCalendarUrl({
      title: icsTitle,
      description: icsDescription,
      location: businessAddress || undefined,
      startDate,
      endDate,
    });

    const emailData = {
      businessName,
      businessPhone,
      businessAddress,
      serviceName: service_name,
      servicePrice: service_price,
      date: dateStr,
      time: booking_time,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerEmail: customer_email || undefined,
      customerNotes: customer_notes || undefined,
      ownerEmail: ownerEmail || undefined,
      previewSlug: preview_slug,
      status: initialStatus as "confirmed" | "pending",
      depositAmount: depositAmount > 0 ? depositAmount : undefined,
      bookingId: booking.id,
      googleCalendarUrl: gcalUrl,
    };

    // Look up owner SMS phone (falls back to tenants.phone)
    let ownerSmsPhone = "";
    if (tenantId) {
      const { data: t } = await supabase
        .from("tenants")
        .select("sms_phone, phone")
        .eq("id", tenantId)
        .maybeSingle();
      ownerSmsPhone = (t?.sms_phone as string | null) ?? (t?.phone as string | null) ?? "";
    }

    const smsData: BookingSmsData = {
      businessName,
      serviceName: service_name,
      date: dateStr,
      time: formatTimeRange(booking_time, durationMinutes),
      customerName: customer_name,
      customerPhone: customer_phone,
      businessAddress: businessAddress || undefined,
      addOnNames: validatedAddOns?.map((a) => a.name) ?? [],
      depositAmount: depositAmount > 0 ? depositAmount : undefined,
      depositInstructions: bookingSettings?.deposit_instructions || undefined,
    };

    // Send emails + SMS in background
    const customerEmailPromise = !customer_email
      ? Promise.resolve()
      : isPending
        ? sendBookingPendingDepositEmail(emailData, {
            amount: depositAmount,
            instructions: bookingSettings?.deposit_instructions ?? "",
          })
        : sendBookingConfirmation(emailData);

    const customerSmsPromise = !smsOptIn
      ? Promise.resolve()
      : isPending
        ? sendBookingPendingDepositCustomer(smsData)
        : sendBookingCustomerConfirmation(smsData);

    Promise.allSettled([
      sendBookingNotification(ownerEmail, emailData, icsContent),
      customerEmailPromise,
      sendBookingOwnerNotification(ownerSmsPhone, smsData),
      customerSmsPromise,
    ]).then((results) => {
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("Booking notification failed:", r.reason);
        }
      }
    });

    return NextResponse.json({ success: true, booking_id: booking.id, status: initialStatus, deposit_amount: depositAmount > 0 ? depositAmount : null });
  } catch (error) {
    console.error("Create booking error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
