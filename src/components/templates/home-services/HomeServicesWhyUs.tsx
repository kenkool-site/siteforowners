"use client";

import { useTranslations } from "next-intl";
import { Clock, Leaf, Shield, Sparkles, Users } from "lucide-react";
import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale, HomeServicesWhyUsPoint } from "@/lib/home-services/types";
import { localizedText } from "@/lib/home-services/display";
import { ensureReadable } from "@/lib/templates/contrast";

export interface HomeServicesWhyUsProps {
  points: HomeServicesWhyUsPoint[];
  locale: HomeServicesLocale;
  colors: ThemeColors;
}

const ICONS = [Shield, Users, Clock, Leaf, Sparkles];

export function HomeServicesWhyUs({
  points,
  locale,
  colors,
}: HomeServicesWhyUsProps) {
  const t = useTranslations("homeServices");
  const headingColor = ensureReadable(colors.background, colors.primary);
  const textColor = ensureReadable(colors.background, colors.foreground);
  const iconColor = ensureReadable(colors.background, colors.secondary, 3);

  const visiblePoints = points.flatMap((point) => {
    const title = localizedText(locale, { en: point.title_en, es: point.title_es });
    if (!title) return [];
    const body = localizedText(locale, { en: point.body_en, es: point.body_es });
    return [{ id: point.id, title, body }];
  });

  if (visiblePoints.length === 0) {
    return null;
  }

  return (
    <section
      className="px-4 py-16 sm:px-6"
      style={{ backgroundColor: colors.background }}
      aria-labelledby="why-us-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="why-us-heading"
          className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ color: headingColor }}
        >
          {t("sections.whyUs")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {visiblePoints.map((point, index) => {
            const Icon = ICONS[index % ICONS.length];
            return (
              <div
                key={point.id}
                className="flex gap-4 rounded-2xl border p-5"
                style={{
                  backgroundColor: colors.muted,
                  borderColor: `${colors.foreground}10`,
                }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${colors.secondary}18`, color: iconColor }}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: headingColor }}>
                    {point.title}
                  </h3>
                  {point.body && (
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: textColor, opacity: 0.85 }}>
                      {point.body}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
