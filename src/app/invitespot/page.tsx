import type { Metadata } from "next";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { getInvitationReferralDisplayName } from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { InviteSpotLandingContent } from "@/components/invitespot/InviteSpotLandingContent";

export const metadata: Metadata = {
  title: "InviteSpot",
  description: "Digital invitations and shared photos for your event.",
  applicationName: "InviteSpot",
  // Hardcoded (not NEXT_PUBLIC_INVITESPOT_APP_URL-driven) deliberately — a
  // canonical/OG URL should stay stable regardless of env config, unlike
  // invitationPublicUrl's no-subdomain fallback in
  // src/lib/invitations/public-url.ts.
  alternates: {
    canonical: "https://www.invitespot.app/",
  },
  openGraph: {
    type: "website",
    url: "https://www.invitespot.app/",
    siteName: "InviteSpot",
    title: "InviteSpot",
    description: "Digital invitations and shared photos for your event.",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "InviteSpot",
    description: "Digital invitations and shared photos for your event.",
    images: [],
  },
};

export default async function InviteSpotLandingPage({ searchParams }: { searchParams: { from?: string; lang?: string } }) {
  const locale = searchParams.lang === "es" ? "es" : "en";
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
