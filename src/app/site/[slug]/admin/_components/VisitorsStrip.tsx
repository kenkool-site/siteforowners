import type { VisitStats } from "@/lib/admin-visits";
import { Sparkline } from "./Sparkline";

export function VisitorsStrip({
  stats,
  thisMonth,
}: {
  stats: VisitStats;
  thisMonth: number;
}) {
  const trendLabel =
    stats.trendPct === null
      ? null
      : (stats.trendPct >= 0 ? "↑ " : "↓ ") +
        Math.abs(stats.trendPct) +
        "% vs last week";
  const trendClass =
    stats.trendPct === null ? "" : stats.trendPct >= 0 ? "text-emerald-700" : "text-warm-textMuted";

  return (
    <div
      className="rounded-[1.75rem] border border-warm-cream1 bg-white p-5 shadow-sm"
    >
      <div className="flex justify-between items-baseline">
        <span className="text-xs uppercase tracking-[0.18em] font-black text-warm-textMuted">
          Visitors this week
        </span>
        {trendLabel && <span className={"text-xs font-semibold " + trendClass}>{trendLabel}</span>}
      </div>
      <div className="mt-4 text-5xl font-black leading-none text-warm-deep">{stats.thisWeek}</div>
      <div className="mt-1 text-sm font-semibold text-warm-textMuted">
        {stats.thisWeek === 1 ? "Person checked out your site" : "People checked out your site"}
      </div>
      <Sparkline bars={stats.sparkline} />
      <div className="mt-4 flex justify-between border-t border-warm-cream1 pt-4 text-xs">
        <span className="font-bold text-warm-textMuted">This month</span>
        <span className="font-black text-warm-deep">
          {thisMonth} {thisMonth === 1 ? "visitor" : "visitors"}
        </span>
      </div>
    </div>
  );
}
