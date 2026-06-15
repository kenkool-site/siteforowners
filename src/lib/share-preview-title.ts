/**
 * Build og:title / twitter:title for SMS and social link previews.
 *
 * iMessage (and some other crawlers) only show the segment before the first
 * "|" in og:title. AI-generated seo_title often puts the keyword phrase first
 * ("Luxury Braiding Studio | Business Name NYC"), which hides the client's
 * brand in iMessage/WhatsApp cards. Always lead with the business name here.
 */
export function buildSharePreviewTitle(
  businessName: string,
  opts?: { seoTitle?: string | null; heroHeadline?: string | null },
): string {
  const name = businessName.trim() || "Business";
  const rawSeo = opts?.seoTitle?.trim();
  const descriptor =
    rawSeo?.split("|")[0]?.trim() || opts?.heroHeadline?.trim() || null;

  if (!descriptor) return name;

  const normalizedName = name.toLowerCase();
  const normalizedDescriptor = descriptor.toLowerCase();

  if (
    normalizedDescriptor.startsWith(normalizedName) ||
    normalizedDescriptor.includes(normalizedName)
  ) {
    return descriptor;
  }

  return `${name} — ${descriptor}`;
}
