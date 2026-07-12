"use client";

import { useTranslations } from "next-intl";
import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import { ensureReadable } from "@/lib/templates/contrast";

export interface HomeServicesServiceAreasProps {
  coverageSummary: string;
  locale: HomeServicesLocale;
  colors: ThemeColors;
}

export function HomeServicesServiceAreas({
  coverageSummary,
  colors,
}: HomeServicesServiceAreasProps) {
  const t = useTranslations("homeServices");
  const headingColor = ensureReadable(colors.background, colors.primary);
  const textColor = ensureReadable(colors.background, colors.foreground);

  if (!coverageSummary.trim()) {
    return null;
  }

  return (
    <section
      id="service-areas"
      className="px-4 py-16 sm:px-6"
      style={{ backgroundColor: colors.background }}
      aria-labelledby="service-areas-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="service-areas-heading"
          className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ color: headingColor }}
        >
          {t("sections.serviceAreas")}
        </h2>
        <p className="max-w-3xl text-base leading-relaxed" style={{ color: textColor, opacity: 0.9 }}>
          {coverageSummary}
        </p>
      </div>
    </section>
  );
}
