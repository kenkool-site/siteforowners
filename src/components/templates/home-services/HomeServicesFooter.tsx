"use client";

import { useTranslations } from "next-intl";
import type { BusinessHours, SocialLinks } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { resolveDisplayHours } from "@/lib/defaults/businessHours";
import { buildTelHref } from "@/lib/home-services/urls";
import { TemplateSocialLinks } from "../TemplateSocialLinks";

export interface HomeServicesFooterProps {
  businessName: string;
  phone?: string;
  hours?: BusinessHours;
  socialLinks?: SocialLinks | null;
  coverageSummary?: string;
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

export function HomeServicesFooter({
  businessName,
  phone,
  hours,
  socialLinks,
  coverageSummary,
  colors,
}: HomeServicesFooterProps) {
  const t = useTranslations("homeServices");
  const rc = readableColors(colors);
  const displayHours = resolveDisplayHours(null, hours);
  const phoneHref = phone ? buildTelHref(phone) : null;

  return (
    <footer
      className="px-4 py-16 sm:px-6"
      style={{ backgroundColor: colors.foreground }}
    >
      <div className="mx-auto max-w-6xl">
        <div
          className="rounded-[2rem] border p-6 md:p-8"
          style={{
            backgroundColor: `${colors.background}0D`,
            borderColor: `${rc.textOnFg}1A`,
          }}
        >
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <h3 className="text-2xl font-bold tracking-tight" style={{ color: rc.textOnFg }}>
                {businessName}
              </h3>
              {coverageSummary && (
                <p className="mt-3 max-w-md text-sm leading-6 opacity-75" style={{ color: rc.textOnFg }}>
                  {coverageSummary}
                </p>
              )}
              <div className="mt-5">
                <TemplateSocialLinks links={socialLinks} colors={colors} variant="footer" />
              </div>
            </div>

            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: `${rc.textOnFg}14`, backgroundColor: `${colors.background}0A` }}
            >
              <h4
                className="mb-3 text-sm font-semibold uppercase tracking-wider"
                style={{ color: rc.primaryOnFg }}
              >
                {t("footer.contact")}
              </h4>
              {phoneHref && phone && (
                <a
                  href={phoneHref}
                  className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ color: rc.primaryOnFg, borderColor: `${rc.primaryOnFg}33` }}
                >
                  {phone}
                </a>
              )}
            </div>

            {displayHours && (
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: `${rc.textOnFg}14`, backgroundColor: `${colors.background}0A` }}
              >
                <h4
                  className="mb-4 text-sm font-semibold uppercase tracking-wider"
                  style={{ color: rc.primaryOnFg }}
                >
                  {t("footer.hours")}
                </h4>
                <div className="space-y-2">
                  {DAY_ORDER.map((day) => {
                    const dayHours = displayHours[day];
                    if (!dayHours) return null;
                    return (
                      <div
                        key={day}
                        className="flex justify-between gap-4 border-b pb-2 text-sm last:border-0 last:pb-0"
                        style={{ color: rc.textOnFg, borderColor: `${rc.textOnFg}12` }}
                      >
                        <span className="opacity-65">{day.slice(0, 3)}</span>
                        <span className="text-right font-medium opacity-85">
                          {dayHours.closed ? t("footer.closed") : `${dayHours.open} – ${dayHours.close}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs opacity-50" style={{ color: rc.textOnFg }}>
          &copy; {new Date().getFullYear()} {businessName}. Powered by{" "}
          <a
            href="https://siteforowners.com"
            className="underline hover:opacity-80"
            target="_blank"
            rel="noopener noreferrer"
          >
            SiteForOwners
          </a>
        </p>
      </div>
    </footer>
  );
}
