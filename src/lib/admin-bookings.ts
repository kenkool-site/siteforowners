import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type BookingMode =
  | { mode: "in_site_only" }
  | { mode: "external_only"; url: string; providerName: string }
  | { mode: "both"; url: string; providerName: string };

export function detectProvider(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("acuityscheduling.com")) return "Acuity";
  if (lower.includes("booksy")) return "Booksy";
  if (lower.includes("vagaro")) return "Vagaro";
  if (lower.includes("squareup.com") || lower.includes("square.site")) return "Square";
  if (lower.includes("calendly")) return "Calendly";
  return "your booking provider";
}

/**
 * Returns the tenant's booking entry mode, joining `tenants.booking_mode`
 * (the policy) with `previews.generated_copy.booking_url` (the URL).
 *
 * If the policy says external/both but no URL is configured (transient
 * inconsistency, should not happen post-migration), we degrade to
 * in_site_only so the public site always shows a working booking entry.
 */
export async function getBookingMode(previewSlug: string | null): Promise<BookingMode> {
  if (!previewSlug) return { mode: "in_site_only" };
  noStore();
  const supabase = createAdminClient();

  const [{ data: tenant }, { data: preview }] = await Promise.all([
    supabase
      .from("tenants")
      .select("booking_mode")
      .eq("preview_slug", previewSlug)
      .maybeSingle(),
    supabase
      .from("previews")
      .select("generated_copy")
      .eq("slug", previewSlug)
      .maybeSingle(),
  ]);

  const bookingMode = (tenant?.booking_mode as string | undefined) ?? "in_site_only";
  const gc = preview?.generated_copy as Record<string, unknown> | null;
  const bookingUrl = typeof gc?.booking_url === "string" && gc.booking_url.trim().length > 0
    ? (gc.booking_url as string)
    : null;

  if (bookingMode === "in_site_only") return { mode: "in_site_only" };
  if (!bookingUrl) {
    console.warn(
      "[getBookingMode] tenant policy is %s but no booking_url; defaulting to in_site_only",
      { previewSlug, bookingMode },
    );
    return { mode: "in_site_only" };
  }
  if (bookingMode === "external_only") {
    return { mode: "external_only", url: bookingUrl, providerName: detectProvider(bookingUrl) };
  }
  return { mode: "both", url: bookingUrl, providerName: detectProvider(bookingUrl) };
}

export type BookingRow = {
  id: string;
  booking_date: string;
  booking_time: string;
  duration_minutes: number;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  status: string;
};

export type BookingGroup = {
  date: string;
  rows: BookingRow[];
};

/** Group bookings by date ascending. Input order within a date is preserved. */
export function groupBookingsByDate(rows: BookingRow[]): BookingGroup[] {
  const byDate = new Map<string, BookingRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.booking_date) ?? [];
    list.push(r);
    byDate.set(r.booking_date, list);
  }
  const dates = Array.from(byDate.keys()).sort();
  return dates.map((date) => ({ date, rows: byDate.get(date)! }));
}

/** Today (UTC) or later. */
export async function getUpcomingBookings(tenantId: string): Promise<BookingRow[]> {
  noStore();
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, duration_minutes, customer_name, customer_phone, service_name, status")
    .eq("tenant_id", tenantId)
    .gte("booking_date", today)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });
  if (error) {
    console.error("[admin-bookings] getUpcomingBookings failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Today only. */
export async function getTodayBookings(tenantId: string): Promise<BookingRow[]> {
  noStore();
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, duration_minutes, customer_name, customer_phone, service_name, status")
    .eq("tenant_id", tenantId)
    .eq("booking_date", today)
    .order("booking_time", { ascending: true });
  if (error) {
    console.error("[admin-bookings] getTodayBookings failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Bookings whose date is in [startIso, endIso], inclusive. Both YYYY-MM-DD. */
export async function getBookingsForRange(
  tenantId: string,
  startIso: string,
  endIso: string,
): Promise<BookingRow[]> {
  noStore();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, duration_minutes, customer_name, customer_phone, service_name, status")
    .eq("tenant_id", tenantId)
    .gte("booking_date", startIso)
    .lte("booking_date", endIso)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });
  if (error) {
    console.error("[admin-bookings] getBookingsForRange failed", { tenantId, startIso, endIso, error });
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Fetch booking_settings for a tenant (may be null on first load). */
export async function getBookingSettings(tenantId: string): Promise<{
  working_hours: Record<string, { open: string; close: string } | null> | null;
  blocked_dates: string[];
} | null> {
  noStore();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("booking_settings")
    .select("working_hours, blocked_dates")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[admin-bookings] getBookingSettings failed", { tenantId, error });
    return null;
  }
  if (!data) return { working_hours: null, blocked_dates: [] };
  return {
    working_hours: (data.working_hours as Record<string, { open: string; close: string } | null>) ?? null,
    blocked_dates: (data.blocked_dates as string[] | null) ?? [],
  };
}
