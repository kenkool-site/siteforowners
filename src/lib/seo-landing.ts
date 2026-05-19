import type { PreviewData } from "@/lib/ai/types";
import { slugifyTopic } from "@/lib/slugify-topic";

/** One composite URL segment: `{service}-{locality}` e.g. starter-locs-brooklyn */
export function buildLandingSlug(serviceName: string, locality: string): string {
  return `${slugifyTopic(serviceName)}-${slugifyTopic(locality)}`;
}

export function listLandingPages(
  preview: PreviewData,
): { slug: string; serviceName: string }[] {
  const loc = preview.seo_locality?.trim();
  if (!loc) return [];
  const seen = new Set<string>();
  const out: { slug: string; serviceName: string }[] = [];
  for (const s of preview.services ?? []) {
    const name = s.name?.trim();
    if (!name) continue;
    const slug = buildLandingSlug(name, loc);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, serviceName: name });
  }
  return out;
}

/** Resolve the first matching service whose landing slug equals `landing` (handles duplicate-name collapse). */
export function findServiceForLandingSlug(
  preview: PreviewData,
  landing: string,
): string | null {
  const loc = preview.seo_locality?.trim();
  if (!loc) return null;
  for (const s of preview.services ?? []) {
    const name = s.name?.trim();
    if (!name) continue;
    if (buildLandingSlug(name, loc) === landing) return name;
  }
  return null;
}
