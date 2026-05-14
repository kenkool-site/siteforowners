/**
 * Normalizes and validates a custom hostname for `tenants.custom_domain`.
 * Stored value matches middleware lookup (www stripped; no scheme or path).
 */
export type ParseCustomDomainResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

const HOST_RE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function parseCustomDomainForStorage(raw: unknown): ParseCustomDomainResult {
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "custom_domain must be a string or null" };
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  let host = trimmed;
  try {
    if (trimmed.includes("://")) {
      host = new URL(trimmed).hostname.toLowerCase();
    } else {
      host = trimmed.split("/")[0] ?? trimmed;
      host = host.split(":")[0] ?? host;
    }
  } catch {
    return { ok: false, error: "Invalid domain or URL" };
  }

  host = host.replace(/^www\./, "");
  if (!host) {
    return { ok: true, value: null };
  }

  if (host === "siteforowners.com" || host.endsWith(".siteforowners.com")) {
    return {
      ok: false,
      error: "Use the platform subdomain (…*.siteforowners.com) instead of custom_domain",
    };
  }

  if (!HOST_RE.test(host)) {
    return { ok: false, error: "Invalid hostname (use letters, numbers, hyphens; e.g. mariamhair.com)" };
  }

  if (host.length > 253) {
    return { ok: false, error: "Hostname is too long" };
  }

  return { ok: true, value: host };
}
