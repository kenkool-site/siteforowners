import { createAdminClient } from "@/lib/supabase/admin";

export type DateRange = { start: string; end: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Single-day range (start and end both the UTC calendar date of `now`). */
export function todayRange(now: Date = new Date()): DateRange {
  const day = isoDate(now);
  return { start: day, end: day };
}

/** ISO week (Monday through Sunday) containing `now`, as UTC dates. */
export function currentIsoWeekRange(now: Date = new Date()): DateRange {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // shift so Monday=0..Sunday=6
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: isoDate(monday), end: isoDate(sunday) };
}

/** Previous ISO week relative to `now`. */
export function previousIsoWeekRange(now: Date = new Date()): DateRange {
  const current = currentIsoWeekRange(now);
  const mondayLastWeek = new Date(current.start + "T00:00:00Z");
  mondayLastWeek.setUTCDate(mondayLastWeek.getUTCDate() - 7);
  const sundayLastWeek = new Date(mondayLastWeek);
  sundayLastWeek.setUTCDate(mondayLastWeek.getUTCDate() + 6);
  return { start: isoDate(mondayLastWeek), end: isoDate(sundayLastWeek) };
}

export type Rollups = {
  newOrders: number;
  bookingsToday: number;
  unreadLeads: number;
  bookingsThisWeek: number;
};

/** Query all 4 rollup counts in parallel. Errors → 0 for that counter. */
export async function getRollups(tenantId: string): Promise<Rollups> {
  const supabase = createAdminClient();
  const today = todayRange();
  const week = currentIsoWeekRange();

  async function countOrders() {
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "new");
    if (error) console.error("[admin-rollups] countOrders failed", { tenantId, error });
    return count ?? 0;
  }

  async function countBookingsToday() {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "completed"])
      .eq("booking_date", today.start);
    if (error) console.error("[admin-rollups] countBookingsToday failed", { tenantId, error });
    return count ?? 0;
  }

  async function countUnreadLeads() {
    const { count, error } = await supabase
      .from("contact_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_read", false);
    if (error) console.error("[admin-rollups] countUnreadLeads failed", { tenantId, error });
    return count ?? 0;
  }

  async function countBookingsThisWeek() {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "completed"])
      .gte("booking_date", week.start)
      .lte("booking_date", week.end);
    if (error) console.error("[admin-rollups] countBookingsThisWeek failed", { tenantId, error });
    return count ?? 0;
  }

  const [newOrders, bookingsToday, unreadLeads, bookingsThisWeek] = await Promise.all([
    countOrders(),
    countBookingsToday(),
    countUnreadLeads(),
    countBookingsThisWeek(),
  ]);

  return { newOrders, bookingsToday, unreadLeads, bookingsThisWeek };
}
