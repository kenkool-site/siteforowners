import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/reschedule-token";
import { parseTime } from "@/lib/ics";
import { RescheduleFallback } from "./_components/RescheduleFallback";
import { ReschedulePicker } from "./_components/ReschedulePicker";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReschedulePage({
  searchParams,
}: {
  searchParams: { b?: string; e?: string; s?: string };
}) {
  const bookingId = searchParams.b;
  const expiry = searchParams.e ? Number(searchParams.e) : NaN;
  const signature = searchParams.s;

  if (!bookingId || !Number.isFinite(expiry) || !signature) {
    return <RescheduleFallback reason="invalid_token" />;
  }

  const tok = verifyToken({ bookingId, expiry, signature });
  if (!tok.ok) {
    return <RescheduleFallback reason={tok.reason === "expired" ? "expired" : "invalid_token"} />;
  }

  const supabase = createAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, tenant_id, service_name, service_price, duration_minutes, booking_date, booking_time, customer_name, customer_phone, customer_email, status, reschedule_count",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return <RescheduleFallback reason="not_found" />;

  let businessName = "";
  let businessPhone = "";
  let previewSlug = "";
  let workingHours: Record<string, { open: string; close: string } | null> | null = null;
  let blockedDates: string[] = [];
  if (booking.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, phone, preview_slug")
      .eq("id", booking.tenant_id)
      .maybeSingle();
    businessName = (tenant?.business_name as string) || "";
    businessPhone = (tenant?.phone as string) || "";
    previewSlug = (tenant?.preview_slug as string) || "";

    const { data: settings } = await supabase
      .from("booking_settings")
      .select("working_hours, blocked_dates")
      .eq("tenant_id", booking.tenant_id)
      .maybeSingle();
    workingHours = (settings?.working_hours as typeof workingHours) ?? null;
    blockedDates = (settings?.blocked_dates as string[] | null) ?? [];
  }

  if (["canceled", "completed", "no_show"].includes(booking.status as string)) {
    return (
      <RescheduleFallback
        reason="inactive"
        businessPhone={businessPhone}
        businessName={businessName}
      />
    );
  }
  if ((booking.reschedule_count as number) >= 1) {
    return (
      <RescheduleFallback
        reason="already_rescheduled"
        businessPhone={businessPhone}
        businessName={businessName}
      />
    );
  }

  const originalStart = new Date((booking.booking_date as string) + "T00:00:00");
  const orig = parseTime(booking.booking_time as string);
  originalStart.setHours(orig.hours, orig.minutes, 0, 0);
  if (originalStart.getTime() - Date.now() < TWENTY_FOUR_HOURS_MS) {
    return (
      <RescheduleFallback
        reason="inside_24h"
        businessPhone={businessPhone}
        businessName={businessName}
      />
    );
  }

  if (!previewSlug) notFound();

  return (
    <ReschedulePicker
      bookingId={booking.id as string}
      previewSlug={previewSlug}
      tenantId={booking.tenant_id as string}
      businessName={businessName}
      service={{
        name: booking.service_name as string,
        price: (booking.service_price as string | null) ?? "",
        duration_minutes: (booking.duration_minutes as number) ?? 60,
      }}
      customer={{
        name: booking.customer_name as string,
        phone: booking.customer_phone as string,
        email: (booking.customer_email as string | null) ?? "",
      }}
      originalDate={booking.booking_date as string}
      originalTime={booking.booking_time as string}
      workingHours={workingHours}
      blockedDates={blockedDates}
      tokenExpiry={expiry}
      tokenSignature={signature}
    />
  );
}
