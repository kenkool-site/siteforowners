import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateIcs, parseTime } from "@/lib/ics";
import { sendBookingNotification, sendBookingConfirmation } from "@/lib/email";
import { wouldExceedCapacity, parseBookingTime } from "@/lib/availability";

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
    } = body;

    if (!preview_slug || !service_name || !booking_date || !booking_time || !customer_name || !customer_phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const durationMinutes = Number.isInteger(duration_minutes) ? Number(duration_minutes) : 60;
    if (durationMinutes < 60 || durationMinutes > 480 || durationMinutes % 60 !== 0) {
      return NextResponse.json(
        { error: "duration_minutes must be a whole number of hours between 1 and 8" },
        { status: 400 }
      );
    }

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

    // Send emails in background
    Promise.allSettled([
      sendBookingNotification(ownerEmail, emailData, icsContent),
      sendBookingConfirmation(emailData, icsContent),
    ]).then((results) => {
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("Booking email failed:", r.reason);
        }
      }
    });

    return NextResponse.json({ success: true, booking_id: booking.id });
  } catch (error) {
    console.error("Create booking error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
