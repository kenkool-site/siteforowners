export type InvitationPublicUrlInput = {
  slug: string;
  publicSubdomain?: string | null;
};

const DEFAULT_APP_URL = "https://www.siteforowners.com";
// Deliberately separate from DEFAULT_APP_URL/NEXT_PUBLIC_APP_URL: that env
// var is shared broadly across the non-invitation SiteForOwners product
// (bookings, Stripe checkout/portal URLs, cron reminder emails, tenant site
// rendering) and must not be repointed at invitespot.app.
const DEFAULT_INVITESPOT_APP_URL = "https://www.invitespot.app";

export function invitationPublicUrl(
  invitation: InvitationPublicUrlInput,
  appUrl = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL || DEFAULT_INVITESPOT_APP_URL,
): string {
  if (invitation.publicSubdomain) {
    return `https://${invitation.publicSubdomain}.invitespot.app/`;
  }
  return new URL(`/invite/${encodeURIComponent(invitation.slug)}`, appUrl).toString();
}

export function invitationCoverPreviewUrl(
  invitation: Pick<InvitationPublicUrlInput, "slug">,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
): string {
  return new URL(`/api/invitations/public/${encodeURIComponent(invitation.slug)}/cover`, appUrl).toString();
}
