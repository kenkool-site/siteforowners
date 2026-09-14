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

export function invitationPageMetadata(
  invitation: PublicInvitationLookup | null,
  state: EffectiveEventState | null,
): Metadata {
  if (
    !invitation
    || invitation.passcodeHash
    || state !== "published"
  ) return PRIVATE_METADATA;
  return {
    title: invitation.event.title,
    description: invitation.event.description || undefined,
    robots: { index: true, follow: true },
    openGraph: {
      title: invitation.event.title,
      description: invitation.event.description || undefined,
      type: "website",
    },
  };
}
