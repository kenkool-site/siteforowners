"use client";

import { useTranslations } from "next-intl";

export function InviteSpotPricing() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8C6B6F]">{t("pricing.heading")}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {(["tier1", "tier2", "tier3"] as const).map((key) => (
          <div key={key} className="rounded-xl border border-[#EAD9D3] bg-white p-5">
            <h3 className="font-semibold">{t(`pricing.${key}.title`)}</h3>
            <p className="mt-1.5 text-sm text-[#8C6B6F]">{t(`pricing.${key}.body`)}</p>
            <a href="#event-form" className="mt-3 inline-block text-sm font-semibold text-[#6B2F3A] underline underline-offset-4">{t("pricing.cta")}</a>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-[#8C6B6F]">{t("pricing.note")}</p>
    </section>
  );
}
