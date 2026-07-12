import type { HomeServicesGalleryProject, HomeServicesLocale } from "./types";

export function localizedText(
  locale: HomeServicesLocale,
  value: { en?: string; es?: string },
): string {
  return locale === "es" ? value.es?.trim() || "" : value.en?.trim() || "";
}

export function hasProjectMedia(project: HomeServicesGalleryProject): boolean {
  return Boolean(
    project.image ||
    project.before_image ||
    project.after_image,
  );
}

/**
 * Photos-gallery fallback for the Recent Work section: when no project has
 * media, the homepage falls back to the tenant's uploaded photo gallery
 * (`previews.images`) so the section isn't silently absent. Returns [] when
 * any project has media — real project photos always win.
 */
export function galleryFallbackPhotos(
  projects: HomeServicesGalleryProject[],
  images: unknown,
): string[] {
  if (projects.some(hasProjectMedia)) return [];
  if (!Array.isArray(images)) return [];
  return images.filter(
    (img): img is string => typeof img === "string" && img.trim() !== "",
  );
}
