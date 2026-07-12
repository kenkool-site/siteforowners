import { useTranslations } from "next-intl";
import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale, HomeServicesSectionCopy } from "@/lib/home-services/types";
import { getHomeServicesReadable } from "./home-services-theme";
import { HomeServicesSectionHeading } from "./HomeServicesSectionHeading";

export function HomeServicesFinalCta({ copy, locale, phoneHref, messageHref, onEstimate, colors }: { copy: Required<HomeServicesSectionCopy>; locale: HomeServicesLocale; phoneHref: string | null; messageHref: string | null; onEstimate: () => void; colors: ThemeColors }) {
  const t = useTranslations("homeServices"); const readable = getHomeServicesReadable(colors);
  const action = "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold";
  return <section className="px-4 py-16 sm:px-6" style={{ backgroundColor: colors.background }} aria-labelledby="final-cta-heading"><div className="mx-auto max-w-6xl rounded-[2rem] p-7 sm:p-10" style={{ backgroundColor: colors.primary }}>
    <HomeServicesSectionHeading id="final-cta-heading" copy={copy} locale={locale} color={readable.avatarOnPrimary} />
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button type="button" onClick={onEstimate} className={action} style={{ backgroundColor: colors.secondary, color: readable.ctaOnSecondary }}>{t("actions.freeEstimate")}</button>
      {phoneHref && <a href={phoneHref} className={`${action} border border-white/60`} style={{ color: readable.avatarOnPrimary }}>{t("actions.call")}</a>}
      {messageHref && <a href={messageHref} className={`${action} border border-white/60`} style={{ color: readable.avatarOnPrimary }}>{t("actions.message")}</a>}
    </div>
  </div></section>;
}
