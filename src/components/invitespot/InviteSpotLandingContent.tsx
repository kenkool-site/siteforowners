"use client";
import { useLocale, useTranslations } from "next-intl";
import { InvitespotLeadForm } from "./InvitespotLeadForm";
import { InviteSpotHero } from "./InviteSpotHero";
import { InviteSpotInvitesShowcase } from "./InviteSpotInvitesShowcase";
import { InviteSpotMemoriesShowcase } from "./InviteSpotMemoriesShowcase";
import { InviteSpotFeatures } from "./InviteSpotFeatures";
import { InviteSpotHowItWorks } from "./InviteSpotHowItWorks";
import { InviteSpotPricing } from "./InviteSpotPricing";
import styles from "./styles";
export function InviteSpotLandingContent({ referralName, referralSlug }: { referralName: string | null; referralSlug: string | null }) {
 const t = useTranslations("invitespot");
 const locale = useLocale();
 const languageParams = new URLSearchParams({lang:locale === "es" ? "en" : "es"});
 if(referralSlug) languageParams.set("from",referralSlug);
 return <main className={styles.page} lang={locale}>
  <header className={styles.header}><a className={styles.wordmark} href="#">InviteSpot</a><nav className={styles.nav}><a href="#invitations">{t("nav.invitations")}</a><a href="#memories">{t("nav.memories")}</a><a className={styles.primary} href="#event-form">{t("nav.getStarted")}</a></nav></header>
  {referralName && <div className="mx-auto max-w-7xl px-5 pt-5"><p className="rounded-lg bg-[#F6E8E2] px-4 py-2.5 text-sm text-[#6B4850]">{t("referralBanner",{names:referralName})}</p></div>}
  <InviteSpotHero /><InviteSpotInvitesShowcase /><InviteSpotMemoriesShowcase /><InviteSpotFeatures /><InviteSpotHowItWorks /><InviteSpotPricing /><InvitespotLeadForm referralSlug={referralSlug} />
  <footer className={styles.footer}><span>{t("footer.wordmark")}</span><a href={`?${languageParams.toString()}`}>{t("nav.language")}</a><span>{t("footer.domain")}</span></footer>
 </main>;
}
