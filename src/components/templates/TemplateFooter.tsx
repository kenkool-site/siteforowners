import type { ThemeColors } from "@/lib/templates/themes";
import type { BusinessHours } from "@/lib/ai/types";

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
            style={{ color: colors.background }}
          >
            {businessName}
          </h3>
          {tagline && (
            <p className="text-sm opacity-60" style={{ color: colors.background }}>
              {tagline}
            </p>
          )}
        </div>

        {/* Contact */}
        <div>
          <h4
            className="mb-3 text-sm font-semibold uppercase tracking-wider"
            style={{ color: colors.primary }}
          >
            Contact
          </h4>
          {address && (
            <p className="mb-2 text-sm opacity-70" style={{ color: colors.background }}>
              {address}
            </p>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="text-sm font-medium hover:underline"
              style={{ color: colors.primary }}
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
              style={{ color: colors.primary }}
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
                    style={{ color: colors.background }}
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
          borderColor: colors.background + "20",
          color: colors.background,
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
