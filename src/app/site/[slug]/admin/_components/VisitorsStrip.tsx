import type { VisitStats } from "@/lib/admin-visits";
import { Sparkline } from "./Sparkline";

export function VisitorsStrip({ stats }: { stats: VisitStats }) {
  const trendLabel =
    stats.trendPct === null
      ? null
      : (stats.trendPct >= 0 ? "↑ " : "↓ ") +
        Math.abs(stats.trendPct) +
        "% vs last week";
  const trendClass =
    stats.trendPct === null ? "" : stats.trendPct >= 0 ? "text-green-700" : "text-gray-600";

  return (
    <div
      className="mx-3 my-3 md:mx-0 rounded-xl border border-[color:var(--admin-primary-border)] p-4"
      style={{
        background:
          "linear-gradient(135deg, var(--admin-primary-light) 0%, var(--admin-primary-hover) 100%)",
      }}
    >
      <div className="flex justify-between items-baseline">
        <span className="text-xs uppercase tracking-wider font-semibold text-[color:var(--admin-primary)] opacity-70">
          Visitors this week
        </span>
        {trendLabel && <span className={"text-xs font-semibold " + trendClass}>{trendLabel}</span>}
      </div>
      <div className="text-3xl font-bold text-[color:var(--admin-primary)] mt-1 leading-none">{stats.thisWeek}</div>
      <div className="text-xs text-[color:var(--admin-primary)] opacity-70 mt-0.5">
        {stats.thisWeek === 1 ? "Person checked out your site" : "People checked out your site"}
      </div>
      <Sparkline bars={stats.sparkline} />
    </div>
  );
}
