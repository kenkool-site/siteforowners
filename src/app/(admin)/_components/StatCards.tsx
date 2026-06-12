import type { ReactNode } from "react";

type Tone = "default" | "amber" | "green";

const TONE_CLASS: Record<Tone, string> = {
  default: "text-gray-900",
  amber: "text-amber-600",
  green: "text-green-600",
};

export interface Stat {
  label: string;
  value: ReactNode;
  tone?: Tone;
}

/** The 3-across stat strip shared by the admin list pages. Tightens on mobile
 *  (smaller padding + numerals) so three cards don't crowd at 375px. */
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border bg-white p-3 sm:p-5">
          <p className="text-xs text-gray-500 sm:text-sm">{stat.label}</p>
          <p
            className={`mt-1 text-2xl font-bold sm:text-3xl ${
              TONE_CLASS[stat.tone ?? "default"]
            }`}
          >
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
