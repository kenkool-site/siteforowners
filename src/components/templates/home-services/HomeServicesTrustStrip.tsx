"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale, HomeServicesTrustPoint } from "@/lib/home-services/types";
import { localizedText } from "@/lib/home-services/display";
import { getHomeServicesReadable } from "./home-services-theme";

export interface HomeServicesTrustStripProps {
  trustPoints: HomeServicesTrustPoint[];
  locale: HomeServicesLocale;
  colors: ThemeColors;
}

export function HomeServicesTrustStrip({
  trustPoints,
  locale,
  colors,
}: HomeServicesTrustStripProps) {
  const items = trustPoints
    .map((point) => ({
      id: point.id,
      label: localizedText(locale, { en: point.label_en, es: point.label_es }),
    }))
    .filter((point) => point.label);

  if (items.length === 0) {
    return null;
  }

  const readable = getHomeServicesReadable(colors);

  return (
    <section
      className="border-y px-4 py-8 sm:px-6"
      style={{ backgroundColor: colors.muted, borderColor: `${colors.foreground}12` }}
      aria-label="Trust points"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((point) => (
          <div
            key={point.id}
            className="rounded-2xl border px-4 py-4 text-center text-sm font-semibold leading-snug"
            style={{
              backgroundColor: colors.background,
              borderColor: `${colors.foreground}10`,
              color: readable.bodyOnBg,
            }}
          >
            {point.label}
          </div>
        ))}
      </div>
    </section>
  );
}
