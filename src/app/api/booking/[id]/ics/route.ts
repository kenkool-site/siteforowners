import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateIcs, parseTime } from "@/lib/ics";

/**
 * Public endpoint that returns the .ics for a given booking id. Linked
 * from customer emails ("Add to Apple/Outlook Calendar") instead of
 * attaching the file — Gmail's first-contact banner only fires on
 * attachments, so a clicked link bypasses it.
 *
 * No auth: the booking id is a UUID and the only data exposed is what the
 * customer already has (their own appointment + the business's public
 * info). RLS-protected fields aren't included.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("tenant_id, service_name, service_price, booking_date, booking_time, duration_minutes, customer_name, customer_phone, customer_email, customer_notes, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status === "canceled") {
    return NextResponse.json({ error: "Booking is canceled" }, { status: 410 });
  }

  let businessName = "Business";
  let businessAddress = "";
  if (booking.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, address")
      .eq("id", booking.tenant_id)
      .maybeSingle();
    if (tenant) {
      businessName = tenant.business_name || businessName;
      businessAddress = tenant.address || "";
    }
  }

  const dateObj = new Date(booking.booking_date + "T00:00:00");
  const { hours, minutes } = parseTime(booking.booking_time);
  const startDate = new Date(dateObj);
  startDate.setHours(hours, minutes, 0);
  const durationMinutes = (booking.duration_minutes as number) ?? 60;
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const icsContent = generateIcs({
    title: `${booking.service_name} — ${businessName}`,
    description: `Service: ${booking.service_name}${booking.service_price ? ` (${booking.service_price})` : ""}\nCustomer: ${booking.customer_name}\nPhone: ${booking.customer_phone}${booking.customer_notes ? `\nNotes: ${booking.customer_notes}` : ""}`,
    location: businessAddress || undefined,
    startDate,
    endDate,
    organizerName: businessName,
    attendeeName: booking.customer_name,
    attendeeEmail: booking.customer_email || undefined,
  });

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
