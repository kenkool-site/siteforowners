// Square Online appointment sites (Weebly/`*.square.site` stack) render their
// service catalog client-side, so the server-fetched HTML carries no services —
// the generic Claude fallback gets nothing. But the published site exposes a
// public, unauthenticated JSON endpoint serving Square's canonical Catalog
// schema. We scrape three identifiers from the page HTML (no headless browser
// needed) and call that endpoint directly, mirroring the Booksy/Vagaro path.

// --- Square Catalog API shapes (only the fields we read) -------------------

export interface SquareMoney {
  amount?: number; // cents
  currency?: string;
}

export interface SquareItemVariation {
  type: string;
  id: string;
  item_variation_data?: {
    name?: string;
    pricing_type?: string;
    price_money?: SquareMoney;
    service_duration?: number; // milliseconds
    available_for_booking?: boolean;
  };
}

export interface SquareItem {
  type: string;
  id: string;
  item_data?: {
    name?: string;
    category_id?: string;
    categories?: { id?: string }[];
    variations?: SquareItemVariation[];
  };
}

export interface SquareCategory {
  type: string;
  id: string;
  category_data?: { name?: string };
}

export interface SquareCatalog {
  items: SquareItem[];
  categories: SquareCategory[];
}

export interface SquareParams {
  sellerKey: string;
  userId: string;
  siteId: string;
}

// Same shape the Acuity/Booksy/Vagaro extractors emit, so the route's
// servicesFromAcuityCategories + downstream payload consume it unchanged.
export interface SquareBookingCategory {
  name: string;
  services: { name: string; price: string; duration: string; id: number }[];
  directUrl: string;
}

export interface SquarePageData {
  businessName: string | null;
  images: string[];
  bookingUrl: string;
  categories: SquareBookingCategory[];
}

// Matches `*.square.site` and `squareup.com` (incl. `book.squareup.com`) while
// rejecting lookalikes like `notsquare.site` (requires a host boundary before).
export const SQUARE_HOST_RE = /(?:^|:\/\/|\.)(?:square\.site|squareup\.com)(?:[:/]|$)/i;

/** Pull the three endpoint identifiers from the initial page HTML. */
export function scrapeSquareParams(html: string): SquareParams | null {
  const sellerKey = html.match(/data-seller-key="([A-Za-z0-9]+)"/)?.[1] ?? null;
  const userId = html.match(/"user"\s*:\s*\{\s*"id"\s*:\s*(\d+)/)?.[1] ?? null;
  // The numeric site_id (unquoted) feeds the endpoint; a separate quoted UUID
  // `site_id` also appears in the page and must NOT be matched.
  const siteId = html.match(/"site_id"\s*:\s*(\d+)/)?.[1] ?? null;

  if (!sellerKey || !userId || !siteId) return null;
  return { sellerKey, userId, siteId };
}

function formatSquarePrice(amount: number): string {
  const dollars = amount / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

function durationLabel(ms: number | undefined): string {
  const minutes = ms && ms > 0 ? Math.round(ms / 60000) : 60;
  return `${minutes} min`;
}

/** Square Catalog → BookingCategory[] (services only; add-ons/images deferred). */
export function mapSquareToBookingCategories(
  catalog: SquareCatalog,
  directUrl: string,
): SquareBookingCategory[] {
  const categoryNames = new Map<string, string>();
  for (const c of catalog.categories || []) {
    const name = c.category_data?.name?.trim();
    if (c.id && name) categoryNames.set(c.id, name);
  }

  const buckets = new Map<string, SquareBookingCategory["services"]>();
  let nextId = 0;

  for (const item of catalog.items || []) {
    if (item.type !== "ITEM" || !item.item_data) continue;
    const itemName = item.item_data.name?.trim();
    if (!itemName) continue;
    // Deposits / booking fees are charges, not browsable services.
    if (/deposit|booking fee/i.test(itemName)) continue;

    const validVariations = (item.item_data.variations || []).filter((v) => {
      const d = v.item_variation_data;
      return (
        !!d &&
        d.available_for_booking !== false &&
        d.pricing_type === "FIXED_PRICING" &&
        typeof d.price_money?.amount === "number"
      );
    });
    if (validVariations.length === 0) continue;

    const catName =
      categoryNames.get(item.item_data.categories?.[0]?.id ?? "") ??
      categoryNames.get(item.item_data.category_id ?? "") ??
      "Services";
    if (!buckets.has(catName)) buckets.set(catName, []);
    const bucket = buckets.get(catName)!;

    for (const v of validVariations) {
      const d = v.item_variation_data!;
      const varName = d.name?.trim();
      // Multi-tier items disambiguate by variation; single-variation items don't.
      const name =
        validVariations.length > 1 && varName ? `${itemName} – ${varName}` : itemName;
      bucket.push({
        id: nextId++,
        name,
        price: formatSquarePrice(d.price_money!.amount!),
        duration: durationLabel(d.service_duration),
      });
    }
  }

  return Array.from(buckets.entries())
    .filter(([, services]) => services.length > 0)
    .map(([name, services]) => ({ name, services, directUrl }));
}

function squareServicesEndpoint(params: SquareParams, pageUrl: string): string {
  const origin = new URL(pageUrl).origin;
  return `${origin}/app/square-sync/published/users/${params.userId}/site/${params.siteId}/appointments/services/${params.sellerKey}?return_bookable=true`;
}

/** Call the public square-sync services endpoint. Returns null on any failure. */
export async function fetchSquareServices(
  params: SquareParams,
  pageUrl: string,
): Promise<SquareCatalog | null> {
  try {
    const res = await fetch(squareServicesEndpoint(params, pageUrl), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SquareCatalog>;
    if (!Array.isArray(data.items)) return null;
    return { items: data.items, categories: data.categories || [] };
  } catch {
    return null;
  }
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const reSwapped = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`,
    "i",
  );
  return html.match(re)?.[1]?.trim() || html.match(reSwapped)?.[1]?.trim() || null;
}

/**
 * Orchestrate a Square import from already-fetched page HTML: scrape params,
 * call the services endpoint, map to BookingCategory[], and pull cheap page-level
 * business info (name + hero image) from Open Graph tags. Returns null on any
 * miss so the route falls through to the existing Claude fallback.
 */
export async function extractSquareData(
  html: string,
  url: string,
): Promise<SquarePageData | null> {
  const params = scrapeSquareParams(html);
  if (!params) return null;

  const catalog = await fetchSquareServices(params, url);
  if (!catalog) return null;

  const categories = mapSquareToBookingCategories(catalog, url);
  if (categories.length === 0) return null;

  const businessName =
    metaContent(html, "og:site_name") ||
    (metaContent(html, "og:title") || "")
      .replace(/^appointments\s*[|–-]\s*/i, "")
      .trim() ||
    null;
  const ogImage = metaContent(html, "og:image");

  return {
    businessName: businessName || null,
    images: ogImage ? [ogImage] : [],
    bookingUrl: url,
    categories,
  };
}
