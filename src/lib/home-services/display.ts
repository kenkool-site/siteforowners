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
