import type { InvitationLocale } from "./types";

/**
 * The same opt-out line private-list invite, reminder, and verification
 * texts use. STOP/START replies are stored by normalized E.164 on
 * invitation_sms_opt_outs (one row per phone, not per event or sending
 * number). START deletes that row.
 */
export const SMS_OPT_OUT_LINE = {
  en: "Reply STOP to opt out",
  es: "Responde STOP para cancelar",
} as const;

export function smsOptOutLine(locale: InvitationLocale): string {
  return locale === "es" ? SMS_OPT_OUT_LINE.es : SMS_OPT_OUT_LINE.en;
}

export function smsBodyHasOptOut(body: string): boolean {
  const lower = body.toLowerCase();
  return lower.includes(SMS_OPT_OUT_LINE.en.toLowerCase()) || lower.includes(SMS_OPT_OUT_LINE.es.toLowerCase());
}

/** Append the locale's opt-out line once. A host who already typed either line keeps their text. */
export function withSmsOptOutFooter(body: string, locale: InvitationLocale): string {
  const trimmed = body.trim();
  if (!trimmed || smsBodyHasOptOut(trimmed)) return trimmed;
  return `${trimmed}\n${smsOptOutLine(locale)}`;
}
