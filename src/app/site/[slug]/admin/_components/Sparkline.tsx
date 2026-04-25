import type { SparklineBar } from "@/lib/admin-visits";

export function Sparkline({ bars }: { bars: SparklineBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="mt-3">
      <div className="flex items-end gap-1.5 h-12">
        {bars.map((b) => {
          const h = Math.round((b.count / max) * 100);
          return (
            <div key={b.day} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-[var(--admin-primary)] rounded-t"
                style={{ height: Math.max(4, h) + "%" }}
                aria-label={b.day + ": " + b.count}
              />
              <div className="text-[9px] text-[color:var(--admin-primary)] opacity-70 uppercase">{b.day}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
