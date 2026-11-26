import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { toE164 } from "@/lib/sms";
import { eventKind, formatEventDay } from "./event-site";
import { withSmsOptOutFooter } from "./sms-opt-out";
import { smsSegmentCount, type SmsSegmentInfo } from "./sms-segments";
import type { InvitationLocale } from "./types";

export { smsSegmentCount };
export type { SmsSegmentInfo };

export const GUEST_TOKEN_BYTES = 16;
export const VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
export const GUEST_LIST_SEND_BATCH = 40;
export const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;
export const MAX_SEATS = 20;

export const VERIFY_SEND_PER_PHONE = { windowSeconds: 60 * 60, max: 3 };
export const VERIFY_SEND_PER_IP = { windowSeconds: 60 * 60, max: 8 };
export const VERIFY_CHECK_PER_PHONE = { windowSeconds: 15 * 60, max: 8 };
export const SEND_PER_EVENT = { windowSeconds: 60 * 60, max: 200 };

const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_KEYWORDS = new Set(["start", "unstop", "yes"]);

export type GuestDeliveryStatus = "not_sent" | "sending" | "sent" | "delivered" | "failed";

export type GuestListStatus =
  | "not_sent"
  | "sent"
  | "delivered"
  | "failed"
  | "opened"
  | "attending"
  | "declined"
  | "opted_out";

export type GuestRecord = {
  id: string;
  eventId: string;
  fullName: string;
  phoneE164: string;
  email: string | null;
  seatsAllowed: number;
  household: string | null;
  token: string;
  deliveryStatus: GuestDeliveryStatus;
  sentAt: string | null;
  openedAt: string | null;
  optedOutAt: string | null;
  rsvpAttending: boolean | null;
  rsvpPartySize: number | null;
  rsvpId: string | null;
  reminderSentAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GuestListItem = {
  id: string;
  fullName: string;
  phoneDisplay: string;
  seatsAllowed: number;
  partySize: number | null;
  household: string | null;
  status: GuestListStatus;
};

export type GuestDraft = {
  fullName: string;
  phoneE164: string;
  email: string | null;
  seatsAllowed: number;
  household: string | null;
};

export function createGuestToken(bytes: (size: number) => Buffer = randomBytes): string {
  return bytes(GUEST_TOKEN_BYTES).toString("base64url");
}

export function isGuestToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

export function normalizeGuestPhone(value: string): string | null {
  return toE164(value);
}

export function formatGuestPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const national = digits.slice(1);
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return e164;
}

export function guestFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName.trim();
}

export function displayStatus(guest: Pick<GuestRecord, "deliveryStatus" | "openedAt" | "optedOutAt" | "rsvpAttending">): GuestListStatus {
  if (guest.rsvpAttending === true) return "attending";
  if (guest.rsvpAttending === false) return "declined";
  if (guest.optedOutAt) return "opted_out";
  if (guest.openedAt) return "opened";
  if (guest.deliveryStatus === "failed") return "failed";
  if (guest.deliveryStatus === "delivered") return "delivered";
  if (guest.deliveryStatus === "sent" || guest.deliveryStatus === "sending") return "sent";
  return "not_sent";
}

export function toGuestListItem(guest: GuestRecord): GuestListItem {
  return {
    id: guest.id,
    fullName: guest.fullName,
    phoneDisplay: formatGuestPhone(guest.phoneE164),
    seatsAllowed: guest.seatsAllowed,
    partySize: guest.rsvpPartySize,
    household: guest.household,
    status: displayStatus(guest),
  };
}

export function isInviteCandidate(guest: GuestRecord, now = new Date()): boolean {
  if (guest.optedOutAt || guest.rsvpAttending !== null) return false;
  if (guest.deliveryStatus === "not_sent") return true;
  if (guest.deliveryStatus !== "sending") return false;
  const updated = Date.parse(guest.updatedAt);
  return Number.isFinite(updated) && now.getTime() - updated >= 10 * 60 * 1000;
}

export function isReminderCandidate(guest: GuestRecord, now = new Date()): boolean {
  if (guest.optedOutAt || guest.rsvpAttending !== null) return false;
  const status = displayStatus(guest);
  if (status !== "sent" && status !== "delivered" && status !== "opened") return false;
  if (!guest.reminderSentAt) return true;
  const sent = Date.parse(guest.reminderSentAt);
  return Number.isFinite(sent) && now.getTime() - sent >= REMINDER_COOLDOWN_MS;
}

export function planOutbound(input: {
  kind: "invite" | "reminder";
  guests: readonly GuestRecord[];
  now?: Date;
}): { send: GuestRecord[]; skippedOptOut: GuestRecord[] } {
  const now = input.now ?? new Date();
  const eligible = input.kind === "invite" ? isInviteCandidate : isReminderCandidate;
  const send: GuestRecord[] = [];
  const skippedOptOut: GuestRecord[] = [];
  for (const guest of input.guests) {
    if (guest.optedOutAt && input.kind === "invite" && guest.deliveryStatus === "not_sent") {
      skippedOptOut.push(guest);
      continue;
    }
    if (eligible(guest, now)) send.push(guest);
  }
  return { send, skippedOptOut };
}

export type InviteCopyInput = {
  guestName: string;
  honoreeNames: string;
  title: string;
  eventType: string;
  locale: InvitationLocale;
  startsAt: string | null;
  timezone: string;
  venueName: string | null;
  url: string;
};

function hostNames(input: Pick<InviteCopyInput, "honoreeNames" | "title" | "locale">): string {
  return input.honoreeNames.trim() || input.title.trim() || (input.locale === "es" ? "Tu anfitrión" : "Your host");
}

function gatheringPhrase(input: Pick<InviteCopyInput, "eventType" | "title" | "locale">): string {
  const kind = eventKind(input.eventType);
  if (kind === "wedding") return input.locale === "es" ? "su boda" : "their wedding";
  if (kind === "birthday") return input.locale === "es" ? "su celebración de cumpleaños" : "their birthday celebration";
  const title = input.title.trim();
  if (title) return title;
  return input.locale === "es" ? "su evento" : "their event";
}

function whenPhrase(input: Pick<InviteCopyInput, "startsAt" | "timezone" | "locale">): string | null {
  return formatEventDay(input.startsAt, input.timezone, input.locale === "es" ? "es" : "en");
}

function placePhrase(venueName: string | null, locale: InvitationLocale): string {
  const venue = venueName?.trim();
  if (!venue) return "";
  return locale === "es" ? `, en ${venue}` : `, at ${venue}`;
}

export function inviteSmsBody(input: InviteCopyInput): string {
  const first = guestFirstName(input.guestName);
  const hosts = hostNames(input);
  const gathering = gatheringPhrase(input);
  const when = whenPhrase(input);
  const place = placePhrase(input.venueName, input.locale);
  const whenBit = when ? `, ${when}` : "";
  const rsvp = input.locale === "es" ? "Confirma aquí" : "RSVP";
  const note = input.locale === "es"
    ? `Hola ${first}, ${hosts} te invitan a ${gathering}${whenBit}${place}.\n${rsvp}:\n${input.url}`
    : `Hi ${first}, ${hosts} invite you to ${gathering}${whenBit}${place}.\n${rsvp}:\n${input.url}`;
  return withSmsOptOutFooter(note, input.locale);
}

export function reminderSmsBody(input: InviteCopyInput): string {
  const first = guestFirstName(input.guestName);
  const hosts = hostNames(input);
  const gathering = gatheringPhrase(input);
  const when = whenPhrase(input);
  const whenBit = when ? (input.locale === "es" ? ` el ${when}` : ` on ${when}`) : "";
  const note = input.locale === "es"
    ? `Hola ${first}, un recordatorio de ${hosts}: confirma tu asistencia a ${gathering}${whenBit}.\n${input.url}`
    : `Hi ${first}, a reminder from ${hosts}: please RSVP for ${gathering}${whenBit}.\n${input.url}`;
  return withSmsOptOutFooter(note, input.locale);
}

export function verificationSmsBody(code: string, locale: InvitationLocale): string {
  const note = locale === "es"
    ? `Tu código de InviteSpot es ${code}. Caduca en 10 minutos.`
    : `Your InviteSpot verification code is ${code}. It expires in 10 minutes.`;
  return withSmsOptOutFooter(note, locale);
}

export function guestInviteUrl(event: { slug: string; publicSubdomain: string | null }, token: string, appUrl = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL || "https://www.invitespot.app"): string {
  if (event.publicSubdomain) return `https://${event.publicSubdomain}.invitespot.app/i/${token}`;
  return new URL(`/i/${token}`, appUrl).toString();
}

export function personalInvitationLead(input: {
  eventType: string;
  honoreeNames: string;
  title: string;
  locale: InvitationLocale;
}): string {
  const names = hostNames(input);
  const kind = eventKind(input.eventType);
  if (input.locale === "es") {
    if (kind === "wedding") return `a la boda de ${names}`;
    if (kind === "birthday") return `a la celebración de cumpleaños de ${names}`;
    return `a ${input.title.trim() || names}`;
  }
  if (kind === "wedding") return `to the wedding of ${names}`;
  if (kind === "birthday") return `to the birthday celebration for ${names}`;
  return `to ${input.title.trim() || names}`;
}

export function createVerificationCode(random: (max: number) => number = (max) => randomInt(max)): string {
  return random(1_000_000).toString().padStart(6, "0");
}

export function hashVerificationCode(code: string, guestId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${guestId}:${code}`).digest("hex");
}

export function verificationCodeMatches(code: string, guestId: string, hash: string, secret: string): boolean {
  try {
    const actual = Buffer.from(hashVerificationCode(code, guestId, secret), "hex");
    const expected = Buffer.from(hash, "hex");
    return actual.length === expected.length && actual.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function parseSmsKeyword(body: string): "stop" | "start" | null {
  const normalized = body.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (STOP_KEYWORDS.has(normalized)) return "stop";
  if (START_KEYWORDS.has(normalized)) return "start";
  return null;
}

export function mapTwilioDeliveryStatus(status: string): "sent" | "delivered" | "failed" | null {
  const value = status.trim().toLowerCase();
  if (value === "delivered") return "delivered";
  if (value === "undelivered" || value === "failed") return "failed";
  if (value === "sent" || value === "queued" || value === "sending" || value === "accepted") return "sent";
  return null;
}

export function nextDeliveryStatus(current: GuestDeliveryStatus, incoming: "sent" | "delivered" | "failed"): GuestDeliveryStatus {
  if (current === "delivered" && incoming !== "delivered") return current;
  if (current === "failed" && incoming === "sent") return current;
  if (incoming === "failed") return "failed";
  if (incoming === "delivered") return "delivered";
  if (current === "not_sent" || current === "sending") return "sent";
  return current;
}

export function assessGuestRsvp(input: {
  attending: boolean;
  partySize: number;
  seatsAllowed: number;
}): { ok: true; partySize: number } | { ok: false; code: "invalid_party" | "over_seats" } {
  if (!input.attending) return { ok: true, partySize: 0 };
  if (!Number.isInteger(input.partySize) || input.partySize < 1) return { ok: false, code: "invalid_party" };
  if (input.partySize > input.seatsAllowed || input.partySize > MAX_SEATS) return { ok: false, code: "over_seats" };
  return { ok: true, partySize: input.partySize };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseGuestDraft(input: {
  fullName?: unknown;
  phone?: unknown;
  email?: unknown;
  seatsAllowed?: unknown;
  household?: unknown;
}): { ok: true; value: GuestDraft } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  if (!fullName || fullName.length > 120) errors.fullName = "Enter the guest's name.";
  const phone = typeof input.phone === "string" ? normalizeGuestPhone(input.phone) : null;
  if (!phone) errors.phone = "Enter a valid mobile number.";
  let email: string | null = null;
  if (typeof input.email === "string" && input.email.trim()) {
    email = input.email.trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 200) errors.email = "Enter a valid email or leave it blank.";
  }
  const seatsRaw = input.seatsAllowed === undefined || input.seatsAllowed === "" ? 1 : Number(input.seatsAllowed);
  if (!Number.isInteger(seatsRaw) || seatsRaw < 1 || seatsRaw > MAX_SEATS) errors.seatsAllowed = "Choose a party size from 1 to 20.";
  let household: string | null = null;
  if (typeof input.household === "string" && input.household.trim()) {
    household = input.household.trim();
    if (household.length > 80) errors.household = "Keep the household label under 80 characters.";
  }
  if (Object.keys(errors).length || !phone) return { ok: false, errors };
  return { ok: true, value: { fullName, phoneE164: phone, email, seatsAllowed: seatsRaw, household } };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === "\"" && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else if (char === "\"") quoted = false;
      else current += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header.trim().toLowerCase()));
}

export function parseGuestCsv(text: string): {
  guests: GuestDraft[];
  errors: { line: number; message: string }[];
} {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { guests: [], errors: [{ line: 1, message: "The file is empty." }] };
  const first = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = first.some((cell) => ["name", "full name", "guest", "phone", "mobile", "email"].includes(cell));
  const start = hasHeader ? 1 : 0;
  const nameAt = hasHeader ? headerIndex(first, ["name", "full name", "guest", "guest name"]) : 0;
  const phoneAt = hasHeader ? headerIndex(first, ["phone", "mobile", "mobile phone", "cell"]) : 1;
  const seatsAt = hasHeader ? headerIndex(first, ["seats", "seats allowed", "party size", "max party size", "party"]) : 2;
  const emailAt = hasHeader ? headerIndex(first, ["email", "e-mail"]) : 3;
  const householdAt = hasHeader ? headerIndex(first, ["household", "group", "family"]) : 4;
  if (nameAt < 0 || phoneAt < 0) {
    return { guests: [], errors: [{ line: 1, message: "Include name and mobile columns." }] };
  }
  const guests: GuestDraft[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  for (let index = start; index < lines.length; index += 1) {
    if (guests.length + errors.length >= 500) {
      errors.push({ line: index + 1, message: "Only the first 500 rows can be imported at once." });
      break;
    }
    const cells = parseCsvLine(lines[index]);
    const parsed = parseGuestDraft({
      fullName: cells[nameAt] ?? "",
      phone: cells[phoneAt] ?? "",
      seatsAllowed: seatsAt >= 0 ? cells[seatsAt] : undefined,
      email: emailAt >= 0 ? cells[emailAt] : undefined,
      household: householdAt >= 0 ? cells[householdAt] : undefined,
    });
    if (!parsed.ok) {
      errors.push({ line: index + 1, message: Object.values(parsed.errors)[0] ?? "Check this row." });
      continue;
    }
    if (seen.has(parsed.value.phoneE164)) {
      errors.push({ line: index + 1, message: "This mobile number is repeated in the file." });
      continue;
    }
    seen.add(parsed.value.phoneE164);
    guests.push(parsed.value);
  }
  return { guests, errors };
}

export function guestListStats(items: readonly GuestListItem[]) {
  const byStatus = {
    not_sent: 0, sent: 0, delivered: 0, failed: 0, opened: 0, attending: 0, declined: 0, opted_out: 0,
  };
  let attendingSeats = 0;
  let seatsReserved = 0;
  for (const item of items) {
    byStatus[item.status] += 1;
    seatsReserved += item.seatsAllowed;
    if (item.status === "attending") attendingSeats += item.partySize ?? 0;
  }
  return { guests: items.length, attendingSeats, seatsReserved, byStatus };
}

export function replySummary(items: readonly GuestListItem[]) {
  const stats = guestListStats(items);
  const opened = stats.byStatus.opened + stats.byStatus.attending + stats.byStatus.declined;
  const waiting = stats.byStatus.not_sent + stats.byStatus.sent + stats.byStatus.delivered + stats.byStatus.opened;
  const remindable = stats.byStatus.sent + stats.byStatus.delivered + stats.byStatus.opened;
  const attendingParties = stats.byStatus.attending;
  const totalParties = attendingParties + stats.byStatus.declined + waiting;
  return {
    invited: stats.guests,
    opened,
    attendingSeats: stats.attendingSeats,
    declined: stats.byStatus.declined,
    waiting,
    remindable,
    attendingParties,
    bar: totalParties === 0
      ? { attending: 0, declined: 0, waiting: 0 }
      : {
          attending: Math.round((attendingParties / totalParties) * 100),
          declined: Math.round((stats.byStatus.declined / totalParties) * 100),
          waiting: Math.round((waiting / totalParties) * 100),
        },
  };
}

export function outboundEstimate(bodies: readonly string[]) {
  const segments = bodies.reduce((total, body) => total + smsSegmentCount(body).segments, 0);
  return { invitations: bodies.length, segments, perMessage: bodies[0] ? smsSegmentCount(bodies[0]).segments : 0 };
}

export function twilioSignatureMatches(authToken: string, signature: string, url: string, params: Record<string, string>): boolean {
  try {
    const payload = Object.keys(params).sort().reduce((data, key) => data + key + params[key], url);
    const expected = createHmac("sha1", authToken).update(payload).digest("base64");
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  } catch {
    return false;
  }
}
