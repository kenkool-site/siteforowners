import type { BusinessType } from "@/lib/ai/types";
import { SERVICE_IMAGE_FILES } from "@/lib/templates/service-image-manifest";

/**
 * Default service-card images are self-hosted files, one per service, under
 * `public/defaults/services/<type>/<slug>.<ext>`. The slug is derived from the
 * service name, so adding or swapping a photo is just dropping a correctly
 * named file (any of .jpg/.jpeg/.png/.webp) and re-running
 * `npm run gen:service-images`. The generated manifest records the actual
 * filename so the path can be resolved without touching the filesystem at
 * runtime (this module is bundled for the browser). `default-services.test.ts`
 * fails if a file is missing, so a typo/misnamed file is caught in CI rather
 * than 404-ing live.
 */

/** "Cornrows / Feed-In Braids" -> "cornrows-feed-in-braids" */
export function slugifyServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ") // "Wash & Blowout" -> "wash and blowout"
    .replace(/'/g, "") // "Men's" -> "mens"
    .replace(/[^a-z0-9]+/g, "-") // everything else (spaces, /, parens) -> "-"
    .replace(/^-+|-+$/g, "");
}

export function serviceDefaultImage(type: BusinessType, name: string): string {
  const slug = slugifyServiceName(name);
  // Manifest holds the real filename/extension; fall back to .jpg if a service
  // was added before the manifest was regenerated (the test will flag it).
  return SERVICE_IMAGE_FILES[`${type}/${slug}`] ?? `/defaults/services/${type}/${slug}.jpg`;
}
