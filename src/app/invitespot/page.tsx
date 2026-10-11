import type { Metadata } from "next";
import { buildInvitespotMetadata, invitespotLocale } from "@/lib/invitespot-seo";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { getInvitationReferralDisplayName } from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { InviteSpotLandingContent } from "@/components/invitespot/InviteSpotLandingContent";

type LandingProps = { searchParams: { from?: string; lang?: string } };

export function generateMetadata({ searchParams }: LandingProps): Metadata {
  return buildInvitespotMetadata(searchParams.lang);
}

export default async function InviteSpotLandingPage({ searchParams }: LandingProps) {
  const locale = invitespotLocale(searchParams.lang);
  const referralSlug = typeof searchParams.from === "string" ? searchParams.from : null;
  let referralName: string | null = null;
  if (referralSlug) {
    try {
      referralName = await getInvitationReferralDisplayName(referralSlug, getPublicInvitationBySlug);
    } catch (error) {
      // A referral-lookup hiccup must never 500 the whole landing page for a
      // guest who followed a link with a slug that happens to error — degrade
      // to "no banner" instead.
      console.error("[invitespot] referral lookup failed", { referralSlug, error });
    }
  }

  return (
    <InvitationPublicProvider locale={locale} timeZone="UTC">
      <InviteSpotLandingContent referralName={referralName} referralSlug={referralSlug} />
    </InvitationPublicProvider>
  );
}
