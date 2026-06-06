/** Slugify a business name into a DNS-safe subdomain label (≤ 40 chars). */
export function generateSubdomain(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
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
