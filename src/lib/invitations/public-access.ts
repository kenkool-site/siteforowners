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
import { formatEventWhen } from "./event-site";
import {
  invitationMemoriesUrl,
  invitationOgImageUrl,
  invitationPersonalUrl,
  invitationPublicUrl,
  invitationShareOrigin,
} from "./public-url";

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

const INVITESPOT_FALLBACK_IMAGE = "https://www.invitespot.app/invitespot/social-preview-en.png";

export type InvitationSharePage = "invite" | "memories" | "rsvp";

export type InvitationShareOptions = {
  page?: InvitationSharePage;
  /** Personal RSVP link (/i/<token>). Omitted from the image URL so the preview does not embed the secret. */
  token?: string;
  /** Memories pages can hide the InviteSpot name. Defaults to showing it. */
  showBrand?: boolean;
};

export type InvitationOgPlan = {
  /** Drawn on the generated card. Never includes the street address or a guest's name. */
  names: string;
  detail: string;
  brand: boolean;
  /** Public cover photo, already shown on the invitation. Null when the card must be generated. */
  cover: { eventId: string; path: string } | null;
};

type ShareDetail = "full" | "invite-only" | "hidden";

function shareDetail(invitation: PublicInvitationLookup | null, state: EffectiveEventState | null): ShareDetail {
  if (!invitation || invitation.passcodeHash) return "hidden";
  if (state !== "published" && state !== "rsvp_closed") return "hidden";
  // The invite-only gate shows the honoree names and cover, not the date, venue, or description.
  if (invitation.event.privateGuestListEnabled) return "invite-only";
  return "full";
}

function displayNames(event: PublicInvitationEvent): string {
  return event.honoreeNames.trim() || event.title.trim();
}

function invitedTitle(names: string, locale: string): string {
  if (!names) return locale === "es" ? "Te invitamos" : "You're invited";
  return locale === "es" ? `Te invitamos: ${names}` : `You're invited: ${names}`;
}

function shareDescription(event: PublicInvitationEvent, detail: Exclude<ShareDetail, "hidden">): string {
  if (detail === "invite-only") {
    return event.locale === "es" ? "Este evento es solo por invitación." : "This event is invite-only.";
  }
  const names = displayNames(event);
  const invitationTitle = event.title.trim();
  const supportingTitle = names && invitationTitle.localeCompare(names, undefined, { sensitivity: "accent" }) !== 0
    ? invitationTitle
    : "";
  const when = formatEventWhen(event.startsAt, event.timezone, event.locale) ?? "";
  const venue = event.venueName?.trim() ?? "";
  const blurb = event.description.trim();
  // Street address and map URLs stay off the preview. The public page shows them only after the link is opened.
  return [supportingTitle, when, venue, blurb].filter(Boolean).join(" · ");
}

function pageUrl(event: PublicInvitationEvent, options: InvitationShareOptions): string {
  if (options.page === "memories") return invitationMemoriesUrl(event);
  if (options.page === "rsvp" && options.token) return invitationPersonalUrl(event, options.token);
  return invitationPublicUrl(event);
}

/**
 * What the generated image may draw. Passcode, draft, and ended events get a
 * generic InviteSpot card. Private guest lists keep the names and cover the
 * public gate already shows, and omit the date and venue.
 */
export function invitationOgPlan(
  invitation: PublicInvitationLookup | null,
  state: EffectiveEventState | null,
  options: InvitationShareOptions = {},
): InvitationOgPlan {
  const detail = shareDetail(invitation, state);
  const showBrand = options.showBrand !== false;
  if (!invitation || detail === "hidden") {
    const locale = invitation?.event.locale ?? "en";
    return {
      names: locale === "es" ? "Te invitamos" : "You're invited",
      detail: "",
      brand: true,
      cover: null,
    };
  }
  const names = displayNames(invitation.event) || (invitation.event.locale === "es" ? "Te invitamos" : "You're invited");
  const line = detail === "invite-only"
    ? (invitation.event.locale === "es" ? "Solo por invitación" : "Invite-only")
    : shareDescription(invitation.event, "full");
  const coverPath = invitation.event.coverImagePath?.trim() ?? "";
  return {
    names,
    detail: line,
    brand: showBrand,
    cover: coverPath ? { eventId: invitation.event.id, path: coverPath } : null,
  };
}

function socialMetadata(input: {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  imageAlt: string;
  siteName: string;
  origin: string;
  index: boolean;
  locale?: "en" | "es";
}): Metadata {
  const image = { url: input.imageUrl, width: 1200, height: 630, alt: input.imageAlt };
  return {
    // Replace the root layout's siteforowners.com base so relative file-convention
    // image URLs (opengraph-image.tsx) resolve on invitespot.app.
    metadataBase: new URL(input.origin),
    applicationName: input.siteName === "InviteSpot" ? "InviteSpot" : input.siteName,
    title: input.title,
    description: input.description,
    alternates: { canonical: input.index ? input.url : null },
    robots: { index: input.index, follow: input.index },
    openGraph: {
      title: input.title,
      description: input.description,
      type: "website",
      url: input.url,
      siteName: input.siteName,
      locale: input.locale === "es" ? "es_ES" : "en_US",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [input.imageUrl],
    },
  };
}

/**
 * Link-preview tags for an invitation. Every field that the root layout sets
 * (title, description, site name, images) is filled in here. Leaving images
 * undefined lets Next keep the root SiteForOwners card, and app/opengraph-image.tsx
 * is inherited by any segment that does not define its own file.
 */
export function invitationPageMetadata(
  invitation: PublicInvitationLookup | null,
  state: EffectiveEventState | null,
  options: InvitationShareOptions = {},
): Metadata {
  const page = options.page ?? "invite";
  const detail = shareDetail(invitation, state);
  if (!invitation || detail === "hidden") {
    const origin = invitation ? invitationShareOrigin(invitation.event) : "https://www.invitespot.app";
    const imageUrl = invitation ? invitationOgImageUrl(invitation.event, page === "memories" ? "memories" : "invite") : INVITESPOT_FALLBACK_IMAGE;
    const url = invitation ? pageUrl(invitation.event, options) : "https://www.invitespot.app/";
    const locale = invitation?.event.locale;
    return socialMetadata({
      title: "Invitation",
      description: locale === "es" ? "Te invitamos." : "You're invited.",
      url,
      imageUrl,
      imageAlt: "Invitation",
      siteName: "InviteSpot",
      origin,
      index: false,
      locale: locale === "es" ? "es" : "en",
    });
  }

  const event = invitation.event;
  const names = displayNames(event);
  const showBrand = options.showBrand !== false;
  const photos = event.locale === "es" ? "Fotos" : "Photos";
  const title = page === "memories"
    ? (showBrand ? `${names} · ${photos} · InviteSpot` : `${names} · ${photos}`)
    : invitedTitle(names, event.locale);
  const description = shareDescription(event, detail) || (event.locale === "es" ? "Te invitamos." : "You're invited.");
  const siteName = showBrand ? "InviteSpot" : (names || "InviteSpot");
  const url = pageUrl(event, options);
  const imagePage = page === "memories" ? "memories" : "invite";
  return socialMetadata({
    title,
    description,
    url,
    imageUrl: invitationOgImageUrl(event, imagePage),
    imageAlt: names || title,
    siteName,
    origin: invitationShareOrigin(event),
    // Personal links stay out of the index. Closed RSVPs stay out too; the preview still names the event.
    index: page !== "rsvp" && state === "published",
    locale: event.locale,
  });
}
