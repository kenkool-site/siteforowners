export const MOBILE_GALLERY_PREVIEW_LIMIT = 9;

export function getVisibleMobileGalleryImages<T>(
  images: T[],
  expanded: boolean,
): T[] {
  return expanded ? images : images.slice(0, MOBILE_GALLERY_PREVIEW_LIMIT);
}

export function hasMoreMobileGalleryImages(images: readonly unknown[]): boolean {
  return images.length > MOBILE_GALLERY_PREVIEW_LIMIT;
}
