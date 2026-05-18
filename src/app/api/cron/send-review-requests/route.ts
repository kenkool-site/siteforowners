import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReviewSmsDue, reviewRequestDelayMs } from "@/lib/booking-review-eligibility";
import { sendBookingCustomerReviewRequest } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LOOKBACK_DAYS = 120;

function calendarIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const delayMs = reviewRequestDelayMs();

  const todayIso = calendarIsoLocal(now);
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - LOOKBACK_DAYS);
  const cutoffIso = calendarIsoLocal(cutoffDate);

  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from("bookings")
    .select(
      "id, preview_slug, booking_date, booking_time, duration_minutes, status, customer_name, customer_phone, customer_sms_opt_in, sms_review_request_sent",
    )
    .eq("status", "confirmed")
    .eq("customer_sms_opt_in", true)
    .eq("sms_review_request_sent", false)
    .gte("booking_date", cutoffIso)
    .lte("booking_date", todayIso);

  if (error) {
    console.error("[cron/send-review-requests] query failed", { error });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const slugs = Array.from(new Set((rows ?? []).map((r) => r.preview_slug as string)));
  /** Display name: tenants.business_name overrides previews.business_name when set. */
  const bizNameBySlug = new Map<string, string>();
  const reviewBySlug = new Map<string, string>();

  if (slugs.length > 0) {
    const [{ data: previews, error: prevErr }, { data: tenantsRows, error: tenErr }] = await Promise.all([
      supabase
        .from("previews")
        .select("slug, google_review_url, business_name")
        .in("slug", slugs),
      supabase.from("tenants").select("preview_slug, business_name").in("preview_slug", slugs),
    ]);

    if (prevErr) {
      console.error("[cron/send-review-requests] previews lookup failed", { prevErr });
      return NextResponse.json({ error: "Previews lookup failed" }, { status: 500 });
    }
    if (tenErr) {
      console.error("[cron/send-review-requests] tenants lookup failed", { tenErr });
      return NextResponse.json({ error: "Tenants lookup failed" }, { status: 500 });
    }

    for (const p of previews ?? []) {
      const slug = p.slug as string;
      const url = (p.google_review_url as string | null)?.trim();
      if (url) reviewBySlug.set(slug, url);
      const previewBiz = ((p.business_name as string | null) || "").trim();
      if (previewBiz) bizNameBySlug.set(slug, previewBiz);
    }
    for (const t of tenantsRows ?? []) {
      const slug = t.preview_slug as string;
      const tn = ((t.business_name as string | null) || "").trim();
      if (tn) bizNameBySlug.set(slug, tn);
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of rows ?? []) {
    const previewSlug = r.preview_slug as string;
    const reviewUrl = reviewBySlug.get(previewSlug);
    if (!reviewUrl) {
      skipped++;
      continue;
    }

    const duration = Number(r.duration_minutes) || 60;
    let due: boolean;
    try {
      due = isReviewSmsDue(now, r.booking_date as string, r.booking_time as string, duration, delayMs);
    } catch {
      skipped++;
      continue;
    }
    if (!due) continue;

    const { data: claimed, error: claimErr } = await supabase
      .from("bookings")
      .update({ sms_review_request_sent: true })
      .eq("id", r.id)
      .eq("sms_review_request_sent", false)
      .eq("customer_sms_opt_in", true)
      .eq("status", "confirmed")
      .select("id");

    if (claimErr || !claimed || claimed.length === 0) {
      if (claimErr) console.error("[cron/send-review-requests] claim failed", { id: r.id, claimErr });
      skipped++;
      continue;
    }

    try {
      const bizName =
        bizNameBySlug.get(previewSlug)?.trim() || "your appointment";

      await sendBookingCustomerReviewRequest(
        r.customer_phone as string,
        r.customer_name as string,
        bizName,
        reviewUrl,
      );
      sent++;
    } catch (e) {
      console.error("[cron/send-review-requests] send failed AFTER flag set", {
        id: r.id,
        customer_phone: r.customer_phone,
        e,
      });
      failed++;
    }
  }

  return NextResponse.json({
    now: now.toISOString(),
    delayMs,
    cutoffIso,
    todayIso,
    candidates: rows?.length ?? 0,
    sent,
    skipped,
    failed,
  });
}
