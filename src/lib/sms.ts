// SMS via Twilio. Pure helpers (toE164, isReminderDue, tomorrowIsoUtc)
// are testable; the send functions short-circuit when TWILIO_* env vars
// are missing so dev environments without Twilio still work normally.
//
// v1 assumptions:
//   - US/Canada numbers only (+1 default country code)
//   - Single shared TWILIO_FROM number (no per-tenant numbers)
//   - Twilio's automatic STOP handling is sufficient (no webhook)

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

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

export interface BookingSmsData {
  businessName: string;
  serviceName: string;
  date: string;          // "Sat May 2"
  time: string;          // "10:00 AM – 1:00 PM"
  customerName: string;
  customerPhone: string;
  businessAddress?: string;
  /** Spec 4: optional add-on names selected at booking time. */
  addOnNames?: string[];
  /** Spec 5: deposit amount in dollars (snapshotted at booking time). Falsy = no deposit. */
  depositAmount?: number;
  /** Spec 5: free-form payment instructions to include in pending notifications. */
  depositInstructions?: string;
}

async function send(to: string, body: string): Promise<void> {
  if (!client || !fromNumber) return;
  const normalized = toE164(to);
  if (!normalized) {
    console.warn("[sms] could not normalize destination phone", { to });
    return;
  }
  try {
    await client.messages.create({ from: fromNumber, to: normalized, body });
  } catch (err) {
    console.error("[sms] send failed", { to: normalized, err });
  }
}

export async function sendBookingOwnerNotification(ownerPhone: string, b: BookingSmsData): Promise<void> {
  if (!ownerPhone) return;
  const addOns = b.addOnNames && b.addOnNames.length > 0
    ? ` (+ ${b.addOnNames.join(", ")})`
    : "";
  await send(
    ownerPhone,
    `🔔 New booking: ${b.customerName}, ${b.serviceName}${addOns}, ${b.date} @ ${b.time}.`,
  );
}

export async function sendBookingCustomerConfirmation(b: BookingSmsData): Promise<void> {
  const addr = b.businessAddress ? ` Address: ${b.businessAddress}.` : "";
  await send(
    b.customerPhone,
    `Hi ${b.customerName.split(" ")[0]}! Your appointment at ${b.businessName} is confirmed for ${b.date} @ ${b.time}.${addr} Reply STOP to opt out.`,
  );
}

export async function sendBookingCustomerReminder(b: BookingSmsData): Promise<void> {
  const startTime = b.time.split(" – ")[0];
  await send(
    b.customerPhone,
    `Reminder: your appointment at ${b.businessName} is tomorrow (${b.date}) at ${startTime}. See you then!`,
  );
}

/** Spec 5: customer notification when a deposit-required booking is placed.
 * Leads with the action and amount so the customer knows what to do next. */
export async function sendBookingPendingDepositCustomer(b: BookingSmsData): Promise<void> {
  const amt = b.depositAmount ?? 0;
  const instr = b.depositInstructions ?? "";
  const firstName = b.customerName.split(" ")[0];
  await send(
    b.customerPhone,
    `Hi ${firstName}! Your booking at ${b.businessName} on ${b.date} @ ${b.time} is pending. Pay $${amt.toFixed(2)} to confirm: ${instr.replace(/\n/g, " · ")}. Reply STOP to opt out.`,
  );
}

/** Spec 5: customer notification when the owner marks the deposit received. */
export async function sendBookingDepositReceivedCustomer(b: BookingSmsData): Promise<void> {
  const firstName = b.customerName.split(" ")[0];
  await send(
    b.customerPhone,
    `✓ Got it! Your deposit is received and your booking at ${b.businessName} is confirmed for ${b.date} @ ${b.time}. See you then!`,
  );
}

/** Spec 5: customer notification when a booking is canceled (paid or not). */
export async function sendBookingCanceledCustomer(b: BookingSmsData): Promise<void> {
  await send(
    b.customerPhone,
    `Your booking at ${b.businessName} for ${b.date} @ ${b.time} has been canceled. Questions? Reply or call.`,
  );
}
