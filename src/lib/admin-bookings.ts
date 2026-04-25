import { createAdminClient } from "@/lib/supabase/admin";

export type BookingRow = {
  id: string;
  booking_date: string;
  booking_time: string;
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
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, customer_name, customer_phone, service_name, status")
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
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, customer_name, customer_phone, service_name, status")
    .eq("tenant_id", tenantId)
    .eq("booking_date", today)
    .order("booking_time", { ascending: true });
  if (error) {
    console.error("[admin-bookings] getTodayBookings failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Fetch booking_settings for a tenant (may be null on first load). */
export async function getBookingSettings(tenantId: string): Promise<{
  working_hours: Record<string, { open: string; close: string } | null> | null;
  blocked_dates: string[];
} | null> {
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
