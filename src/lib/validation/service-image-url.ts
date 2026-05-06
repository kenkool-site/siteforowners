/**
 * Service row `image` validation for persisted previews.
 *
 * Booking / Maps imports legitimately attach third‑party CDN URLs (Booksy,
 * Google Photos, etc.). Older code only trusted our Supabase `service-images`
 * bucket — that blocked saves whenever any row still had an imported URL.
 */

const MAX_URL_LENGTH = 2048;

/** Our Supabase project public-object URLs only (no arbitrary paths). */
function isSupabasePublicBucketPath(url: URL, supabaseOrigin: string): boolean {
  if (url.origin !== supabaseOrigin) return false;
  const p = url.pathname;
  return (
    p.startsWith("/storage/v1/object/public/service-images/") ||
    p.startsWith("/storage/v1/object/public/preview-images/")
  );
}

function isForbiddenImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [, aStr, bStr] = m;
  const a = Number(aStr);
  const b = Number(bStr);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Shown in API validation errors (admin + founder save). */
export const PERSISTED_SERVICE_IMAGE_URL_ERROR =
  "must be HTTPS (e.g. imported thumbnails) or your Supabase service/preview image URL";

/**
 * Allowed persisted image URLs:
 * - Public objects in our Supabase `service-images` or `preview-images` buckets.
 * - Any other plain **https** URL on a non-loopback / non‑RFC1918 hostname
 *   (imported thumbnails from salons’ booking platforms).
 */
export function isValidPersistedServiceImageUrl(raw: string): boolean {
  const urlString = raw.trim();
  if (urlString === "") return true;
  if (urlString.length > MAX_URL_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (supabaseBase) {
    try {
      const origin = new URL(supabaseBase).origin;
      if (url.origin === origin) {
        return isSupabasePublicBucketPath(url, origin);
      }
    } catch {
      /* misconfigured env — fall through */
    }
  }
  if (url.protocol !== "https:") return false;
  if (isForbiddenImageHost(url.hostname)) return false;
  return true;
}

/**
 * Validate optional `image` on each object in a services array (SiteEditor / previews).
 */
export function collectInvalidServiceImageErrors(
  services: unknown,
): { index: number; field: string; reason: string }[] {
  const errors: { index: number; field: string; reason: string }[] = [];
  if (!Array.isArray(services)) return errors;
  services.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const img = (item as Record<string, unknown>).image;
    if (typeof img !== "string") return;
    const t = img.trim();
    if (!t) return;
    if (!isValidPersistedServiceImageUrl(t)) {
      errors.push({ index, field: "image", reason: PERSISTED_SERVICE_IMAGE_URL_ERROR });
    }
  });
  return errors;
}
