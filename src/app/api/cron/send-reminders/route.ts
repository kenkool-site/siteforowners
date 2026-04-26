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

    // Claim the row first (atomic flip with WHERE sms_reminder_sent = false)
    // so a transient send error doesn't trigger a duplicate text on the next
    // run. Trade-off chosen: one missed reminder is better than two
    // back-to-back texts to the same customer.
    const { data: claimed, error: claimErr } = await supabase
      .from("bookings")
      .update({ sms_reminder_sent: true })
      .eq("id", r.id)
      .eq("sms_reminder_sent", false)
      .select("id");
    if (claimErr || !claimed || claimed.length === 0) {
      if (claimErr) console.error("[cron/send-reminders] claim failed", { id: r.id, claimErr });
      // Already claimed by another run, or DB error — skip without sending.
      continue;
    }

    try {
      await sendBookingCustomerReminder(smsData);
      sent++;
    } catch (e) {
      // Row is already flagged sent; we choose not to roll back to avoid
      // duplicate sends on retry. Log loudly so the founder can manually
      // call/text the customer if the SMS infrastructure is down.
      console.error("[cron/send-reminders] send failed AFTER flag set — manual follow-up may be needed", {
        id: r.id,
        customerPhone: r.customer_phone,
        e,
      });
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
