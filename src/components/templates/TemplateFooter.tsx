import type { ThemeColors } from "@/lib/templates/themes";
import type { BusinessHours } from "@/lib/ai/types";
import { readableColors } from "@/lib/templates/contrast";
import { resolveDisplayHours } from "@/lib/defaults/businessHours";

interface TemplateFooterProps {
  businessName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  hours?: BusinessHours;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  showHours?: boolean;
  colors: ThemeColors;
}

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function TemplateFooter({
  businessName,
  tagline,
  address,
  phone,
  hours,
  bookingHours = null,
  showHours = true,
  colors,
}: TemplateFooterProps) {
  const rc = readableColors(colors);
  const displayHours = showHours ? resolveDisplayHours(bookingHours, hours) : null;
  return (
    <footer
      className="px-6 py-20"
      style={{ backgroundColor: colors.foreground }}
    >
      <div className="mx-auto max-w-6xl">
        <div
          className="rounded-[2rem] border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] md:p-8"
          style={{
            backgroundColor: `${colors.background}0D`,
            borderColor: `${rc.textOnFg}1A`,
          }}
        >
          <div className="grid gap-6 md:grid-cols-[1.25fr_1fr_1.15fr]">
        {/* Brand */}
        <div className="rounded-[2rem] p-2">
          <h3
            className="mb-3 text-2xl font-bold tracking-tight"
            style={{ color: rc.textOnFg }}
          >
            {businessName}
          </h3>
          {tagline && (
            <p className="max-w-sm text-sm leading-6 opacity-70" style={{ color: rc.textOnFg }}>
              {tagline}
            </p>
          )}
        </div>

        {/* Contact */}
        <div
          className="rounded-[2rem] border p-5"
          style={{ borderColor: `${rc.textOnFg}14`, backgroundColor: `${colors.background}0A` }}
        >
          <h4
            className="mb-3 text-sm font-semibold uppercase tracking-wider"
            style={{ color: rc.primaryOnFg }}
          >
            Contact
          </h4>
          {address && (
            <p className="mb-3 text-sm leading-6 opacity-75" style={{ color: rc.textOnFg }}>
              {address}
            </p>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex rounded-full border px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: rc.primaryOnFg, borderColor: `${rc.primaryOnFg}33` }}
            >
              {phone}
            </a>
          )}
        </div>

        {/* Hours */}
        {displayHours && (
          <div
            className="rounded-[2rem] border p-5"
            style={{ borderColor: `${rc.textOnFg}14`, backgroundColor: `${colors.background}0A` }}
          >
            <h4
              className="mb-4 text-sm font-semibold uppercase tracking-wider"
              style={{ color: rc.primaryOnFg }}
            >
              Hours
            </h4>
            <div className="space-y-2">
              {DAY_ORDER.map((day) => {
                const h = displayHours[day];
                if (!h) return null;
                return (
                  <div
                    key={day}
                    className="flex justify-between gap-4 border-b pb-2 text-sm last:border-0 last:pb-0"
                    style={{ color: rc.textOnFg, borderColor: `${rc.textOnFg}12` }}
                  >
                    <span className="opacity-65">{day.slice(0, 3)}</span>
                    <span className="text-right font-medium opacity-85">{h.closed ? "Closed" : `${h.open} – ${h.close}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </div>
        </div>

        <div
          className="mt-8 text-center text-xs opacity-50"
          style={{
            color: rc.textOnFg,
          }}
        >
          &copy; {new Date().getFullYear()} {businessName}. Powered by{" "}
          <a
            href="https://siteforowners.com"
            className="underline hover:opacity-80"
            target="_blank"
            rel="noopener noreferrer"
          >
            SiteForOwners
          </a>
        </div>
      </div>
    </footer>
  );
}
