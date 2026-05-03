import type { ServiceItem } from "@/lib/ai/types";

export type ImportedBookingCategory = {
  name: string;
  services?: { name: string; price?: string; duration?: string; image?: string }[];
};

/** Defensive parse — matches preview wizard + generate-copy behavior. */
export function servicesFromBookingCategories(bookingCategories: unknown): ServiceItem[] {
  if (!Array.isArray(bookingCategories)) return [];
  return bookingCategories.flatMap((category) => {
    if (!category || typeof category !== "object" || !("name" in category)) return [];
    const categoryName = String((category as { name: string }).name);
    const rawServices =
      "services" in category && Array.isArray((category as { services: unknown[] }).services)
        ? (category as { services: unknown[] }).services
        : [];
    return rawServices
      .filter((service): service is Record<string, unknown> => !!service && typeof service === "object" && "name" in service)
      .map((service) => ({
        name: String(service.name),
        price: typeof service.price === "string" ? service.price : "",
        category: categoryName,
        image: typeof service.image === "string" ? service.image : undefined,
      }));
  });
}

export function categoryNamesFromBookingCategories(bookingCategories: unknown): string[] {
  if (!Array.isArray(bookingCategories)) return [];
  return bookingCategories
    .map((category) =>
      category && typeof category === "object" && "name" in category
        ? String((category as { name: string }).name).trim()
        : "",
    )
    .filter(Boolean);
}

function normalizeServiceName(n: string): string {
  return n.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Preview wizard builds services from `booking_categories` first so every row
 * has `category`. Flat `services` from the API carry duration_minutes, images, etc.
 * Merge the two when both are present (same order when lengths match, else by name).
 */
export function mergeCategorizedServicesWithFlatPayload(
  fromBooking: ServiceItem[],
  flat: ServiceItem[],
): ServiceItem[] {
  if (fromBooking.length === 0) return flat;
  if (flat.length === 0) {
    return fromBooking.map((s) => ({ ...s, client_id: s.client_id ?? crypto.randomUUID() }));
  }

  if (fromBooking.length === flat.length) {
    return fromBooking.map((s, i) => {
      const rich = flat[i];
      return {
        ...rich,
        name: s.name,
        price: s.price || rich.price || "",
        category: s.category,
        image: s.image || rich.image,
        client_id: rich.client_id ?? crypto.randomUUID(),
      };
    });
  }

  const byName = new Map<string, ServiceItem>();
  for (const s of flat) {
    byName.set(normalizeServiceName(s.name), s);
  }
  return fromBooking.map((s) => {
    const rich = byName.get(normalizeServiceName(s.name));
    return {
      ...s,
      client_id: rich?.client_id ?? crypto.randomUUID(),
      duration_minutes: rich?.duration_minutes ?? s.duration_minutes ?? 60,
      image: s.image || rich?.image,
      description: rich?.description ?? s.description,
      add_ons: rich?.add_ons ?? s.add_ons,
    };
  });
}
