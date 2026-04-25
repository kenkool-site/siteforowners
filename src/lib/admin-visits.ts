import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentIsoWeekRange, previousIsoWeekRange } from "./admin-rollups";

export type VisitRow = { day: string; count: number };

export type SparklineBar = { day: string; count: number };

export type VisitStats = {
  thisWeek: number;
  lastWeek: number;
  trendPct: number | null;
  sparkline: SparklineBar[]; // 7 bars, Mon → Sun
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDaysIso(day: string, offset: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Shape raw visit rows (up to 14 days) into week stats + sparkline. Pure. */
export function shapeVisits(rows: VisitRow[], now: Date): VisitStats {
  const curr = currentIsoWeekRange(now);
  const prev = previousIsoWeekRange(now);

  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, r.count);

  let thisWeek = 0;
  let lastWeek = 0;
  const sparkline: SparklineBar[] = [];

  for (let i = 0; i < 7; i++) {
    const dayCurr = addDaysIso(curr.start, i);
    const countCurr = byDay.get(dayCurr) ?? 0;
    thisWeek += countCurr;
    sparkline.push({ day: DAY_LABELS[i], count: countCurr });

    const dayPrev = addDaysIso(prev.start, i);
    lastWeek += byDay.get(dayPrev) ?? 0;
  }

  const trendPct = lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return { thisWeek, lastWeek, trendPct, sparkline };
}

/** Fetch visit rows from the start of last week through today. */
export async function getRecentVisits(tenantId: string, now: Date = new Date()): Promise<VisitRow[]> {
  noStore();
  const prev = previousIsoWeekRange(now);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("site_visits")
    .select("day, count")
    .eq("tenant_id", tenantId)
    .gte("day", prev.start);
  if (error) {
    console.error("[admin-visits] getRecentVisits failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as VisitRow[];
}

/** Atomic per-day increment via Postgres function. */
export async function recordVisit(tenantId: string): Promise<void> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.rpc("increment_site_visit", {
    p_tenant_id: tenantId,
    p_day: today,
  });
  if (error) {
    console.error("[admin-visits] recordVisit failed", { tenantId, error });
  }
}

/** Sum of site_visits for the current calendar month (UTC). */
export async function getMonthlyVisitCount(tenantId: string, now: Date = new Date()): Promise<number> {
  noStore();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startIso = start.toISOString().slice(0, 10);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("site_visits")
    .select("count")
    .eq("tenant_id", tenantId)
    .gte("day", startIso);
  if (error) {
    console.error("[admin-visits] getMonthlyVisitCount failed", { tenantId, error });
    return 0;
  }
  return (data ?? []).reduce((sum, row) => sum + (row.count ?? 0), 0);
}
