"use client";

import { useTranslations } from "next-intl";

export function InviteSpotHero() {
  const t = useTranslations("invitespot");
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="font-serif text-4xl font-bold leading-tight text-[#2E1A1E] sm:text-5xl">{t("hero.title")}</h1>
      <p className="mx-auto mt-5 max-w-xl text-base text-[#8C6B6F]">{t("hero.subtitle")}</p>
      <a href="#event-form" className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#6B2F3A] px-8 py-3.5 text-base font-semibold text-[#FBF3F0] hover:bg-[#5a2630]">
        {t("hero.cta")}
      </a>
      <p className="mt-3 text-xs text-[#8C6B6F]">{t("hero.microcopy")}</p>
    </section>
  );
}
