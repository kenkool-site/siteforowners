import type { Metadata } from "next";
import type { InvitationMediaSnapshot } from "./media";
import type {
  PublicInvitationEvent,
  PublicInvitationLookup,
} from "./repository-core";
import {
  getEffectiveEventState,
  type EffectiveEventState,
} from "./state";
import { invitationCoverPreviewUrl, invitationPublicUrl } from "./public-url";

export type PublicInvitationResolution =
  | { kind: "not_found" }
  | { kind: "unavailable"; event: PublicInvitationEvent }
  | { kind: "ended"; event: PublicInvitationEvent }
  | {
      kind: "details";
      event: PublicInvitationEvent;
      state: "published" | "rsvp_closed";
      rsvpSummary: PublicInvitationLookup["rsvpSummary"];
    };

export type PublicInvitationResolutionDependencies = {
  find(slug: string): Promise<PublicInvitationLookup | null>;
};

export type PublicInvitationClientDetails = Extract<PublicInvitationResolution, { kind: "details" }>;

// The founder/owner preview (src/app/invitations/preview/[eventId]/page.tsx)
// stays on server-loaded media rather than PublicInvitation's client-side
// fetch: it previews events that are often still in "draft" state, and the
// public media endpoint (GET /api/invitations/public/[slug]/media) 404s for
// anything that isn't published/rsvp_closed — that gate is exactly why
// preview needs its own signed media up front, via PublicInvitation's
// `initialMedia` override prop.
export type PublicInvitationPreviewDetails = PublicInvitationClientDetails & { media: InvitationMediaSnapshot };

export async function resolveInvitationPreview(eventId: string, dependencies: {
  authorize(eventId: string): Promise<boolean>;
  find(eventId: string): Promise<PublicInvitationLookup | null>;
  loadMedia(event: PublicInvitationEvent): Promise<InvitationMediaSnapshot>;
}): Promise<PublicInvitationPreviewDetails | null> {
  if (!await dependencies.authorize(eventId)) return null;
  const invitation = await dependencies.find(eventId);
  if (!invitation || invitation.event.id !== eventId) return null;
  const details = toPublicInvitationClientDetails({
    kind: "details",
    event: invitation.event,
    state: "published",
    rsvpSummary: invitation.rsvpSummary,
  });
  return { ...details, media: await dependencies.loadMedia(invitation.event) };
}

export function toPublicInvitationClientDetails(
  resolution: PublicInvitationClientDetails,
): PublicInvitationClientDetails {
  return {
    ...resolution,
    rsvpSummary: resolution.event.showPublicRsvpCount
      ? resolution.rsvpSummary
      : { attendingPeople: 0, declinedParties: 0 },
  };
}

export async function resolvePublicInvitationPage(
  slug: string,
  now: Date,
  dependencies: PublicInvitationResolutionDependencies,
): Promise<PublicInvitationResolution> {
  const invitation = await dependencies.find(slug);
  if (!invitation) return { kind: "not_found" };
  const state = getEffectiveEventState(invitation.event, now);
  if (state === "offline") return { kind: "not_found" };
  if (state === "draft") return { kind: "unavailable", event: invitation.event };
  if (state === "expired") return { kind: "ended", event: invitation.event };
  return {
    kind: "details",
    event: invitation.event,
    state,
    rsvpSummary: invitation.rsvpSummary,
  };
}

// Powers the invitation footer's "Hosting your own event?" referral banner
// on the invitespot.app landing page: given the slug of the invitation that
// sent a visitor there (via ?from=), returns just its honoree names — never
// anything else about the event, and never for an event a stranger couldn't
// already see by visiting its own invitation page directly. A visitor here has
// no session/cookie context for the OTHER event, so unlike resolvePublicInvitationPage
// (whose passcode gating now lives in middleware, not here), any
// passcode at all must suppress the name entirely.
// The `find` parameter is required (not defaulted) so this file never imports
// ./repository, which starts with `import "server-only"` and would break tests.
export async function getInvitationReferralDisplayName(
  slug: string,
  find: (slug: string) => Promise<PublicInvitationLookup | null>,
): Promise<string | null> {
  const invitation = await find(slug);
  if (!invitation) return null;
  if (invitation.passcodeHash) return null;
  const state = getEffectiveEventState(invitation.event, new Date());
  if (state !== "published" && state !== "rsvp_closed") return null;
  return invitation.event.honoreeNames;
}

const PRIVATE_METADATA: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

function invitationShareText(event: PublicInvitationEvent): { title: string; description: string | undefined } {
  const honoreeNames = event.honoreeNames.trim();
  const invitationTitle = event.title.trim();
  const title = honoreeNames || invitationTitle;
  const description = event.description.trim();
  const supportingTitle = honoreeNames && invitationTitle.localeCompare(honoreeNames, undefined, { sensitivity: "accent" }) !== 0
    ? invitationTitle
    : "";
  const venueName = event.venueName?.trim() ?? "";
  const supportingText = [supportingTitle, venueName, description].filter(Boolean).join(" — ");
  return { title, description: supportingText || undefined };
}

export function invitationPageMetadata(
  invitation: PublicInvitationLookup | null,
  state: EffectiveEventState | null,
): Metadata {
  if (
    !invitation
    || invitation.passcodeHash
    || state !== "published"
  ) return PRIVATE_METADATA;
  const shareText = invitationShareText(invitation.event);
  const coverUrl = invitation.event.coverImagePath
    ? invitationCoverPreviewUrl(invitation.event)
    : undefined;
  return {
    title: shareText.title,
    description: shareText.description,
    alternates: { canonical: invitationPublicUrl(invitation.event) },
    robots: { index: true, follow: true },
    openGraph: {
      title: shareText.title,
      description: shareText.description,
      type: "website",
      url: invitationPublicUrl(invitation.event),
      images: coverUrl ? [{ url: coverUrl, alt: shareText.title }] : undefined,
    },
    twitter: {
      card: coverUrl ? "summary_large_image" : "summary",
      title: shareText.title,
      description: shareText.description,
      images: coverUrl ? [coverUrl] : undefined,
    },
  };
}
