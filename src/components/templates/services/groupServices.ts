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
 *   - Empty/undefined categories → single group with label=null and all services.
 *   - Each category in `categories` becomes a group in the same order.
 *   - Services whose category is missing or no longer in `categories` go into "Other".
 *   - Empty groups are dropped (no header rendered for a category with zero services).
 */
export function groupServices(
  services: ServiceItem[],
  categories: string[] | undefined,
): ServiceGroup[] {
  if (!categories || categories.length === 0) {
    return [{ label: null, services }];
  }
  const allowed = new Set(categories);
  const groups: ServiceGroup[] = categories.map((label) => ({
    label,
    services: services.filter((s) => s.category === label),
  }));
  const uncategorized = services.filter(
    (s) => !s.category || !allowed.has(s.category),
  );
  if (uncategorized.length > 0) {
    groups.push({ label: "Other", services: uncategorized });
  }
  return groups.filter((g) => g.services.length > 0);
}
