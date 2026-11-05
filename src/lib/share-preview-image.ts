/**
 * Pick og:image / twitter:image for SMS and social link previews.
 *
 * Founders want shared links to show the About-section photo, so mirror
 * TemplateOrchestrator's About image choice: the custom about_image_url, else
 * the second gallery image. Falls back to the first gallery image when the
 * About image is hidden or there is none.
 */
export function pickSharePreviewImage(
  generatedCopy: unknown,
  images: string[] | null | undefined,
): string | undefined {
  const copy = generatedCopy as Record<string, unknown> | null | undefined;
  const ss = (copy?.section_settings ?? {}) as Record<string, unknown>;
  const showAboutImage = ss.show_about_image !== false && ss.show_about !== false;
  const override =
    typeof ss.about_image_url === "string" && ss.about_image_url.trim()
      ? ss.about_image_url.trim()
      : undefined;
  const aboutImage = showAboutImage ? override || images?.[1] : undefined;
  return aboutImage || images?.[0] || undefined;
}
