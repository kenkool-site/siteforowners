export type InvitationPublicUrlInput = {
  slug: string;
  publicSubdomain?: string | null;
};

const DEFAULT_APP_URL = "https://www.siteforowners.com";

export function invitationPublicUrl(
  invitation: InvitationPublicUrlInput,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
): string {
  if (invitation.publicSubdomain) {
    return `https://${invitation.publicSubdomain}.siteforowners.com/`;
  }
  return new URL(`/invite/${encodeURIComponent(invitation.slug)}`, appUrl).toString();
}
