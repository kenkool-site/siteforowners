// SMS via Twilio. Pure helpers (toE164, isReminderDue, tomorrowIsoUtc)
// are testable; the send functions short-circuit when TWILIO_* env vars
// are missing so dev environments without Twilio still work normally.
//
// v1 assumptions:
//   - US/Canada numbers only (+1 default country code)
//   - Single shared TWILIO_FROM number (no per-tenant numbers)
//   - Twilio's automatic STOP handling is sufficient (no webhook)

/**
 * Normalize a raw phone string to Twilio's required E.164 format.
 * Returns null for inputs that can't be confidently normalized.
 */
export function toE164(raw: string, defaultCountry = "1"): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+") && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export type ReminderRow = {
  id: string;
  booking_date: string;
  status: string;
  customer_sms_opt_in: boolean;
  sms_reminder_sent: boolean;
};

/**
 * Belt-and-suspenders predicate: even though the SQL filters on these
 * conditions, re-check in app code so a typo in the query can't ship
 * a reminder to a canceled booking.
 */
export function isReminderDue(row: ReminderRow, tomorrowIso: string): boolean {
  return (
    row.status === "confirmed" &&
    row.customer_sms_opt_in === true &&
    row.sms_reminder_sent === false &&
    row.booking_date === tomorrowIso
  );
}

/**
 * Returns the YYYY-MM-DD date string for "tomorrow" in UTC, given a
 * reference `now`. Pure: no Date.now() reads inside.
 */
export function tomorrowIsoUtc(now: Date): string {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return t.toISOString().slice(0, 10);
}
