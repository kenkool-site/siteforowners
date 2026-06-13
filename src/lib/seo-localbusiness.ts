import type { BusinessType, PreviewData, SocialLinks } from "@/lib/ai/types";

// Mirrors the BookingHoursMap shape in src/app/site/[slug]/page.tsx (not exported there).
type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

/** Minimal shape this helper consumes from getSiteData(). */
export interface LocalBusinessInput {
  preview: PreviewData;
  bookingHours: BookingHoursMap;
  isDemo: boolean;
}

/** Map our business_type enum to the most specific valid schema.org LocalBusiness subtype. */
function schemaType(businessType: BusinessType | undefined): string {
  switch (businessType) {
    case "nails":
      return "NailSalon";
    case "restaurant":
      return "Restaurant";
    case "salon":
    case "barbershop":
    case "braids":
    case "locs":
      return "HairSalon"; // schema.org has no BarberShop type
    default:
      return "LocalBusiness";
  }
}

/** First non-empty trimmed string, or undefined. */
function firstNonEmpty(...values: (string | undefined | null)[]): string | undefined {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

/**
 * Serialize a JSON-LD object for safe embedding inside a <script> tag.
 * Escapes characters that could break out of the script element or be
 * misread by the HTML parser. The \uXXXX forms are valid JSON and are
 * parsed transparently by JSON-LD consumers.
 */
export function serializeJsonLd(jsonLd: unknown): string {
  return JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(" ", "g"), "\\u2028")
    .replace(new RegExp(" ", "g"), "\\u2029");
}

export function buildLocalBusinessJsonLd(
  input: LocalBusinessInput,
  canonicalUrl: string,
): Record<string, unknown> | null {
  if (input.isDemo) return null;

  const { preview } = input;
  const name = preview.business_name?.trim();
  if (!name) return null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType(preview.business_type),
    name,
    url: canonicalUrl,
  };

  const en = preview.generated_copy?.en;
  const description = firstNonEmpty(
    en?.google_business_description,
    en?.seo_description,
    en?.hero_subheadline,
  );
  if (description) jsonLd.description = description;

  const telephone = preview.phone?.trim();
  if (telephone) jsonLd.telephone = telephone;

  const image = preview.images?.[0]?.trim();
  if (image) jsonLd.image = image;

  // logo lives in stored generated_copy but is not declared on GeneratedCopy.
  const logo = (preview.generated_copy as { logo?: string } | undefined)?.logo?.trim();
  if (logo) jsonLd.logo = logo;

  const street = preview.address?.trim();
  const locality = preview.seo_locality?.trim();
  if (street) {
    const postal: Record<string, string> = { "@type": "PostalAddress", streetAddress: street };
    if (locality) postal.addressLocality = locality;
    jsonLd.address = postal;
  }
  if (locality) jsonLd.areaServed = locality;

  const social = preview.generated_copy?.social_links as SocialLinks | null | undefined;
  if (social) {
    const sameAs = [social.instagram, social.facebook, social.tiktok]
      .map((v) => v?.trim())
      .filter((v): v is string => !!v);
    if (sameAs.length) jsonLd.sameAs = sameAs;
  }

  if (input.bookingHours) {
    const specs: Record<string, string>[] = [];
    for (const [day, hours] of Object.entries(input.bookingHours)) {
      if (!hours) continue;
      const opens = hours.open?.trim();
      const closes = hours.close?.trim();
      if (!opens || !closes) continue;
      specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens, closes });
    }
    if (specs.length) jsonLd.openingHoursSpecification = specs;
  }

  return jsonLd;
}
