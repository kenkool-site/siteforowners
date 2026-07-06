export const MOBILE_GALLERY_PREVIEW_LIMIT = 9;

export function getVisibleMobileGalleryImages<T>(
  images: T[],
  expanded: boolean,
  limit: number = MOBILE_GALLERY_PREVIEW_LIMIT,
): T[] {
  return expanded ? images : images.slice(0, limit);
}

export function hasMoreMobileGalleryImages(
  images: readonly unknown[],
  limit: number = MOBILE_GALLERY_PREVIEW_LIMIT,
): boolean {
  return images.length > limit;
}
