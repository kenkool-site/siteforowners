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

export function invitationMemoriesUrl(
  invitation: InvitationPublicUrlInput,
  appUrl = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL || DEFAULT_INVITESPOT_APP_URL,
): string {
  if (invitation.publicSubdomain) {
    return `https://${invitation.publicSubdomain}.invitespot.app/memories`;
  }
  return new URL(`/invite/${encodeURIComponent(invitation.slug)}/memories`, appUrl).toString();
}

export function invitationCoverPreviewUrl(
  invitation: Pick<InvitationPublicUrlInput, "slug">,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
): string {
  return new URL(`/api/invitations/public/${encodeURIComponent(invitation.slug)}/cover`, appUrl).toString();
}

const SUBDOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Origin crawlers should use for an event link preview. Never siteforowners.com. */
export function invitationShareOrigin(
  invitation: InvitationPublicUrlInput,
  appUrl = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL || DEFAULT_INVITESPOT_APP_URL,
): string {
  const label = invitation.publicSubdomain?.trim().toLowerCase() ?? "";
  if (label && label !== "www" && SUBDOMAIN_LABEL.test(label)) {
    return `https://${label}.invitespot.app`;
  }
  return new URL(appUrl).origin;
}

export function invitationPersonalUrl(
  invitation: InvitationPublicUrlInput,
  token: string,
  appUrl = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL || DEFAULT_INVITESPOT_APP_URL,
): string {
  const origin = invitationShareOrigin(invitation, appUrl);
  return `${origin}/i/${encodeURIComponent(token)}`;
}

/**
 * Absolute Open Graph image on invitespot.app. `page=memories` is a path
 * segment, not a query, so Next 14 cannot strip it while resolving metadataBase.
 */
export function invitationOgImageUrl(
  invitation: InvitationPublicUrlInput,
  page: "invite" | "memories" = "invite",
  appUrl = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL || DEFAULT_INVITESPOT_APP_URL,
): string {
  const origin = invitationShareOrigin(invitation, appUrl);
  const suffix = page === "memories" ? "/memories" : "";
  return `${origin}/api/invitations/public/${encodeURIComponent(invitation.slug)}/og${suffix}`;
}
