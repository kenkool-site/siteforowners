import type { ThemeColors } from "@/lib/templates/themes";
import type { BusinessHours } from "@/lib/ai/types";
import { readableColors } from "@/lib/templates/contrast";

interface TemplateFooterProps {
  businessName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  hours?: BusinessHours;
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
  colors,
}: TemplateFooterProps) {
  const rc = readableColors(colors);
  return (
    <footer
      className="px-6 py-16"
      style={{ backgroundColor: colors.foreground }}
    >
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3">
        {/* Brand */}
        <div>
          <h3
            className="mb-3 text-xl font-bold"
            style={{ color: rc.textOnFg }}
          >
            {businessName}
          </h3>
          {tagline && (
            <p className="text-sm opacity-60" style={{ color: rc.textOnFg }}>
              {tagline}
            </p>
          )}
        </div>

        {/* Contact */}
        <div>
          <h4
            className="mb-3 text-sm font-semibold uppercase tracking-wider"
            style={{ color: rc.primaryOnFg }}
          >
            Contact
          </h4>
          {address && (
            <p className="mb-2 text-sm opacity-70" style={{ color: rc.textOnFg }}>
              {address}
            </p>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="text-sm font-medium hover:underline"
              style={{ color: rc.primaryOnFg }}
            >
              {phone}
            </a>
          )}
        </div>

        {/* Hours */}
        {hours && (
          <div>
            <h4
              className="mb-3 text-sm font-semibold uppercase tracking-wider"
              style={{ color: rc.primaryOnFg }}
            >
              Hours
            </h4>
            <div className="space-y-1">
              {DAY_ORDER.map((day) => {
                const h = hours[day];
                if (!h) return null;
                return (
                  <div
                    key={day}
                    className="flex justify-between text-sm opacity-70"
                    style={{ color: rc.textOnFg }}
                  >
                    <span>{day.slice(0, 3)}</span>
                    <span>{h.closed ? "Closed" : `${h.open} – ${h.close}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        className="mx-auto mt-12 max-w-5xl border-t pt-6 text-center text-xs opacity-40"
        style={{
          borderColor: rc.textOnFg + "20",
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
    </footer>
  );
}
