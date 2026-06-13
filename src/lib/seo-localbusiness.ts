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
    .replace(new RegExp("\u2028", "g"), "\\u2028")
    .replace(new RegExp("\u2029", "g"), "\\u2029");
}

/**
 * Normalize a stored time string to schema.org's required 24-hour "HH:MM".
 * booking_settings.working_hours are stored 12-hour ("10:00 AM", "7:00 PM"),
 * but OpeningHoursSpecification.opens/closes must be 24-hour or Google ignores
 * them. Accepts 12-hour (with AM/PM) and already-24-hour input; returns null
 * for anything unparseable (e.g. "Closed") so the caller skips that day.
 */
export function to24Hour(time: string | undefined | null): string | null {
  const t = time?.trim();
  if (!t) return null;

  const twelve = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (twelve) {
    let hour = Number(twelve[1]);
    const minute = Number(twelve[2]);
    const isPm = twelve[3].toLowerCase() === "pm";
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (hour === 12) hour = 0; // 12 AM -> 0, 12 PM -> 12 (after +12 below)
    if (isPm) hour += 12;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const twentyFour = t.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return null;
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
      const opens = to24Hour(hours.open);
      const closes = to24Hour(hours.close);
      if (!opens || !closes) continue;
      specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens, closes });
    }
    if (specs.length) jsonLd.openingHoursSpecification = specs;
  }

  return jsonLd;
}
