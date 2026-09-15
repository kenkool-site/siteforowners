export const RESERVED_PLATFORM_SUBDOMAINS = new Set([
  "www", "api", "admin", "app", "mail", "support", "help", "status",
  "static", "assets", "cdn", "dashboard", "invitations", "invite", "login", "preview",
]);

/** Normalize a human-readable name into one DNS-safe platform label. */
export function normalizePlatformSubdomain(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export type PlatformSubdomainValidation =
  | { ok: true; value: string }
  | { ok: false; error: "required" | "invalid" | "reserved" };

export function validatePlatformSubdomain(value: string): PlatformSubdomainValidation {
  if (!value.trim()) return { ok: false, error: "required" };
  const normalized = normalizePlatformSubdomain(value);
  if (!normalized) return { ok: false, error: "invalid" };
  if (RESERVED_PLATFORM_SUBDOMAINS.has(normalized)) return { ok: false, error: "reserved" };
  return { ok: true, value: normalized };
}

/** Compatibility name for existing tenant provisioning call sites. */
export function generateSubdomain(businessName: string): string {
  return normalizePlatformSubdomain(businessName);
}

/**
 * Deterministically pick the first free subdomain: `base`, then `base-2`,
 * `base-3`, … Reserves room for the numeric suffix so candidates stay distinct
 * and ≤ 40 chars even for a 40-char base. `isTaken` reports whether a candidate
 * already exists. Throws if 9999 candidates are all taken (never expected).
 */
export function pickAvailableSubdomain(
  base: string,
  isTaken: (candidate: string) => boolean,
): string {
  const root = base || "site";
  if (!isTaken(root)) return root;
  for (let suffix = 2; suffix <= 9999; suffix++) {
    const tag = `-${suffix}`;
    const candidate = `${root.slice(0, 40 - tag.length)}${tag}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error("pickAvailableSubdomain: no available subdomain found");
}
