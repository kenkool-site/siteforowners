import type { ActivityEntry } from "@/lib/admin-activity";
import { formatRelative } from "@/lib/admin-activity";

export function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="mx-3 md:mx-0 bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-500 text-center">
        No activity yet. New bookings, orders, and leads will show up here.
      </div>
    );
  }
  return (
    <div className="mx-3 md:mx-0 bg-white border border-gray-200 rounded-lg">
      {entries.map((e) => (
        <div key={e.key} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
          <div className="text-sm font-medium">{e.title}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {e.subtitle} {"·"} {formatRelative(e.at)}
          </div>
        </div>
      ))}
    </div>
  );
}
