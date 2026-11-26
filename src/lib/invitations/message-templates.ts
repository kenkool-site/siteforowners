import type { InvitationAdditionalSection } from "./additional-sections";
import { directionsHref, formatInEventZone } from "./event-site";
import { invitationMemoriesUrl, invitationPublicUrl } from "./public-url";
import type { InvitationStyleGuide } from "./style-guide";
import { DAYS_TO_GO_PLACEHOLDER } from "./days-to-go";
import { GUEST_NAME_PLACEHOLDER } from "./guest-message";
import type { InvitationLocale } from "./types";

export const MESSAGE_TEMPLATE_KEYS = [
  "thankYou",
  "reminder",
  "dayBefore",
  "eventDay",
  "dressCode",
  "scheduleChange",
  "rsvpDeadline",
  "photoSharing",
  "thankYouPhotos",
  "livestream",
  "update",
] as const;

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];

export type MessageTemplateValues = {
  name: string;
  when: string;
  smsWhen: string;
  time: string;
  smsTime: string;
  venue: string;
  place: string;
  inviteUrl: string;
  memoriesUrl: string;
  directions: string;
  smsDirections: string;
  parking: string;
  dressCode: string;
  smsDressCode: string;
  colors: string;
  smsColors: string;
  deadline: string;
  smsDeadline: string;
  livestream: string;
  change: string;
  /** Left literal so the host can edit it. Filled per recipient at send time. */
  guest_name: string;
  /** Left literal. Filled from the event date when the message is sent. */
  days_to_go: string;
};

export type MessageTemplateEvent = {
  locale: InvitationLocale;
  title: string;
  honoreeNames: string;
  slug: string;
  publicSubdomain?: string | null;
  startsAt: string | null;
  timezone: string;
  venueName: string | null;
  address: string | null;
  mapUrl: string | null;
  rsvpDeadline: string | null;
  styleGuide?: InvitationStyleGuide | null;
  additionalSections?: InvitationAdditionalSection[] | null;
};

type Fallbacks = {
  host: string;
  date: string;
  time: string;
  venue: string;
  directions: string;
  parking: string;
  dressCode: string;
  colors: string;
  deadline: string;
  livestream: string;
  change: string;
};

const LIVESTREAM_TEXT = /\b(live\s*stream|livestream|virtual|watch live|join online|zoom)\b/i;
function urlsIn(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}
const MEETING_HOST = /(zoom\.us|meet\.google\.|teams\.microsoft\.|teams\.live\.com|streamyard\.com|webex\.com)/i;

function fallbacks(locale: InvitationLocale): Fallbacks {
  if (locale === "es") {
    return {
      host: "[anfitrion]",
      date: "[fecha]",
      time: "[hora]",
      venue: "[lugar]",
      directions: "[direcciones]",
      parking: "[estacionamiento]",
      dressCode: "[vestimenta]",
      colors: "[colores]",
      deadline: "[fecha limite]",
      livestream: "[enlace en vivo]",
      change: "[que cambio]",
    };
  }
  return {
    host: "[host]",
    date: "[date]",
    time: "[time]",
    venue: "[venue]",
    directions: "[directions]",
    parking: "[parking]",
    dressCode: "[dress code]",
    colors: "[colors]",
    deadline: "[RSVP deadline]",
    livestream: "[livestream link]",
    change: "[what changed]",
  };
}

function smsPlain(value: string): string {
  return value
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function smsClip(value: string, max: number): string {
  const clean = smsPlain(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function zoned(
  iso: string | null | undefined,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string | null {
  const formatted = formatInEventZone(iso, timeZone, locale, options);
  return formatted ? formatted.replace(/[\u00a0\u202f]/g, " ") : null;
}

function trimUrl(url: string): string {
  return url.replace(/[.,);]+$/g, "");
}

export function findLivestreamUrl(sections: readonly InvitationAdditionalSection[] | null | undefined): string | null {
  if (!sections?.length) return null;
  for (const section of sections) {
    const text = `${section.heading}\n${section.content}`;
    if (!LIVESTREAM_TEXT.test(text)) continue;
    const url = urlsIn(text)[0];
    if (url) return trimUrl(url);
  }
  for (const section of sections) {
    const match = urlsIn(section.content).find((url) => MEETING_HOST.test(url));
    if (match) return trimUrl(match);
  }
  return null;
}

export function buildMessageTemplateValues(event: MessageTemplateEvent): MessageTemplateValues {
  const blanks = fallbacks(event.locale);
  const locale = event.locale === "es" ? "es" : "en";
  const timeZone = event.timezone?.trim() || "America/New_York";
  const host = event.honoreeNames.trim() || event.title.trim() || blanks.host;
  const longDate = zoned(event.startsAt, timeZone, locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const localTime = zoned(event.startsAt, timeZone, locale, { hour: "numeric", minute: "2-digit" });
  const smsDate = zoned(event.startsAt, timeZone, "en-US", { weekday: "short", month: "short", day: "numeric" });
  const smsTime = zoned(event.startsAt, timeZone, "en-US", { hour: "numeric", minute: "2-digit" });
  const deadlineLong = zoned(event.rsvpDeadline, timeZone, locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const deadlineShort = zoned(event.rsvpDeadline, timeZone, "en-US", { weekday: "short", month: "short", day: "numeric" });
  const venue = event.venueName?.trim() || "";
  const address = event.address?.trim() || "";
  const place = [venue, address].filter(Boolean).join(", ") || blanks.venue;
  const map = directionsHref(address || null, event.mapUrl);
  const directionLines = [address, map && map !== address ? map : ""].filter(Boolean);
  const dress = event.styleGuide?.note?.trim() || "";
  const colorNames = (event.styleGuide?.colors ?? []).map((color) => color.name.trim()).filter(Boolean);
  const colors = colorNames.join(", ");
  const livestream = findLivestreamUrl(event.additionalSections) || blanks.livestream;
  const linkInput = { slug: event.slug, publicSubdomain: event.publicSubdomain };

  return {
    name: smsPlain(host) || blanks.host,
    when: longDate && localTime ? `${longDate}, ${localTime}` : longDate || blanks.date,
    smsWhen: smsDate && smsTime ? smsPlain(`${smsDate}, ${smsTime}`) : blanks.date,
    time: localTime ? smsPlain(localTime) : blanks.time,
    smsTime: smsTime ? smsPlain(smsTime) : blanks.time,
    venue: venue ? smsPlain(venue) : blanks.venue,
    place,
    inviteUrl: invitationPublicUrl(linkInput),
    memoriesUrl: invitationMemoriesUrl(linkInput),
    directions: directionLines.join("\n") || blanks.directions,
    smsDirections: address ? smsClip(address, 80) : (map ? map : blanks.directions),
    parking: blanks.parking,
    dressCode: dress || blanks.dressCode,
    smsDressCode: dress ? smsClip(dress, 60) : blanks.dressCode,
    colors: colors || blanks.colors,
    smsColors: colors ? smsClip(colors, 40) : blanks.colors,
    deadline: deadlineLong || blanks.deadline,
    smsDeadline: deadlineShort ? smsPlain(deadlineShort) : blanks.deadline,
    livestream,
    change: blanks.change,
    guest_name: GUEST_NAME_PLACEHOLDER,
    days_to_go: DAYS_TO_GO_PLACEHOLDER,
  };
}
