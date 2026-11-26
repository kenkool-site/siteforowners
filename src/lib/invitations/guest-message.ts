import type { InvitationLocale } from "./types";
import { smsSegmentCount, isGsm7Char } from "./sms-segments";
import { withSmsOptOutFooter } from "./sms-opt-out";

/** Hosts can type either token. Both become that recipient's name at send time. */
export const GUEST_NAME_PLACEHOLDERS = ["{guest_name}", "{first_name}"] as const;
export const GUEST_NAME_PLACEHOLDER = GUEST_NAME_PLACEHOLDERS[0];

/**
 * A comfortably long first name used when nobody is selected yet, so the
 * segment estimate is not shorter than a typical guest.
 */
export const SAMPLE_GUEST_NAME = "Alexandra";

function placeholderPattern(): RegExp {
  return /\{(?:guest_name|first_name)\}/g;
}
const TITLES = /^(mr|mrs|ms|miss|mx|dr|prof|sir|dame|sra|sr|srta)\.?$/i;
const HOUSEHOLD = /\b(family|families|household|familia|hogar)\b/i;
const JOINT = /\s(?:and|&)\s/i;

export type GuestNameSource = {
  primaryName: string;
  partySize?: number | null;
  additionalGuestNames?: readonly string[] | null;
};

export function hasGuestNamePlaceholder(text: string): boolean {
  return placeholderPattern().test(text);
}

/**
 * First name for one person. A party, household, or couple keeps the name
 * written on the RSVP so we do not greet only the first word of "The Okonkwo Family".
 */
export function guestMessageDisplayName(source: GuestNameSource): string | null {
  const name = source.primaryName.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const extra = (source.additionalGuestNames ?? []).some((item) => item.trim());
  const party = (source.partySize ?? 0) > 1 || extra;
  if (party || HOUSEHOLD.test(name) || /^the\s+\S/i.test(name) || JOINT.test(name)) return name;
  const parts = name.split(" ");
  let index = 0;
  while (index < parts.length - 1 && TITLES.test(parts[index] ?? "")) index += 1;
  const token = parts[index] ?? name;
  const cleaned = token.replace(/^[^A-Za-z0-9À-ÿ]+|[^A-Za-z0-9À-ÿ'.-]+$/g, "");
  return cleaned || token;
}

/**
 * Fold a name into GSM-7 so one accented character does not switch the
 * whole text to UCS-2. Letters already in GSM-7 (é, ñ, ü) stay as written.
 */
export function gsm7SafeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const punctuated = name
    .replace(/[\u2018\u2019\u2032\u02bc]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00a0\u202f]/g, " ");
  let out = "";
  for (const char of punctuated) {
    if (isGsm7Char(char)) {
      out += char;
      continue;
    }
    const folded = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (folded && folded !== char && Array.from(folded).every((piece) => isGsm7Char(piece))) {
      out += folded;
      continue;
    }
    const extra: Record<string, string> = { ł: "l", Ł: "L", đ: "d", Đ: "D", ð: "d", Ð: "D", þ: "th", Þ: "Th", ø: "o", Ø: "O", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ß: "ss" };
    const mapped = extra[char];
    if (mapped && Array.from(mapped).every((piece) => isGsm7Char(piece))) out += mapped;
  }
  const cleaned = out.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function tidySpacing(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,!.?;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n");
}

function applyFallbackGreeting(template: string, locale: InvitationLocale): string {
  let next = template.replace(/\b(Hi|Hello|Hey)\s+\{(?:guest_name|first_name)\}/gi, (_match, word: string) => {
    const lower = word.toLowerCase();
    if (lower === "hello") return "Hello there";
    if (lower === "hey") return "Hey there";
    return "Hi there";
  });
  next = next.replace(/\bHola\s+\{(?:guest_name|first_name)\}/gi, "Hola");
  const leftover = locale === "es" ? "" : "there";
  next = next.replace(placeholderPattern(), leftover);
  return tidySpacing(next);
}

export function personalizeGuestMessage(
  template: string,
  input: { name: string | null; locale: InvitationLocale; channel: "sms" | "email" },
): string {
  if (!hasGuestNamePlaceholder(template)) return template;
  const raw = input.name?.trim() || null;
  const name = raw && input.channel === "sms" ? gsm7SafeName(raw) : raw;
  if (!name) return applyFallbackGreeting(template, input.locale);
  return template.replace(placeholderPattern(), name);
}

export type GuestMessagePreview = {
  /** Exact text used for the length and segment estimate. */
  text: string;
  /** Name shown in the one-line explanation, or the fallback greeting. */
  label: string;
  sample: boolean;
  fallback: boolean;
};

/**
 * Render the draft the way the longest selected guest will receive it.
 * With nobody selected, uses a sample first name so the estimate is not optimistic.
 */
export function previewGuestMessage(input: {
  template: string;
  guests: readonly GuestNameSource[];
  locale: InvitationLocale;
  channel: "sms" | "email";
}): GuestMessagePreview {
  const sample = input.guests.length === 0;
  const guests = sample ? [{ primaryName: SAMPLE_GUEST_NAME }] : input.guests;
  let best: GuestMessagePreview & { size: number } = {
    text: "",
    label: SAMPLE_GUEST_NAME,
    sample,
    fallback: false,
    size: -1,
  };
  for (const guest of guests) {
    const display = guestMessageDisplayName(guest);
    const inserted = display == null
      ? null
      : input.channel === "sms"
        ? gsm7SafeName(display)
        : display;
    const rendered = personalizeGuestMessage(input.template, {
      name: inserted,
      locale: input.locale,
      channel: input.channel,
    });
    const text = input.channel === "sms" ? withSmsOptOutFooter(rendered, input.locale) : rendered;
    const info = input.channel === "sms" ? smsSegmentCount(text) : null;
    const size = info ? info.segments * 10000 + info.length : text.length;
    if (size > best.size) {
      best = {
        text,
        label: inserted ?? (input.locale === "es" ? "Hola," : "Hi there,"),
        sample,
        fallback: !inserted,
        size,
      };
    }
  }
  return { text: best.text, label: best.label, sample: best.sample, fallback: best.fallback };
}
