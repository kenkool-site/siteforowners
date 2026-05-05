import type { SparklineBar } from "@/lib/admin-visits";

export function Sparkline({ bars }: { bars: SparklineBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="mt-5">
      {/* Bars row — explicit height so percentage children resolve correctly. */}
      <div className="flex h-20 items-end gap-2">
        {bars.map((b) => {
          const h = Math.round((b.count / max) * 100);
          return (
            <div
              key={b.day}
              className="flex-1 rounded-t-full rounded-b-md bg-gradient-to-t from-pink-300 to-pop-pink"
              style={{ height: Math.max(4, h) + "%" }}
              aria-label={b.day + ": " + b.count}
            />
          );
        })}
      </div>
      {/* Day labels row — separate so they don't compete with bar heights. */}
      <div className="mt-2 flex gap-2">
        {bars.map((b) => (
          <div
            key={b.day}
            className="flex-1 text-center text-[9px] uppercase text-warm-textMuted"
          >
            {b.day}
          </div>
        ))}
      </div>
    </div>
  );
}
