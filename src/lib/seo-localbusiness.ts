import type { BusinessType, PreviewData, SocialLinks } from "@/lib/ai/types";

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

  return jsonLd;
}
