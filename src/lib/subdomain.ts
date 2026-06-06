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
 * `base-3`, … isTaken reports whether a candidate already exists.
 */
export function pickAvailableSubdomain(
  base: string,
  isTaken: (candidate: string) => boolean,
): string {
  const root = base || "site";
  if (!isTaken(root)) return root;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${root}-${suffix}`.slice(0, 40);
    if (!isTaken(candidate)) return candidate;
  }
}
