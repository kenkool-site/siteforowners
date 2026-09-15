import { toE164 } from "@/lib/sms";
import type { InvitationEventForManagement } from "./repository-core";
import type { InvitationEventStatus, InvitationLocale } from "./types";

export type ParsedRsvpInput = {
  primaryName: string;
  email: string | null;
  phone: string | null;
  attending: boolean;
  partySize: number;
  additionalGuestNames: string[];
  dietaryOrAccessibilityNotes: string | null;
  message: string | null;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

export const INVITATION_THEME_KEYS = ["classic", "romantic", "celebration"] as const;
export const INVITATION_FONT_PAIR_KEYS = ["fraunces-geist", "geist-geist"] as const;

export type InvitationThemeKey = typeof INVITATION_THEME_KEYS[number];
export type InvitationFontPairKey = typeof INVITATION_FONT_PAIR_KEYS[number];
export type InvitationEditorMode = "founder" | "owner";
export type InvitationStatusCommand = "publish" | "close" | "reopen" | "expire" | "offline" | "draft";

export type InvitationEventUpdate = {
  eventType?: string;
  locale?: InvitationLocale;
  title?: string;
  honoreeNames?: string;
  description?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string;
  venueName?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  themeKey?: InvitationThemeKey;
  primaryColor?: string;
  accentColor?: string;
  fontPairKey?: InvitationFontPairKey;
  passcode?: string;
  removePasscode?: true;
  showPublicRsvpCount?: boolean;
  capacity?: number | null;
  rsvpDeadline?: string | null;
  submissionLimit?: number;
  emailNotificationLimit?: number;
  smsNotificationLimit?: number;
  ownerEmailNotifications?: boolean;
  ownerSmsNotifications?: boolean;
  notificationEmail?: string | null;
  notificationPhone?: string | null;
  guestEmailConfirmations?: boolean;
  expireAt?: string | null;
};

export type InvitationOwnerCredentialUpdate = {
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string | null;
  newOwnerPin?: string;
};

type EventTimingContext = Pick<
  InvitationEventForManagement,
  "startsAt" | "endsAt" | "rsvpDeadline" | "expireAt" | "notificationPhone" | "ownerSmsNotifications"
>;

export type PublishableEvent = Pick<
  InvitationEventForManagement,
  | "title"
  | "honoreeNames"
  | "startsAt"
  | "endsAt"
  | "rsvpDeadline"
  | "expireAt"
  | "timezone"
  | "venueName"
  | "address"
  | "notificationEmail"
  | "designedInvitePath"
  | "coverImagePath"
  | "videoPath"
>;

export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeInvitationPhone(value: string): string | null {
  return toE164(value);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseOptionalInstant(
  body: Record<string, unknown>,
  key: "startsAt" | "endsAt" | "rsvpDeadline" | "expireAt",
  output: InvitationEventUpdate,
  errors: Record<string, string>,
): void {
  if (!(key in body)) return;
  const value = body[key];
  if (value === null || value === "") {
    output[key] = null;
  } else if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    output[key] = new Date(value).toISOString();
  } else {
    errors[key] = "Enter a valid date and time.";
  }
}

function parsePositiveInteger(
  body: Record<string, unknown>,
  key: "capacity" | "submissionLimit" | "emailNotificationLimit" | "smsNotificationLimit",
  output: InvitationEventUpdate,
  errors: Record<string, string>,
  nullable: boolean,
): void {
  if (!(key in body)) return;
  const value = body[key];
  if (nullable && (value === null || value === "")) {
    output.capacity = null;
  } else if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    output[key] = value;
  } else {
    errors[key] = "Enter a whole number greater than zero.";
  }
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function isValidMediaPath(value: string | null): boolean {
  return Boolean(value && value.trim() && !/^(?:data|blob|javascript):/i.test(value));
}

export function parseEventUpdate(
  input: unknown,
  mode: InvitationEditorMode,
  current?: Partial<EventTimingContext>,
): ParseResult<InvitationEventUpdate> {
  if (!isPlainObject(input)) return { ok: false, errors: { form: "Send valid event details." } };
  const body = input;
  const value: InvitationEventUpdate = {};
  const errors: Record<string, string> = {};

  if (["designedInvitePath", "coverImagePath", "videoPath"].some((key) => key in body)) {
    errors.media = "Use the media upload endpoint to change invitation media.";
  }

  for (const key of ["eventType", "title", "honoreeNames", "description", "timezone"] as const) {
    if (!(key in body)) continue;
    if (typeof body[key] !== "string") {
      errors[key] = "Enter text for this field.";
      continue;
    }
    value[key] = body[key].trim();
  }
  if (value.timezone !== undefined && (!value.timezone || !isTimezone(value.timezone))) {
    errors.timezone = "Choose a valid timezone.";
  }

  for (const key of ["venueName", "address", "mapUrl"] as const) {
    if (!(key in body)) continue;
    if (body[key] !== null && typeof body[key] !== "string") {
      errors[key] = "Enter text for this field.";
      continue;
    }
    value[key] = normalizeOptionalText(body[key] as string | null);
  }

  if ("locale" in body) {
    if (body.locale === "en" || body.locale === "es") value.locale = body.locale;
    else errors.locale = "Choose English or Spanish.";
  }
  if ("themeKey" in body) {
    if (typeof body.themeKey === "string" && INVITATION_THEME_KEYS.includes(body.themeKey as InvitationThemeKey)) {
      value.themeKey = body.themeKey as InvitationThemeKey;
    } else errors.themeKey = "Choose one of the available themes.";
  }
  if ("fontPairKey" in body) {
    if (typeof body.fontPairKey === "string" && INVITATION_FONT_PAIR_KEYS.includes(body.fontPairKey as InvitationFontPairKey)) {
      value.fontPairKey = body.fontPairKey as InvitationFontPairKey;
    } else errors.fontPairKey = "Choose one of the available font pairs.";
  }
  for (const key of ["primaryColor", "accentColor"] as const) {
    if (!(key in body)) continue;
    if (typeof body[key] === "string" && /^#[0-9a-f]{6}$/i.test(body[key])) value[key] = body[key].toUpperCase();
    else errors[key] = "Choose a six-digit hex color.";
  }

  parseOptionalInstant(body, "startsAt", value, errors);
  parseOptionalInstant(body, "endsAt", value, errors);
  parseOptionalInstant(body, "rsvpDeadline", value, errors);
  parseOptionalInstant(body, "expireAt", value, errors);
  parsePositiveInteger(body, "capacity", value, errors, true);

  for (const key of [
    "showPublicRsvpCount",
    "ownerEmailNotifications",
    "ownerSmsNotifications",
    "guestEmailConfirmations",
  ] as const) {
    if (!(key in body)) continue;
    if (typeof body[key] === "boolean") value[key] = body[key];
    else errors[key] = "Choose on or off.";
  }

  if ("notificationEmail" in body) {
    if (body.notificationEmail === null || body.notificationEmail === "") value.notificationEmail = null;
    else if (typeof body.notificationEmail === "string" && isEmail(normalizeInvitationEmail(body.notificationEmail))) {
      value.notificationEmail = normalizeInvitationEmail(body.notificationEmail);
    } else errors.notificationEmail = "Enter a valid notification email address.";
  }
  if ("notificationPhone" in body) {
    if (body.notificationPhone === null || body.notificationPhone === "") value.notificationPhone = null;
    else if (typeof body.notificationPhone === "string") {
      const phone = normalizeInvitationPhone(body.notificationPhone);
      if (phone) value.notificationPhone = phone;
      else errors.notificationPhone = "Enter a valid notification phone number.";
    } else errors.notificationPhone = "Enter a valid notification phone number.";
  }

  if ("passcode" in body) {
    if (typeof body.passcode === "string" && body.passcode.trim().length >= 4) value.passcode = body.passcode.trim();
    else errors.passcode = "Use at least 4 characters for the passcode.";
  }
  if (body.removePasscode === true) value.removePasscode = true;
  else if ("removePasscode" in body && body.removePasscode !== false) errors.removePasscode = "Choose whether to remove the passcode.";
  if (value.passcode && value.removePasscode) errors.passcode = "Set a new passcode or remove the current one, not both.";

  if (mode === "founder") {
    parsePositiveInteger(body, "submissionLimit", value, errors, false);
    parsePositiveInteger(body, "emailNotificationLimit", value, errors, false);
    parsePositiveInteger(body, "smsNotificationLimit", value, errors, false);
  }

  const startsAt = value.startsAt !== undefined ? value.startsAt : current?.startsAt;
  const endsAt = value.endsAt !== undefined ? value.endsAt : current?.endsAt;
  const rsvpDeadline = value.rsvpDeadline !== undefined ? value.rsvpDeadline : current?.rsvpDeadline;
  const expireAt = value.expireAt !== undefined ? value.expireAt : current?.expireAt;
  const smsEnabled = value.ownerSmsNotifications ?? current?.ownerSmsNotifications ?? false;
  const phone = value.notificationPhone !== undefined ? value.notificationPhone : current?.notificationPhone;

  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    errors.endsAt = "Choose an end time later than the start time.";
  }
  if (startsAt && rsvpDeadline && Date.parse(rsvpDeadline) > Date.parse(startsAt)) {
    errors.rsvpDeadline = "Choose an RSVP deadline on or before the event start.";
  }
  if (startsAt && expireAt && Date.parse(expireAt) <= Date.parse(startsAt)) {
    errors.expireAt = "Choose an expiry time later than the event start.";
  }
  if (smsEnabled && !phone) errors.notificationPhone = "Enter a valid phone number before turning on text notifications.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function parseOwnerCredentialUpdate(input: unknown): ParseResult<InvitationOwnerCredentialUpdate> {
  if (!isPlainObject(input)) return { ok: false, errors: { form: "Send valid owner details." } };
  const value: InvitationOwnerCredentialUpdate = {};
  const errors: Record<string, string> = {};

  if ("ownerName" in input) {
    if (typeof input.ownerName === "string" && input.ownerName.trim()) value.ownerName = input.ownerName.trim();
    else errors.ownerName = "Enter the owner's name.";
  }
  if ("ownerEmail" in input) {
    const email = typeof input.ownerEmail === "string" ? normalizeInvitationEmail(input.ownerEmail) : "";
    if (isEmail(email)) value.ownerEmail = email;
    else errors.ownerEmail = "Enter a valid owner email address.";
  }
  if ("ownerPhone" in input) {
    if (input.ownerPhone === null || input.ownerPhone === "") value.ownerPhone = null;
    else if (typeof input.ownerPhone === "string") {
      const phone = normalizeInvitationPhone(input.ownerPhone);
      if (phone) value.ownerPhone = phone;
      else errors.ownerPhone = "Enter a valid owner phone number.";
    } else errors.ownerPhone = "Enter a valid owner phone number.";
  }
  if ("newOwnerPin" in input) {
    if (typeof input.newOwnerPin === "string" && /^\d{6}$/.test(input.newOwnerPin)) value.newOwnerPin = input.newOwnerPin;
    else errors.newOwnerPin = "Use exactly six digits for the new owner PIN.";
  }
  if (Object.keys(value).length === 0 && Object.keys(errors).length === 0) {
    errors.form = "Enter at least one owner credential change.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function validatePublishableEvent(
  event: PublishableEvent,
  options: { now?: Date; allowPastEvent?: boolean; mediaValid?: boolean } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!hasText(event.title)) errors.title = "Add an event title before publishing.";
  if (!hasText(event.honoreeNames)) errors.honoreeNames = "Add the honoree names before publishing.";
  if (!event.startsAt || Number.isNaN(Date.parse(event.startsAt))) errors.startsAt = "Choose a valid event start time before publishing.";
  else if (!options.allowPastEvent && Date.parse(event.startsAt) <= (options.now ?? new Date()).getTime()) {
    errors.startsAt = "Choose a future event start, or ask the founder to allow a past event.";
  }
  if (event.startsAt && event.endsAt && Date.parse(event.endsAt) <= Date.parse(event.startsAt)) {
    errors.endsAt = "Choose an end time later than the start time.";
  }
  if (event.startsAt && event.rsvpDeadline && Date.parse(event.rsvpDeadline) > Date.parse(event.startsAt)) {
    errors.rsvpDeadline = "Choose an RSVP deadline on or before the event start.";
  }
  if (event.startsAt && event.expireAt && Date.parse(event.expireAt) <= Date.parse(event.startsAt)) {
    errors.expireAt = "Choose an expiry time later than the event start.";
  }
  if (!event.timezone || !isTimezone(event.timezone)) errors.timezone = "Choose a valid timezone before publishing.";
  if (!hasText(event.venueName)) errors.venueName = "Add the venue name before publishing.";
  if (!hasText(event.address)) errors.address = "Add the event address before publishing.";
  if (!event.notificationEmail || !isEmail(event.notificationEmail)) errors.notificationEmail = "Add a valid notification email before publishing.";
  const hasMedia = [event.designedInvitePath, event.coverImagePath, event.videoPath].some(isValidMediaPath);
  if (!hasMedia || options.mediaValid === false) errors.media = "Add valid invitation media before publishing.";
  return errors;
}

const STATUS_BY_COMMAND: Record<InvitationStatusCommand, InvitationEventStatus> = {
  publish: "published",
  close: "rsvp_closed",
  reopen: "published",
  expire: "expired",
  offline: "offline",
  draft: "draft",
};

const STATUS_COMMANDS: Record<InvitationEventStatus, readonly InvitationStatusCommand[]> = {
  draft: ["publish", "offline"],
  published: ["close", "expire", "offline", "draft"],
  rsvp_closed: ["reopen", "expire", "offline", "draft"],
  expired: ["offline", "draft"],
  offline: ["publish", "draft"],
};

export function isStatusCommandAllowed(
  currentStatus: InvitationEventStatus,
  command: InvitationStatusCommand,
): boolean {
  return STATUS_COMMANDS[currentStatus].includes(command);
}

export function validateStatusTransition(
  event: PublishableEvent & { status: InvitationEventStatus },
  command: InvitationStatusCommand,
  actor: InvitationEditorMode,
  options: { now?: Date; allowPastEvent?: boolean; mediaValid?: boolean } = {},
): Record<string, string> {
  if (!isStatusCommandAllowed(event.status, command)) {
    return { command: "That action is not available from the current status." };
  }
  if (STATUS_BY_COMMAND[command] !== "published") return {};
  return validatePublishableEvent(event, {
    now: options.now,
    mediaValid: options.mediaValid,
    allowPastEvent: actor === "founder" && options.allowPastEvent === true,
  });
}

export function parseStatusCommand(input: unknown):
  | { ok: true; command: InvitationStatusCommand; status: InvitationEventStatus }
  | { ok: false; errors: Record<string, string> } {
  if (!isPlainObject(input) || typeof input.command !== "string" || !(input.command in STATUS_BY_COMMAND)) {
    return { ok: false, errors: { command: "Choose a valid invitation status action." } };
  }
  const command = input.command as InvitationStatusCommand;
  return { ok: true, command, status: STATUS_BY_COMMAND[command] };
}

function normalizeGuestNames(value: string[] | undefined): string[] {
  return (value ?? []).map((name) => name.trim()).filter(Boolean);
}

export function parseRsvpInput(input: unknown): ParseResult<ParsedRsvpInput> {
  if (!isPlainObject(input)) return { ok: false, errors: { form: "Send valid RSVP details" } };
  const errors: Record<string, string> = {};
  const primaryName = typeof input.primaryName === "string" ? input.primaryName.trim() : "";
  const email = typeof input.email === "string" || input.email === null
    ? normalizeOptionalText(input.email)
    : null;
  const phoneInput = typeof input.phone === "string" || input.phone === null
    ? normalizeOptionalText(input.phone)
    : null;
  const phone = phoneInput ? normalizeInvitationPhone(phoneInput) : null;

  if (!primaryName) errors.primaryName = "Name is required";
  if (email && !isEmail(normalizeInvitationEmail(email))) errors.email = "Enter a valid email address";
  if (phoneInput && !phone) errors.phone = "Enter a valid phone number";
  if (!email && !phone) errors.contact = "Email or phone is required";
  if (typeof input.attending !== "boolean") errors.attending = "Attendance is required";

  const suppliedPartySize = input.partySize === undefined
    ? 1
    : typeof input.partySize === "number"
      ? input.partySize
      : Number.NaN;
  if (input.attending && (!Number.isInteger(suppliedPartySize) || suppliedPartySize < 1)) {
    errors.partySize = "Party size must be at least 1";
  }
  const guestNamesInput = input.additionalGuestNames;
  if (guestNamesInput !== undefined && (
    !Array.isArray(guestNamesInput)
    || guestNamesInput.some((name) => typeof name !== "string")
  )) errors.additionalGuestNames = "Enter valid additional guest names";
  const additionalGuestNames = Array.isArray(guestNamesInput)
    && guestNamesInput.every((name): name is string => typeof name === "string")
    ? normalizeGuestNames(guestNamesInput)
    : [];
  if (
    input.attending === true
    && Number.isInteger(suppliedPartySize)
    && additionalGuestNames.length > (suppliedPartySize as number) - 1
  ) errors.additionalGuestNames = "Additional guest names cannot exceed the party size";

  for (const key of ["dietaryOrAccessibilityNotes", "message"] as const) {
    if (input[key] !== undefined && input[key] !== null && typeof input[key] !== "string") {
      errors[key] = "Enter valid text";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      primaryName,
      email: email ? normalizeInvitationEmail(email) : null,
      phone,
      attending: input.attending as boolean,
      partySize: input.attending ? suppliedPartySize as number : 0,
      additionalGuestNames: input.attending ? additionalGuestNames : [],
      dietaryOrAccessibilityNotes: normalizeOptionalText(input.dietaryOrAccessibilityNotes as string | null | undefined),
      message: normalizeOptionalText(input.message as string | null | undefined),
    },
  };
}
