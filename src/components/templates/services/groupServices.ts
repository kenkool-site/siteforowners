import type { ServiceItem } from "@/lib/ai/types";

export interface ServiceGroup {
  /** null when no categories are defined → render as flat list. */
  label: string | null;
  services: ServiceItem[];
}

/**
 * Group services by category. Pure: returns a fresh array; no mutation.
 *
 * Rules:
 *   - Featured services (is_featured) are peeled into a "Featured" group at the top,
 *     in their original array order, and removed from any category group below.
 *   - Empty/undefined categories → single group with label=null and the remaining
 *     (non-featured) services.
 *   - Each category in `categories` becomes a group in the same order.
 *   - Services whose category is missing or no longer in `categories` go into "Other".
 *   - Empty groups are dropped (no header rendered for a category with zero services).
 */
export function groupServices(
  services: ServiceItem[],
  categories: string[] | undefined,
): ServiceGroup[] {
  const featured = services.filter((s) => s.is_featured);
  const rest = services.filter((s) => !s.is_featured);
  const featuredGroup: ServiceGroup[] =
    featured.length > 0 ? [{ label: "Featured", services: featured }] : [];

  if (!categories || categories.length === 0) {
    return [...featuredGroup, { label: null, services: rest }].filter(
      (g) => g.services.length > 0,
    );
  }
  const allowed = new Set(categories);
  const categoryGroups: ServiceGroup[] = categories.map((label) => ({
    label,
    services: rest.filter((s) => s.category === label),
  }));
  const uncategorized = rest.filter(
    (s) => !s.category || !allowed.has(s.category),
  );
  if (uncategorized.length > 0) {
    categoryGroups.push({ label: "Other", services: uncategorized });
  }
  return [...featuredGroup, ...categoryGroups].filter(
    (g) => g.services.length > 0,
  );
}
