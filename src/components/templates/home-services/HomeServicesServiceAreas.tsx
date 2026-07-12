"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale, HomeServicesSectionCopy, HomeServicesServiceArea } from "@/lib/home-services/types";
import { getHomeServicesReadable } from "./home-services-theme";
import { HomeServicesSectionHeading } from "./HomeServicesSectionHeading";

export interface HomeServicesServiceAreasProps {
  coverageSummary: string;
  locale: HomeServicesLocale;
  colors: ThemeColors;
  areas: HomeServicesServiceArea[];
  copy: Required<HomeServicesSectionCopy>;
  embedded?: boolean;
}

export function HomeServicesServiceAreas({
  coverageSummary,
  areas,
  copy,
  locale,
  colors,
  embedded = false,
}: HomeServicesServiceAreasProps) {
  const readable = getHomeServicesReadable(colors);

  if (!coverageSummary.trim() && areas.length === 0) {
    return null;
  }

  const content = (
    <div
      id="service-areas"
      className={embedded ? "" : "px-4 py-16 sm:px-6"}
      aria-labelledby="service-areas-heading"
    >
      <div className="mx-auto max-w-6xl">
        <HomeServicesSectionHeading id="service-areas-heading" copy={copy} locale={locale} color={readable.headingOnBg} />
        {coverageSummary && <p className="mb-5 max-w-3xl text-base leading-relaxed" style={{ color: readable.bodyOnBg }}>{coverageSummary}</p>}
        {areas.length > 0 && <ul className="space-y-3">{areas.map((area) => {
          const note = locale === "es" ? area.note_es : area.note_en;
          return <li key={area.id} className="rounded-xl border p-4" style={{ borderColor: `${colors.foreground}12`, backgroundColor: colors.background }}>
            <p className="font-semibold" style={{ color: readable.headingOnBg }}>{area.name}</p>
            {area.zip_codes.length > 0 && <p className="mt-1 text-sm" style={{ color: readable.bodyOnBg }}>{area.zip_codes.join(", ")}</p>}
            {note && <p className="mt-1 text-sm" style={{ color: readable.bodyOnBg }}>{note}</p>}
          </li>;
        })}</ul>}
      </div>
    </div>
  );
  return embedded ? content : <section style={{ backgroundColor: colors.background }}>{content}</section>;
}
