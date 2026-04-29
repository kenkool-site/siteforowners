import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingDepositReceivedCustomer,
  sendBookingCanceledCustomer,
  type BookingSmsData,
} from "@/lib/sms";
import {
  sendBookingDepositReceivedEmail,
  sendBookingCanceledEmail,
} from "@/lib/email";
import { parseTime } from "@/lib/ics";
import { googleCalendarUrl } from "@/lib/calendar-links";
import { formatTimeRange } from "@/lib/availability";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["pending", "confirmed", "completed", "canceled", "no_show"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const bookingId = typeof b.bookingId === "string" ? b.bookingId : "";
  const toStatus = typeof b.toStatus === "string" ? b.toStatus : "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }
  if (!ALLOWED.includes(toStatus)) {
    return NextResponse.json({ error: "invalid toStatus" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("bookings")
    .select("tenant_id, status, service_name, booking_date, booking_time, duration_minutes, customer_name, customer_phone, customer_email, customer_sms_opt_in")
    .eq("id", bookingId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // State-machine guard. Allowed transitions:
  //   pending   → confirmed | canceled
  //   confirmed → canceled | completed | no_show
  //   others    → no transitions out (terminal)
  const fromStatus = (row.status as string) ?? "confirmed";
  const allowedTransitions: Record<string, string[]> = {
    pending: ["confirmed", "canceled"],
    confirmed: ["canceled", "completed", "no_show"],
    canceled: [],
    completed: [],
    no_show: [],
  };
  if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
    return NextResponse.json(
      { error: `cannot transition from '${fromStatus}' to '${toStatus}'` },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: toStatus })
    .eq("id", bookingId);
  if (error) {
    console.error("[admin/bookings/status] update failed", { bookingId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Fire customer notifications on the two most user-visible transitions:
  //   pending → confirmed  → deposit-received notification
  //   any     → canceled   → cancellation notification
  const fireCustomerNotification = async () => {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, address, phone, email, preview_slug")
      .eq("id", row.tenant_id as string)
      .maybeSingle();
    const businessName = (tenant?.business_name as string) || "Business";
    const businessAddress = (tenant?.address as string) || "";

    const dateObj = new Date((row.booking_date as string) + "T00:00:00");
    const dayName = DAYS[dateObj.getDay()];
    const monthName = MONTHS[dateObj.getMonth()];
    const dateStr = `${dayName}, ${monthName} ${dateObj.getDate()}`;
    const durationMinutes = (row.duration_minutes as number) ?? 60;

    const smsData: BookingSmsData = {
      businessName,
      serviceName: row.service_name as string,
      date: dateStr,
      time: formatTimeRange(row.booking_time as string, durationMinutes),
      customerName: row.customer_name as string,
      customerPhone: row.customer_phone as string,
      businessAddress: businessAddress || undefined,
    };

    const emailData = {
      businessName,
      businessPhone: (tenant?.phone as string) || "",
      businessAddress,
      serviceName: row.service_name as string,
      date: dateStr,
      time: row.booking_time as string,
      customerName: row.customer_name as string,
      customerPhone: row.customer_phone as string,
      customerEmail: (row.customer_email as string) || undefined,
      ownerEmail: (tenant?.email as string) || undefined,
      previewSlug: (tenant?.preview_slug as string) || undefined,
    };

    if (fromStatus === "pending" && toStatus === "confirmed") {
      // Calendar buttons in the customer email get the same data the .ics
      // route uses; no inline .ics generation needed since the email body
      // links to the hosted endpoint.
      const { hours, minutes } = parseTime(row.booking_time as string);
      const startDate = new Date(dateObj);
      startDate.setHours(hours, minutes, 0);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
      const gcalUrl = googleCalendarUrl({
        title: `${row.service_name} — ${businessName}`,
        description: `Service: ${row.service_name}\nCustomer: ${row.customer_name}`,
        location: businessAddress || undefined,
        startDate,
        endDate,
      });
      const customerEmailData = { ...emailData, bookingId, googleCalendarUrl: gcalUrl };

      await Promise.allSettled([
        emailData.customerEmail ? sendBookingDepositReceivedEmail(customerEmailData) : Promise.resolve(),
        row.customer_sms_opt_in ? sendBookingDepositReceivedCustomer(smsData) : Promise.resolve(),
      ]);
    } else if (toStatus === "canceled") {
      await Promise.allSettled([
        emailData.customerEmail ? sendBookingCanceledEmail(emailData) : Promise.resolve(),
        row.customer_sms_opt_in ? sendBookingCanceledCustomer(smsData) : Promise.resolve(),
      ]);
    }
  };

  // Fire-and-forget the notification — don't make the owner wait.
  fireCustomerNotification().catch((err) => {
    console.error("[admin/bookings/status] notification failed", err);
  });

  return NextResponse.json({ ok: true });
}
