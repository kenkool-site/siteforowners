"use client";

import { useTranslations } from "next-intl";
import { InvitespotLeadForm } from "./InvitespotLeadForm";
import { InviteSpotHero } from "./InviteSpotHero";
import { InviteSpotInvitesShowcase } from "./InviteSpotInvitesShowcase";
import { InviteSpotMemoriesShowcase } from "./InviteSpotMemoriesShowcase";
import { InviteSpotHowItWorks } from "./InviteSpotHowItWorks";
import { InviteSpotPricing } from "./InviteSpotPricing";

export function InviteSpotLandingContent({ referralName, referralSlug }: { referralName: string | null; referralSlug: string | null }) {
  const t = useTranslations("invitespot");

  return (
    <main className="bg-[#FBF3F0] text-[#2E1A1E]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-serif text-xl font-semibold text-[#6B2F3A]">InviteSpot</span>
        <a href="#event-form" className="text-sm font-medium text-[#6B2F3A]">{t("nav.getStarted")}</a>
      </header>

      {referralName && (
        <div className="mx-auto max-w-5xl px-6">
          <p className="rounded-lg bg-[#F6E8E2] px-4 py-2.5 text-sm text-[#6B4850]">
            ♡ {t("referralBanner", { names: referralName })}
          </p>
        </div>
      )}

      <InviteSpotHero />
      <InviteSpotInvitesShowcase />
      <InviteSpotMemoriesShowcase />
      <InviteSpotHowItWorks />
      <InviteSpotPricing />

      <InvitespotLeadForm referralSlug={referralSlug} />

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 text-xs text-[#8C6B6F]">
        <span>{t("footer.wordmark")}</span>
        <span>{t("footer.domain")}</span>
      </footer>
    </main>
  );
}
