import { toE164 } from "@/lib/sms";
import type { RsvpInput } from "./types";

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

function normalizeGuestNames(value: string[] | undefined): string[] {
  return (value ?? []).map((name) => name.trim()).filter(Boolean);
}

export function parseRsvpInput(input: RsvpInput): ParseResult<ParsedRsvpInput> {
  const errors: Record<string, string> = {};
  const primaryName = input.primaryName.trim();
  const email = normalizeOptionalText(input.email);
  const phoneInput = normalizeOptionalText(input.phone);
  const phone = phoneInput ? normalizeInvitationPhone(phoneInput) : null;

  if (!primaryName) errors.primaryName = "Name is required";
  if (phoneInput && !phone) errors.phone = "Enter a valid phone number";
  if (!email && !phone) errors.contact = "Email or phone is required";
  if (typeof input.attending !== "boolean") errors.attending = "Attendance is required";

  const suppliedPartySize = input.partySize ?? 1;
  if (input.attending && (!Number.isInteger(suppliedPartySize) || suppliedPartySize < 1)) {
    errors.partySize = "Party size must be at least 1";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      primaryName,
      email: email ? normalizeInvitationEmail(email) : null,
      phone,
      attending: input.attending,
      partySize: input.attending ? suppliedPartySize : 0,
      additionalGuestNames: normalizeGuestNames(input.additionalGuestNames),
      dietaryOrAccessibilityNotes: normalizeOptionalText(input.dietaryOrAccessibilityNotes),
      message: normalizeOptionalText(input.message),
    },
  };
}
