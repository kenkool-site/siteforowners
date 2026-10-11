"use client";

import { useTranslations } from "next-intl";
import { InvitespotLeadForm } from "./InvitespotLeadForm";
import { InviteSpotHowItWorks } from "./InviteSpotHowItWorks";
import { InviteSpotPricing } from "./InviteSpotPricing";

export function InviteSpotLandingContent({ referralName, referralSlug }: { referralName: string | null; referralSlug: string | null }) {
  const t = useTranslations("invitespot");

  return (
    <main className="bg-[#F4EEE4] text-[#241F1A]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-serif text-xl font-semibold text-[#1F3A2E]">InviteSpot</span>
        <a href="#event-form" className="text-sm font-medium text-[#1F3A2E]">{t("nav.getStarted")}</a>
      </header>

      {referralName && (
        <div className="mx-auto max-w-5xl px-6">
          <p className="rounded-lg bg-[#E7E0D3] px-4 py-2.5 text-sm text-[#5b4f3f]">
            ♡ {t("referralBanner", { names: referralName })}
          </p>
        </div>
      )}

      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold leading-tight sm:text-5xl">{t("hero.title")}</h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-[#5b5147]">{t("hero.subtitle")}</p>
        <a href="#event-form" className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#1F3A2E] px-8 py-3.5 text-base font-semibold text-[#F4EEE4]">
          {t("hero.cta")}
        </a>
        <p className="mt-3 text-xs text-[#8a7f70]">{t("hero.microcopy")}</p>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7f70]">{t("whatYouGet.heading")}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {(["address", "rsvps", "photos"] as const).map((key) => (
            <div key={key} className="rounded-xl border border-[#e5dfd0] bg-white p-5">
              <h3 className="font-semibold">{t(`whatYouGet.${key}.title`)}</h3>
              <p className="mt-2 text-sm text-[#5b5147]">{t(`whatYouGet.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <InviteSpotHowItWorks />

      <InviteSpotPricing />

      <InvitespotLeadForm referralSlug={referralSlug} />

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 text-xs text-[#8a7f70]">
        <span>{t("footer.wordmark")}</span>
        <span>{t("footer.domain")}</span>
      </footer>
    </main>
  );
}
