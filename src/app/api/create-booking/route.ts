import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateIcs, parseTime } from "@/lib/ics";
import { sendBookingNotification, sendBookingConfirmation } from "@/lib/email";
import { wouldExceedCapacity, parseBookingTime, formatTimeRange } from "@/lib/availability";
import {
  sendBookingOwnerNotification,
  sendBookingCustomerConfirmation,
  type BookingSmsData,
} from "@/lib/sms";
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
    if (durationMinutes < 30 || durationMinutes > 480 || durationMinutes % 30 !== 0) {
      return NextResponse.json(
        { error: "duration_minutes must be a multiple of 30 between 30 and 480 minutes" },
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

    // Check for conflicts
    if (tenantId) {
      const { data: settings } = await supabase
        .from("booking_settings")
        .select("max_per_slot")
        .eq("tenant_id", tenantId)
        .single();

      const maxPerSlot = settings?.max_per_slot || 1;

      const { data: sameDay } = await supabase
        .from("bookings")
        .select("booking_time, duration_minutes")
        .eq("tenant_id", tenantId)
        .eq("booking_date", booking_date)
        .eq("status", "confirmed");

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

    // Generate .ics
    const icsContent = generateIcs({
      title: `${service_name} — ${businessName}`,
      description: `Service: ${service_name}${service_price ? ` (${service_price})` : ""}\nCustomer: ${customer_name}\nPhone: ${customer_phone}${customer_notes ? `\nNotes: ${customer_notes}` : ""}`,
      location: businessAddress || undefined,
      startDate,
      endDate,
      organizerName: businessName,
      attendeeName: customer_name,
      attendeeEmail: customer_email || undefined,
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
    };

    // Send emails + SMS in background
    Promise.allSettled([
      sendBookingNotification(ownerEmail, emailData, icsContent),
      sendBookingConfirmation(emailData, icsContent),
      sendBookingOwnerNotification(ownerSmsPhone, smsData),
      smsOptIn ? sendBookingCustomerConfirmation(smsData) : Promise.resolve(),
    ]).then((results) => {
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("Booking notification failed:", r.reason);
        }
      }
    });

    return NextResponse.json({ success: true, booking_id: booking.id });
  } catch (error) {
    console.error("Create booking error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
