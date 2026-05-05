import type { ActivityEntry } from "@/lib/admin-activity";
import { formatRelative } from "@/lib/admin-activity";

export function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-warm-cream1 bg-white p-6 text-center text-sm font-semibold text-warm-textMuted">
        No activity yet. New bookings, orders, and leads will show up here as they happen.
      </div>
    );
  }
  return (
    <div className="rounded-[1.75rem] border border-warm-cream1 bg-white p-3 shadow-sm">
      {entries.map((e) => (
        <div key={e.key} className="grid grid-cols-[2.25rem_1fr] gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-warm-cream2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-pink-50 text-[10px] font-black text-pop-pink">
            {e.kind.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-black text-warm-deep">{e.title}</div>
            <div className="mt-0.5 text-xs font-semibold text-warm-textMuted">
              {e.subtitle} {"·"} {formatRelative(e.at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
