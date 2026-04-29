import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless HMAC tokens for the customer reschedule link. The signed
 * payload is `${bookingId}.${expiry}` where expiry is unix seconds.
 *
 * The secret is read at sign/verify time so tests can mutate
 * process.env between cases. Production must set
 * RESCHEDULE_TOKEN_SECRET (≥32 bytes recommended); routes that depend
 * on this module surface a 500 if it's missing rather than silently
 * accepting unsigned tokens.
 */

interface SignInput {
  bookingId: string;
  expiry: number;
}

interface VerifyInput extends SignInput {
  signature: string;
}

type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "bad_signature" };

function getSecret(): string {
  const s = process.env.RESCHEDULE_TOKEN_SECRET;
  if (!s) {
    throw new Error("RESCHEDULE_TOKEN_SECRET is not set");
  }
  return s;
}

function computeSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken({ bookingId, expiry }: SignInput): string {
  const secret = getSecret();
  return computeSignature(secret, `${bookingId}.${expiry}`);
}

export function verifyToken({ bookingId, expiry, signature }: VerifyInput): VerifyResult {
  const secret = getSecret();
  const expected = computeSignature(secret, `${bookingId}.${expiry}`);
  // timingSafeEqual requires equal-length buffers; bail early on length mismatch.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (expiry < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function buildRescheduleUrl(
  appUrl: string,
  bookingId: string,
  expiry: number,
): string {
  const sig = signToken({ bookingId, expiry });
  const base = appUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ b: bookingId, e: String(expiry), s: sig });
  return `${base}/reschedule?${params.toString()}`;
}

/**
 * Convert a booking date+time string (e.g. "2026-05-01" + "11:00 AM")
 * to a unix-seconds expiry. Floating local time, same convention as
 * the .ics generator. Used by the routes when minting tokens.
 */
export function bookingStartToExpiry(bookingDate: string, bookingTime: string): number {
  const dateObj = new Date(bookingDate + "T00:00:00");
  const m = bookingTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return Math.floor(dateObj.getTime() / 1000);
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const period = m[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  dateObj.setHours(hours, minutes, 0, 0);
  return Math.floor(dateObj.getTime() / 1000);
}
