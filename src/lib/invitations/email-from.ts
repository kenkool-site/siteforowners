// InviteSpot mail keeps the verified SiteForOwners sending address (unless
// INVITATION_EMAIL_FROM_ADDRESS overrides it) and only changes the display
// name. SiteForOwners product mail in src/lib/email.ts is separate and still
// uses EMAIL_FROM as-is, including its SiteForOwners display name.

const BRAND = "InviteSpot";
const VIA_SUFFIX = " via InviteSpot";
const MAX_DISPLAY_NAME_LENGTH = 78;
const DEFAULT_ADDRESS = "hello@siteforowners.com";
const MAILBOX = /^[^\s<>"'\\@]+@[^\s<>"'\\@]+\.[^\s<>"'\\@]+$/;

export type InvitationMailEnv = {
  EMAIL_FROM?: string;
  INVITATION_EMAIL_FROM_ADDRESS?: string;
};

function mailEnv(env?: InvitationMailEnv): InvitationMailEnv {
  const source: InvitationMailEnv = env ?? {
    EMAIL_FROM: process.env.EMAIL_FROM,
    INVITATION_EMAIL_FROM_ADDRESS: process.env.INVITATION_EMAIL_FROM_ADDRESS,
  };
  return source;
}

/** Strip characters that can break or inject a From display name. */
export function sanitizeEmailDisplayName(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[<>"“”„«»\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clipDisplayName(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return chars.slice(0, max).join("").trimEnd();
}

export function guestInvitationDisplayName(hostNames: string | null | undefined): string {
  const host = sanitizeEmailDisplayName(hostNames ?? "");
  if (!host) return BRAND;
  const room = MAX_DISPLAY_NAME_LENGTH - VIA_SUFFIX.length;
  const clipped = clipDisplayName(host, Math.max(room, 0));
  if (!clipped) return BRAND;
  return clipDisplayName(`${clipped}${VIA_SUFFIX}`, MAX_DISPLAY_NAME_LENGTH) || BRAND;
}

export function hostInvitationDisplayName(): string {
  return BRAND;
}

/** Bare mailbox, or undefined when the value is missing or unsafe to put in a header. */
export function normalizeReplyToAddress(value: string | null | undefined): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return undefined;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return undefined;
  const angled = trimmed.match(/<([^<>]+)>/);
  const candidate = (angled ? angled[1] : trimmed).trim();
  if (!angled && /\s/.test(candidate)) return undefined;
  if (candidate.length > 254 || !MAILBOX.test(candidate)) return undefined;
  return candidate;
}

export function invitationSendingAddress(env?: InvitationMailEnv): string {
  const source = mailEnv(env);
  const overrideRaw = source.INVITATION_EMAIL_FROM_ADDRESS?.trim();
  if (overrideRaw) {
    const override = normalizeReplyToAddress(overrideRaw);
    if (override) return override;
  }
  return normalizeReplyToAddress(source.EMAIL_FROM) ?? DEFAULT_ADDRESS;
}

export function formatInvitationMailbox(displayName: string, address: string): string {
  const safeAddress = normalizeReplyToAddress(address) ?? DEFAULT_ADDRESS;
  const name = clipDisplayName(sanitizeEmailDisplayName(displayName), MAX_DISPLAY_NAME_LENGTH);
  if (!name) return safeAddress;
  return `"${name}" <${safeAddress}>`;
}

export function guestInvitationFrom(hostNames: string | null | undefined, env?: InvitationMailEnv): string {
  return formatInvitationMailbox(guestInvitationDisplayName(hostNames), invitationSendingAddress(env));
}

export function hostInvitationFrom(env?: InvitationMailEnv): string {
  return formatInvitationMailbox(hostInvitationDisplayName(), invitationSendingAddress(env));
}

/**
 * Reply-To for guest mail. Uses the event's host contact (notification email)
 * only when that address is usable and the owner account also has an email
 * on file. Otherwise the caller leaves Reply-To unset.
 */
export function guestReplyToAddress(input: {
  hostContactEmail?: string | null;
  ownerEmail?: string | null;
}): string | undefined {
  const host = normalizeReplyToAddress(input.hostContactEmail);
  const owner = normalizeReplyToAddress(input.ownerEmail);
  if (!host || !owner) return undefined;
  return host;
}

export function guestInvitationMail(
  input: {
    honoreeNames?: string | null;
    title?: string | null;
    hostContactEmail?: string | null;
    ownerEmail?: string | null;
  },
  env?: InvitationMailEnv,
): { from: string; replyTo?: string } {
  const hostLabel = (input.honoreeNames ?? "").trim() || (input.title ?? "").trim();
  const replyTo = guestReplyToAddress(input);
  return {
    from: guestInvitationFrom(hostLabel, env),
    ...(replyTo ? { replyTo } : {}),
  };
}

export function resendEmailFields(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): { from: string; to: string; subject: string; html: string; replyTo?: string } {
  const replyTo = normalizeReplyToAddress(input.replyTo);
  return {
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(replyTo ? { replyTo } : {}),
  };
}
