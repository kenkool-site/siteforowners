import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale, HomeServicesProcessStep, HomeServicesSectionCopy } from "@/lib/home-services/types";
import { getHomeServicesReadable } from "./home-services-theme";
import { HomeServicesSectionHeading } from "./HomeServicesSectionHeading";

export function HomeServicesProcess({ steps, copy, locale, colors }: { steps: HomeServicesProcessStep[]; copy: Required<HomeServicesSectionCopy>; locale: HomeServicesLocale; colors: ThemeColors }) {
  const readable = getHomeServicesReadable(colors);
  const suffix = locale === "es" ? "es" : "en";
  return <section className="px-4 py-16 sm:px-6" style={{ backgroundColor: colors.background }} aria-labelledby="process-heading">
    <div className="mx-auto max-w-6xl">
      <HomeServicesSectionHeading id="process-heading" copy={copy} locale={locale} color={readable.headingOnBg} />
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step, index) => <li key={step.id} className="rounded-2xl border p-6" style={{ backgroundColor: colors.muted, borderColor: `${colors.foreground}10` }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: colors.primary, color: readable.avatarOnPrimary }}>{index + 1}</span>
          <h3 className="mt-4 text-lg font-semibold" style={{ color: readable.cardHeadingOnMuted }}>{step[`title_${suffix}`]}</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: readable.cardBodyOnMuted }}>{step[`body_${suffix}`]}</p>
        </li>)}
      </ol>
    </div>
  </section>;
}
