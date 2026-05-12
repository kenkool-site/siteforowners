// 10-char base62 short codes used for customer-facing short URLs
// (e.g. /r/<code> → 302 redirect to a long signed reschedule URL).
//
// Not key material — short codes are guards against guessing, not
// authentication. The signed token in the redirect target is what
// enforces booking-level auth. So minor modular bias from
// `byte % 62` (chars 0–3 are slightly more likely than 4–61) is
// acceptable.
//
// 62^10 ≈ 8.4×10^17 possible codes — collisions are unrealistic at
// any expected booking volume.

const BASE62_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateShortCode(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE62_CHARS[bytes[i] % BASE62_CHARS.length];
  }
  return out;
}

/** Validation predicate used by route handlers to reject malformed
 *  short-code paths cheaply before hitting the DB. */
export function isValidShortCodeShape(s: string): boolean {
  return typeof s === "string" && /^[A-Za-z0-9]{4,32}$/.test(s);
}
