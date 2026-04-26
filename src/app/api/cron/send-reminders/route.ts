import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingCustomerReminder,
  isReminderDue,
  tomorrowIsoUtc,
  type BookingSmsData,
  type ReminderRow,
} from "@/lib/sms";
import { formatTimeRange } from "@/lib/availability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tomorrowIso = tomorrowIsoUtc(new Date());

  // INNER JOIN tenants → drops orphan bookings (preview/marketing artifacts).
  const { data: rows, error } = await supabase
    .from("bookings")
    .select(`
      id, booking_date, booking_time, duration_minutes, status,
      customer_name, customer_phone, customer_sms_opt_in, sms_reminder_sent,
      service_name, tenants!inner(business_name, address)
    `)
    .eq("booking_date", tomorrowIso)
    .eq("status", "confirmed")
    .eq("customer_sms_opt_in", true)
    .eq("sms_reminder_sent", false);

  if (error) {
    console.error("[cron/send-reminders] query failed", { error });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    // Belt-and-suspenders: re-check the predicate even though SQL filtered.
    const reminderRow: ReminderRow = {
      id: r.id as string,
      booking_date: r.booking_date as string,
      status: r.status as string,
      customer_sms_opt_in: r.customer_sms_opt_in as boolean,
      sms_reminder_sent: r.sms_reminder_sent as boolean,
    };
    if (!isReminderDue(reminderRow, tomorrowIso)) continue;

    const tenant = (r as { tenants?: { business_name?: string; address?: string } }).tenants;
    const dateLabel = formatDateLabel(r.booking_date as string);
    const smsData: BookingSmsData = {
      businessName: tenant?.business_name ?? "your appointment",
      serviceName: r.service_name as string,
      date: dateLabel,
      time: formatTimeRange(r.booking_time as string, (r.duration_minutes as number) ?? 60),
      customerName: r.customer_name as string,
      customerPhone: r.customer_phone as string,
      businessAddress: tenant?.address ?? undefined,
    };

    try {
      await sendBookingCustomerReminder(smsData);
      const { error: upErr } = await supabase
        .from("bookings")
        .update({ sms_reminder_sent: true })
        .eq("id", r.id);
      if (upErr) {
        console.error("[cron/send-reminders] flag update failed", { id: r.id, upErr });
        failed++;
      } else {
        sent++;
      }
    } catch (e) {
      console.error("[cron/send-reminders] send threw", { id: r.id, e });
      failed++;
    }
  }

  return NextResponse.json({ tomorrow: tomorrowIso, sent, failed });
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
