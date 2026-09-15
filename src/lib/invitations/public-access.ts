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
  | { kind: "passcode"; event: PublicInvitationEvent }
  | {
      kind: "details";
      event: PublicInvitationEvent;
      state: "published" | "rsvp_closed";
      media: InvitationMediaSnapshot;
      rsvpSummary: PublicInvitationLookup["rsvpSummary"];
    };

export type PublicInvitationResolutionDependencies = {
  find(slug: string): Promise<PublicInvitationLookup | null>;
  hasPasscodeAccess(event: PublicInvitationEvent): boolean;
  loadMedia(event: PublicInvitationEvent): Promise<InvitationMediaSnapshot>;
};

export type PublicInvitationClientDetails = Extract<PublicInvitationResolution, { kind: "details" }>;

export async function resolveInvitationPreview(eventId: string, dependencies: {
  authorize(eventId: string): Promise<boolean>;
  find(eventId: string): Promise<PublicInvitationLookup | null>;
  loadMedia(event: PublicInvitationEvent): Promise<InvitationMediaSnapshot>;
}): Promise<PublicInvitationClientDetails | null> {
  if (!await dependencies.authorize(eventId)) return null;
  const invitation = await dependencies.find(eventId);
  if (!invitation || invitation.event.id !== eventId) return null;
  return toPublicInvitationClientDetails({ kind: "details", event: invitation.event,
    state: "published", media: await dependencies.loadMedia(invitation.event), rsvpSummary: invitation.rsvpSummary });
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
  if (invitation.passcodeHash && !dependencies.hasPasscodeAccess(invitation.event)) {
    return { kind: "passcode", event: invitation.event };
  }
  return {
    kind: "details",
    event: invitation.event,
    state,
    media: await dependencies.loadMedia(invitation.event),
    rsvpSummary: invitation.rsvpSummary,
  };
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
  const supportingText = [supportingTitle, description].filter(Boolean).join(" — ");
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
