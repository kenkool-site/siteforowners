export const maxDuration = 120;

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchVagaroBookingCategories } from "@/lib/vagaro-import";

const anthropic = new Anthropic();

// Known booking platform UI colors to exclude
const PLATFORM_COLORS = new Set([
  "#27ae60", "#3dbe8b", "#2ecc71", // Acuity green
  "#00b19d", "#1abc9c",             // Vagaro teal
  "#006bff", "#0069ff",             // Booksy blue
  "#006bff", "#0a66c2",             // Calendly blue
  "#ed7087", "#f08300", "#ffe767", "#73c1ed", "#6fcf97", // Acuity category colors
  "#3dbe8b",                         // Acuity button green
  "#666666", "#414141", "#333333",  // Generic grays (platform text)
  "#ffffff", "#000000",             // Black/white
]);

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function isPlatformColor(hex: string, isAcuity = false): boolean {
  const normalized = hex.toLowerCase().trim();
  if (PLATFORM_COLORS.has(normalized)) return true;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness < 30 || brightness > 245) return true;
  // Near-gray
  if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15) return true;
  // On Acuity pages, reject greens (hue 100-160) — always Acuity's UI, not the business
  if (isAcuity) {
    const [h, s] = rgbToHsl(r, g, b);
    if (s > 0.25 && h >= 100 && h <= 160) return true;
  }
  return false;
}

function extractColorsFromHtml(html: string): string[] {
  const colors: string[] = [];

  const acuityBgMatch = html.match(/background[_-]?color['":\s]*['"]?(#[0-9a-fA-F]{6})/i);
  if (acuityBgMatch) colors.push(acuityBgMatch[1]);

  const cssVarRegex = /--[a-z-]*color[^:]*:\s*(#[0-9a-fA-F]{6})/gi;
  for (const cssVarMatch of Array.from(html.matchAll(cssVarRegex))) colors.push(cssVarMatch[1]);

  const inlineStyleRegex = /style="[^"]*background(?:-color)?:\s*(#[0-9a-fA-F]{6})/gi;
  for (const inlineMatch of Array.from(html.matchAll(inlineStyleRegex))) colors.push(inlineMatch[1]);

  const themeColorMatch = html.match(/meta[^>]*name=["']theme-color["'][^>]*content=["'](#[0-9a-fA-F]{6})/i);
  if (themeColorMatch) colors.push(themeColorMatch[1]);

  const unique = Array.from(new Set(colors.map((c) => c.toLowerCase())));
  return unique.filter((c) => !isPlatformColor(c));
}

// Try to get a higher-resolution version of an image URL
function getHighResUrl(url: string): string {
  try {
    const u = new URL(url);
    // Acuity/Square: bump width params
    for (const key of ["w", "width", "sz", "size"]) {
      if (u.searchParams.has(key)) {
        u.searchParams.set(key, "1200");
      }
    }
    // Height params too
    for (const key of ["h", "height"]) {
      if (u.searchParams.has(key)) {
        u.searchParams.delete(key); // remove height to keep aspect ratio
      }
    }
    // Common CDN resize patterns in path: /s300/, /w300/, /300x300/
    let path = u.pathname;
    const isVagaro = u.hostname.includes("rackcdn.com");
    const maxSize = isVagaro ? "800" : "1200";
    path = path.replace(/\/s\d{2,4}\//g, `/s${maxSize}/`);
    path = path.replace(/\/w\d{2,4}\//g, `/w${maxSize}/`);
    path = path.replace(/\/\d{2,4}x\d{2,4}\//g, `/${maxSize}x${maxSize}/`);
    u.pathname = path;
    return u.toString();
  } catch {
    return url;
  }
}

// Fetch an image and return base64 + media type + file size, or null if it fails
async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; sizeKB: number } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    const urlLower = imageUrl.toLowerCase();
    // Booksy's CDN returns a bare `image` content-type with no subtype, so we
    // accept both `image/*` and exact `image` and fall back to the URL
    // extension for media-type detection.
    if (!contentType.startsWith("image")) return null;
    // Skip SVGs
    if (contentType.includes("svg") || urlLower.endsWith(".svg")) return null;

    const buffer = await res.arrayBuffer();
    // Skip tiny images (likely icons/tracking pixels) — under 5KB
    if (buffer.byteLength < 5000) return null;
    // Skip very large images to avoid token limits — over 2MB
    if (buffer.byteLength > 2 * 1024 * 1024) return null;

    const base64 = Buffer.from(buffer).toString("base64");
    const sizeKB = Math.round(buffer.byteLength / 1024);

    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (contentType.includes("png") || urlLower.endsWith(".png")) mediaType = "image/png";
    else if (contentType.includes("gif") || urlLower.endsWith(".gif")) mediaType = "image/gif";
    else if (contentType.includes("webp") || urlLower.endsWith(".webp")) mediaType = "image/webp";

    return { base64, mediaType, sizeKB };
  } catch {
    return null;
  }
}

// Use Claude Vision to classify images as photos vs promotional graphics
async function classifyImages(
  imageUrls: string[]
): Promise<{ photos: string[]; logo: string | null; hasHeroImage: boolean }> {
  if (imageUrls.length === 0) return { photos: [], logo: null, hasHeroImage: false };

  // Fetch up to 20 images in parallel
  const candidates = imageUrls.slice(0, 20);
  const fetched = await Promise.all(
    candidates.map(async (url) => ({
      url,
      data: await fetchImageAsBase64(url),
    }))
  );

  const validImages = fetched.filter((f) => f.data !== null);
  if (validImages.length === 0) return { photos: [], logo: null, hasHeroImage: false };

  // Classify first 8 with Vision, include rest as unclassified photos
  const toClassify = validImages.slice(0, 8);
  const extraImages = validImages.slice(8);

  // Build a single vision request with first 8 images
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  content.push({
    type: "text",
    text: `I have ${validImages.length} images from a small business booking page. For each image:

1. Classify it as one of:
- "photo" — a real photograph of hair, nails, food, a person, the business interior/exterior, or their work results. These are gallery-worthy.
- "graphic" — a promotional flyer, infographic, text overlay image, banner with text, instructional graphic, collage with text, product packaging, social media post screenshot, or any image with significant text/typography on it.
- "logo" — the business logo or brand mark.

2. For photos ONLY, rate visual quality from 1-10:
- 9-10: Professional, well-lit, well-composed, beautiful result showcase. Perfect for a website hero image.
- 7-8: Good quality, clear, presentable. Solid gallery image.
- 4-6: Acceptable but not impressive. Mediocre lighting, awkward angle, or cluttered background.
- 1-3: Poor quality — blurry, unflattering, messy, bad lighting, too close-up, or unappealing.

Return ONLY valid JSON as an array of objects:
[{"index": 0, "type": "photo|graphic|logo", "quality": 8}]

"quality" is required for photos, omit for graphics/logos.

Be strict: if an image has ANY significant text overlaid on it (prices, dates, policies, promotional messages), classify it as "graphic" even if it also contains a photo underneath. We only want clean photos for a website gallery.

The BEST photo (highest quality) will be used as the hero/banner image on the website, so rate carefully — prefer well-composed, professional-looking shots.`,
  });

  toClassify.forEach((img, i) => {
    content.push({
      type: "text",
      text: `Image ${i} (${img.url.split("/").pop()}):`,
    });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.data!.mediaType,
        data: img.data!.base64,
      },
    });
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { photos: validImages.map((v) => v.url), logo: null, hasHeroImage: false };

    const classifications = JSON.parse(jsonMatch[0]) as Array<{ index: number; type: string; quality?: number }>;

    const photoEntries: { url: string; quality: number; heroWorthy: boolean }[] = [];
    let logo: string | null = null;

    for (const c of classifications) {
      const img = toClassify[c.index];
      if (!img) continue;
      if (c.type === "photo") {
        const sizeKB = img.data!.sizeKB;
        const heroWorthy = sizeKB >= 50;
        photoEntries.push({ url: img.url, quality: c.quality ?? 5, heroWorthy });
      }
      if (c.type === "logo" && !logo) logo = img.url;
    }

    // Add extra images (beyond the 8 classified) — include any that are >10KB
    for (const img of extraImages) {
      if (img.data && img.data.sizeKB > 10) {
        photoEntries.push({ url: img.url, quality: 5, heroWorthy: img.data.sizeKB >= 50 });
      }
    }

    // Sort: hero-worthy images first, then by quality descending
    photoEntries.sort((a, b) => {
      if (a.heroWorthy !== b.heroWorthy) return a.heroWorthy ? -1 : 1;
      return b.quality - a.quality;
    });
    const photos = photoEntries.map((p) => p.url);
    const hasHeroImage = photoEntries.length > 0 && photoEntries[0].heroWorthy;

    return { photos, logo, hasHeroImage };
  } catch (err) {
    console.error("Vision classification failed, using all images:", err);
    return { photos: validImages.map((v) => v.url), logo: null, hasHeroImage: false };
  }
}

// Booksy renders services client-side, so the static HTML doesn't contain them.
// Their public web client uses an unauthenticated customer_api endpoint that
// returns the full business profile (services, variants with duration+price,
// per-service photos, gallery, logo, cover) as JSON. We hit it directly.
// The api key below is the same one Booksy ships in their public web bundle —
// it is a client identifier, not a secret. If it ever rotates we can re-extract
// it from a Booksy page (look for `apiKey:"web-..."`).
const BOOKSY_WEB_API_KEY = "web-e3d812bf-d7a2-445d-ab38-55589ae6a121";
const BOOKSY_BUSINESS_ID_RE = /booksy\.com\/[a-z]{2}-[a-z]{2}\/(\d+)_/i;

interface BooksyVariant {
  id?: number;
  label?: string;
  duration?: number;
  price?: number;
  service_price?: string;
}
interface BooksyService {
  active?: boolean;
  name?: string;
  treatment?: { name?: string };
  description?: string;
  variants?: BooksyVariant[];
  // Booksy returns service-level photos as `{ id, url, order }` (different
  // shape from gallery photos which use `{ image_id, image, ... }`). Accept
  // either field defensively.
  photos?: { url?: string; image?: string }[];
}
interface BooksyApiCategory {
  id?: number;
  name?: string;
  services?: BooksyService[];
}
interface BooksyImageEntry {
  image?: string;
}
interface BooksyBusiness {
  id?: number;
  name?: string;
  description?: string | null;
  photo?: string | null;
  thumbnail_photo?: string | null;
  location?: { address?: string };
  service_categories?: BooksyApiCategory[];
  images?: {
    cover?: BooksyImageEntry[];
    logo?: BooksyImageEntry[];
    biz_photo?: BooksyImageEntry[];
    inspiration?: BooksyImageEntry[];
  };
}

function extractBooksyBusinessId(url: string): number | null {
  const m = url.match(BOOKSY_BUSINESS_ID_RE);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

async function fetchBooksyBusiness(id: number): Promise<BooksyBusiness | null> {
  try {
    const res = await fetch(
      `https://us.booksy.com/api/us/2/customer_api/businesses/${id}`,
      {
        headers: {
          "x-api-key": BOOKSY_WEB_API_KEY,
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { business?: BooksyBusiness };
    return data?.business ?? null;
  } catch {
    return null;
  }
}

function booksyServicePhotoUrl(svc: BooksyService): string | undefined {
  const p = svc.photos?.find((x) => x?.url || x?.image);
  return p?.url || p?.image || undefined;
}

/**
 * Convert Booksy's `service_categories` tree into the same `BookingCategory[]`
 * shape the Acuity path emits, so downstream code (servicesFromAcuityCategories,
 * preview wizard) can consume both uniformly.
 *
 * Each Booksy variant becomes one row. Naming priority for the row:
 *   1. service.name (top-level marketing label set by the owner, when present)
 *   2. service.treatment.name (Booksy taxonomy fallback)
 *   3. category.name (last resort)
 * variant.label is appended when it disambiguates pricing tiers.
 *
 * Categories whose name is empty (some Booksy accounts use a single unnamed
 * bucket for everything) get a "Services" fallback name so we don't drop the
 * whole business and fall through to the Claude path.
 */
function booksyCategoriesToBookingCategories(
  apiCategories: BooksyApiCategory[],
  pageUrl: string,
): BookingCategory[] {
  const out: BookingCategory[] = [];
  for (const cat of apiCategories) {
    const services = (cat.services || []).filter((s) => s.active !== false);
    if (services.length === 0) continue;
    const catName = cat.name?.trim() || "Services";

    const treatmentNames = new Set(
      services.map((s) => s.treatment?.name?.trim() || "").filter(Boolean),
    );
    const useTreatmentName = treatmentNames.size > 1;

    const rows: BookingCategory["services"] = [];
    for (const svc of services) {
      const ownerName = svc.name?.trim() || "";
      const treatmentName = svc.treatment?.name?.trim() || "";
      const baseName =
        ownerName ||
        (useTreatmentName && treatmentName ? treatmentName : "") ||
        treatmentName ||
        catName;
      const photo = booksyServicePhotoUrl(svc);
      const variants = Array.isArray(svc.variants) ? svc.variants : [];
      for (const v of variants) {
        const label = (v.label || "").trim();
        const name = label ? `${baseName} — ${label}` : baseName;
        if (!name.trim()) continue;
        const price = v.service_price?.trim()
          ? v.service_price.trim()
          : typeof v.price === "number"
            ? `$${v.price.toFixed(0)}`
            : "";
        const durationMin = typeof v.duration === "number" && v.duration > 0 ? v.duration : 60;
        rows.push({
          name,
          price,
          duration: `${durationMin} min`,
          id: typeof v.id === "number" ? v.id : 0,
          ...(photo ? { image: photo } : {}),
        });
      }
    }

    if (rows.length > 0) {
      out.push({ name: catName, services: rows, directUrl: pageUrl });
    }
  }
  return out;
}

/** Pull every distinct service-photo URL across a Booksy categories tree. */
function collectBooksyServicePhotos(apiCategories: BooksyApiCategory[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cat of apiCategories) {
    for (const svc of cat.services || []) {
      for (const p of svc.photos || []) {
        const url = p?.url || p?.image;
        if (url && !seen.has(url)) {
          seen.add(url);
          out.push(url);
        }
      }
    }
  }
  return out;
}

function collectBooksyImageUrls(arr: BooksyImageEntry[] | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => x?.image)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}

async function extractBooksyData(url: string): Promise<{
  businessName: string | null;
  description: string | null;
  address: string | null;
  logo: string | null;
  images: string[];
  categories: BookingCategory[];
} | null> {
  const id = extractBooksyBusinessId(url);
  if (id === null) return null;
  const biz = await fetchBooksyBusiness(id);
  if (!biz) return null;

  const categories = booksyCategoriesToBookingCategories(
    biz.service_categories || [],
    url,
  );
  if (categories.length === 0) return null;

  const imagesObj = biz.images || {};
  const logo = imagesObj.logo?.[0]?.image || biz.thumbnail_photo || null;
  const cover = imagesObj.cover?.[0]?.image || biz.photo || null;
  const servicePhotos = collectBooksyServicePhotos(biz.service_categories || []);
  const galleryRaw = [
    ...(cover ? [cover] : []),
    ...collectBooksyImageUrls(imagesObj.cover),
    ...collectBooksyImageUrls(imagesObj.biz_photo),
    ...collectBooksyImageUrls(imagesObj.inspiration),
    // Per-service photos belong in the gallery too so the user can showcase
    // their work even when biz_photo/inspiration are sparse.
    ...servicePhotos,
  ];
  const seen = new Set<string>();
  const images: string[] = [];
  for (const u of galleryRaw) {
    if (u === logo) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    images.push(u);
  }

  // Booksy descriptions occasionally have a stray "http://" prefix (artifact of
  // the owner pasting a URL into the bio field on signup).
  const desc = (biz.description || "").replace(/^https?:\/\/+/i, "").trim();

  return {
    businessName: biz.name?.trim() || null,
    description: desc || null,
    address: biz.location?.address?.trim() || null,
    logo,
    images,
    categories,
  };
}

// Extract data from Vagaro pages using meta tags + embedded JSON
// Services are client-rendered on Vagaro, so we extract business info and
// use Claude to generate typical services from the business description.
function extractVagaroData(html: string, url: string): {
  business_name: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  images: string[];
  booking_url: string;
} | null {
  if (!url.includes("vagaro.com")) return null;

  // Business name from title: "Rika Nail Salon - Brooklyn NY | Vagaro"
  const titleMatch = html.match(/<title>\s*(.*?)\s*<\/title>/i);
  const business_name = titleMatch
    ? titleMatch[1].replace(/\s*[-|].*vagaro.*/i, "").trim()
    : null;

  // Description from meta
  const descMatch = html.match(/name="description"\s+content="([^"]*)"/i);
  const description = descMatch ? descMatch[1].replace(/&amp;/g, "&") : null;

  // Try to extract phone and address from embedded BusinessDetail JSON
  // Vagaro uses escaped JSON (\\") in embedded script data
  let phone: string | null = null;
  let address: string | null = null;
  const phoneMatch = html.match(/\\"Telephone\\":\\"(\d{10,11})\\"/);
  if (phoneMatch) {
    const p = phoneMatch[1];
    phone = `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
  }
  // Find address block — Street, City, and StateCode appear together in the business data
  const addrBlockMatch = html.match(/\\"Street\\":\\"([^\\]+)\\"[^}]{0,200}\\"City\\":\\"([^\\]+)\\"[^}]{0,200}\\"StateCode\\":\\"([^\\]+)\\"/);
  if (addrBlockMatch) {
    address = `${addrBlockMatch[1]}, ${addrBlockMatch[2]}, ${addrBlockMatch[3]}`;
  }

  // Extract og:image URLs — Vagaro has many, get up to 10
  const ogImageRegex = /property="og:image"\s+content="([^"]*)"/gi;
  const images: string[] = [];
  for (const match of Array.from(html.matchAll(ogImageRegex))) {
    if (images.length >= 20) break;
    let imgUrl = match[1];
    // Upgrade from 340x340 thumbnails — 800x800 is the max Vagaro CDN supports
    imgUrl = imgUrl.replace(/\/340x340\//g, "/800x800/");
    images.push(imgUrl);
  }

  return {
    business_name,
    description,
    phone,
    address,
    images,
    booking_url: url,
  };
}

// Generate typical services for a business using Claude, based on its name and description
async function generateVagaroServices(
  businessName: string,
  description: string | null
): Promise<{ name: string; price: string }[]> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Based on this business name and description, generate a realistic list of 8-12 services they likely offer with typical NYC prices.

Business: ${businessName}
Description: ${description || "No description available"}

Return ONLY valid JSON array:
[{"name": "Service Name", "price": "$XX"}]

Rules:
- Use realistic market prices for Brooklyn, NY
- Include a mix of basic and premium services
- Format prices with $ sign, round to nearest $5
- No descriptions, just name and price`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("Failed to generate Vagaro services:", err);
    return [];
  }
}

// Extract structured booking data from Acuity's embedded BUSINESS JSON
interface BookingCategory {
  name: string;
  services: { name: string; price: string; duration: string; id: number; image?: string; description?: string }[];
  directUrl: string;
}

/** Snap to Acuity / human labels ("45 min", "8h", "3h 30m") to duration_minutes. */
function durationMinutesFromImportLabel(duration: string): number {
  const s = duration.trim().toLowerCase();
  let minutes = 60;
  const hPart = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const minPart = s.match(/(\d+)\s*(?:min|m(?![a-z]))/);
  if (hPart) {
    minutes = Math.round(parseFloat(hPart[1]) * 60);
  }
  if (minPart) {
    minutes = hPart ? minutes + parseInt(minPart[1], 10) : parseInt(minPart[1], 10);
  }
  if (!hPart && !minPart) {
    const n = s.match(/(\d+)/);
    minutes = n ? parseInt(n[1], 10) : 60;
  }
  const snapped = Math.round(minutes / 30) * 30;
  return Math.min(480, Math.max(30, snapped || 60));
}

/** Prefer structured Acuity categories so each service keeps its category (Claude only returns a flat list). */
function servicesFromAcuityCategories(categories: BookingCategory[]): {
  name: string;
  price: string;
  duration_minutes: number;
  category: string;
  image?: string;
  description?: string;
}[] {
  const out: {
    name: string;
    price: string;
    duration_minutes: number;
    category: string;
    image?: string;
    description?: string;
  }[] = [];
  for (const cat of categories) {
    for (const s of cat.services) {
      out.push({
        name: s.name,
        price: s.price,
        duration_minutes: durationMinutesFromImportLabel(s.duration),
        category: cat.name,
        ...(s.image ? { image: s.image } : {}),
        ...(s.description ? { description: s.description } : {}),
      });
    }
  }
  return out;
}

/** Category labels in first-seen order (for previews.categories + groupServices). */
function orderedUniqueCategoriesFromServices(
  services: { category?: string }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of services) {
    const c = s.category?.trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

function normalizeClaudeServiceRow(raw: {
  name: string;
  price?: string;
  duration?: string;
  category?: string;
  image?: string;
}): {
  name: string;
  price: string;
  duration_minutes: number;
  category?: string;
  image?: string;
} {
  const durationStr = typeof raw.duration === "string" && raw.duration.trim() ? raw.duration : "60 min";
  const duration_minutes = durationMinutesFromImportLabel(durationStr);
  const category = raw.category?.trim() || undefined;
  return {
    name: raw.name,
    price: typeof raw.price === "string" ? raw.price : "",
    duration_minutes,
    ...(category ? { category } : {}),
    ...(raw.image ? { image: raw.image } : {}),
  };
}

/**
 * `var BUSINESS = {...}` is often huge/minified; a non-greedy regex truncates the JSON.
 * Parse by brace-matching from the first `{` (strings-safe for standard JSON).
 */
function sliceBalancedJsonObject(html: string, openBrace: number): string | null {
  if (html[openBrace] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openBrace; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(openBrace, i + 1);
    }
  }
  return null;
}

function parseAcuityBusinessJson(html: string): Record<string, unknown> | null {
  const assignMatch = html.match(/(?:var|let|const)\s+BUSINESS\s*=\s*\{/);
  if (!assignMatch || assignMatch.index === undefined) return null;
  const open = html.indexOf("{", assignMatch.index);
  if (open < 0) return null;
  const slice = sliceBalancedJsonObject(html, open);
  if (!slice) return null;
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Acuity may expose appointment types as an object keyed by category or as categories[]. */
function appointmentTypesMapFromBiz(biz: Record<string, unknown>): Record<string, unknown[]> {
  const raw = biz.appointmentTypes;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown[]>;
  }
  const cats = biz.categories;
  if (Array.isArray(cats)) {
    const out: Record<string, unknown[]> = {};
    for (const c of cats) {
      if (!c || typeof c !== "object") continue;
      const row = c as { name?: string; appointmentTypes?: unknown[] };
      const name = typeof row.name === "string" ? row.name : null;
      const at = row.appointmentTypes;
      if (name && Array.isArray(at)) out[name] = at as unknown[];
    }
    return out;
  }
  return {};
}

// Acuity stores service images as protocol-relative URLs (//abs.acuitysite.net/...)
// or scheduler-relative paths (/acuity-uploads/...). Normalize to absolute https.
function resolveAcuityImageUrl(raw: string): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `https://app.acuityscheduling.com${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

function extractAcuityData(html: string): {
  categories: BookingCategory[];
  ownerId: number | null;
  schedulerColor: string | null;
} | null {
  const biz = parseAcuityBusinessJson(html);
  if (!biz) return null;

  try {
    const ownerId = Number(biz.id);
    const styles = biz.styles as { colors?: { schedulerBackground?: string } } | undefined;
    const schedulerColor: string | null = styles?.colors?.schedulerBackground || null;
    const appointmentTypes = appointmentTypesMapFromBiz(biz);

    const categories: BookingCategory[] = [];
    for (const [categoryName, services] of Object.entries(appointmentTypes)) {
      if (!Array.isArray(services) || services.length === 0) continue;
      const svcList = services as Array<{
        id: number; name: string; price: string; duration: number;
        image?: string; imageUrl?: string; picture?: string;
      }>;
      categories.push({
        name: categoryName.replace(/^\d+\./, "").trim(),
        services: svcList.map((s) => {
          const image = resolveAcuityImageUrl(s.image || s.imageUrl || s.picture || "");
          return {
            name: s.name,
            price: `$${parseFloat(s.price).toFixed(0)}`,
            duration: `${s.duration} min`,
            id: s.id,
            ...(image ? { image } : {}),
          };
        }),
        directUrl: `https://app.acuityscheduling.com/schedule.php?owner=${ownerId}&appointmentType=category:${encodeURIComponent(categoryName)}`,
      });
    }

    return {
      categories,
      ownerId: Number.isFinite(ownerId) ? ownerId : null,
      schedulerColor,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing booking URL" },
        { status: 400 }
      );
    }

    const fullUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

    // Booksy short-circuit: services are client-rendered, so the static HTML
    // is useless to Claude. Hit Booksy's customer_api directly for the full
    // structured profile (services with duration, price, per-service photos,
    // gallery, logo). Falls through to the Claude path on API failure.
    if (BOOKSY_BUSINESS_ID_RE.test(fullUrl)) {
      const booksyData = await extractBooksyData(fullUrl);
      if (booksyData && booksyData.categories.length > 0) {
        const candidateImages = [
          ...(booksyData.logo ? [booksyData.logo] : []),
          ...booksyData.images,
        ];
        const { photos, logo: visionLogo, hasHeroImage: heroWorthy } =
          await classifyImages(candidateImages);
        const finalLogo = visionLogo || booksyData.logo || null;
        const finalImages = photos.filter((p) => p !== finalLogo).map(getHighResUrl);

        const services = servicesFromAcuityCategories(booksyData.categories);
        const categoryNames = booksyData.categories.map((c) => c.name);

        return NextResponse.json({
          business_name: booksyData.businessName,
          phone: null,
          address: booksyData.address,
          description: booksyData.description,
          services,
          logo: finalLogo,
          images: finalImages,
          has_hero_image: heroWorthy && finalImages.length > 0,
          brand_colors: [],
          booking_url: fullUrl,
          booking_categories: booksyData.categories,
          categories: categoryNames,
        });
      }
    }

    const res = await fetch(fullUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not reach that URL. Check the link and try again." },
        { status: 400 }
      );
    }

    const html = await res.text();
    const htmlColors = extractColorsFromHtml(html);

    // Try Vagaro-specific extraction. Vagaro renders service cards client-side,
    // but the page exposes enough runtime state to call its public regional API.
    const vagaroData = extractVagaroData(html, fullUrl);
    if (vagaroData) {
      const [imageResult, bookingCategories] = await Promise.all([
        classifyImages(vagaroData.images),
        fetchVagaroBookingCategories(html, fullUrl),
      ]);
      const services =
        bookingCategories.length > 0
          ? servicesFromAcuityCategories(bookingCategories)
          : await generateVagaroServices(vagaroData.business_name || "Business", vagaroData.description);
      const categoryNames =
        bookingCategories.length > 0
          ? bookingCategories.map((category) => category.name)
          : [];
      const { photos, logo: visionLogo, hasHeroImage: heroWorthy } = imageResult;
      const finalImages = photos.map(getHighResUrl);

      return NextResponse.json({
        business_name: vagaroData.business_name,
        phone: vagaroData.phone,
        address: vagaroData.address,
        description: vagaroData.description,
        services,
        logo: visionLogo || null,
        images: finalImages,
        has_hero_image: heroWorthy && finalImages.length > 0,
        brand_colors: [],
        booking_url: vagaroData.booking_url,
        booking_categories: bookingCategories.length > 0 ? bookingCategories : null,
        categories: categoryNames,
      });
    }

    // Try to extract structured Acuity data directly from HTML
    const acuityData = extractAcuityData(html);
    if (acuityData?.schedulerColor && !isPlatformColor(acuityData.schedulerColor, true)) {
      htmlColors.push(acuityData.schedulerColor);
    }

    // Step 1: Extract structured data from HTML using Claude
    const createMessage = async (attempt = 0): Promise<Anthropic.Message> => {
      try {
        return await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 3000,
          messages: [
            {
              role: "user",
              content: `Extract business information from this booking page HTML.

Return ONLY valid JSON with this structure (omit fields you can't find):
{
  "business_name": "...",
  "phone": "...",
  "address": "...",
  "services": [
    {"name": "Service Name", "price": "$XX", "duration": "XX min", "category": "Category or section name"}
  ],
  "logo": "https://url-to-logo-image.jpg",
  "images": ["https://full-url-to-image.jpg"],
  "brand_colors": ["#hex1", "#hex2"],
  "description": "Brief description of the business if found"
}

Rules:
- Include ALL services/appointment types you find
- **category (per service):** When the HTML groups services under headings (tabs, accordions, h2/h3, "Category", Acuity category titles, Booksy sections, etc.), set "category" to that heading for EVERY service in that group. Use a short label (e.g. "Braids", "Kids"). If a service is not under any clear group, omit "category" or use null.
- Format prices with $ sign
- Format phone as (XXX) XXX-XXXX
- If a price is a range, use the starting price
- For logo: find the business logo image URL. Must be a full absolute URL.
- For images: include ALL image URLs you find (we will filter them visually in a later step). Include full absolute URLs. Skip SVGs and tracking pixels. IMPORTANT: prefer the highest-resolution version of each image — if a URL has size/width parameters (like ?w=300 or ?sz=thumb), use the largest available or remove size constraints.

BRAND COLORS — CRITICAL:
- Extract the BUSINESS's brand colors, NOT the booking platform's UI colors.
- For Acuity pages: look for "schedulerBackgroundColor", "background-color" on scheduling containers, or any custom color in the scheduler config. The page background tint IS the brand color.
- IGNORE platform UI colors: ANY shade of green from Acuity (the platform UI is green — #27ae60, #3DBE8B, #2ecc71, #4CAF50, #5cb85c, #6fcf97 and similar), category colors (#ED7087, #F08300, #FFE767, #73C1ED, #6FCF97, #8339B0, #B7A6EB), any pure grays. If the ONLY colors you find are greens from Acuity UI, return an EMPTY brand_colors array.
${htmlColors.length > 0 ? `\nHINT: Pre-extracted brand colors from HTML: ${htmlColors.join(", ")}. Include these if they look like real brand colors.` : ""}
- For description: look for meta description, og:description, or any about/bio text

HTML content (first 25000 chars):
${html.slice(0, 40000)}`,
            },
          ],
        });
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if ((status === 529 || status === 503 || status === 500) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          return createMessage(attempt + 1);
        }
        throw err;
      }
    };

    const message = await createMessage();
    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not extract data from that page." },
        { status: 400 }
      );
    }

    const extracted = JSON.parse(jsonMatch[0]);

    // Step 2: Use Claude Vision to classify images (photo vs graphic vs logo)
    const candidateImages: string[] = [
      ...(extracted.logo ? [extracted.logo] : []),
      ...(extracted.images || []),
    ];

    const { photos, logo: visionLogo, hasHeroImage: heroWorthy } = await classifyImages(candidateImages);

    // Use vision-detected logo, fall back to HTML-extracted logo
    const finalLogo = visionLogo || extracted.logo || null;
    // Use only vision-classified photos (excluding the logo), request high-res versions
    const finalImages = photos
      .filter((p: string) => p !== finalLogo)
      .map(getHighResUrl);
    // Check if the top image is hero-worthy (large enough for full-width display)
    const hasHeroImage = heroWorthy && finalImages.length > 0;

    // Post-process brand colors
    let brandColors: string[] = extracted.brand_colors || [];
    if (htmlColors.length > 0) {
      brandColors = Array.from(new Set(htmlColors.concat(brandColors).map((c: string) => c.toLowerCase())));
    }
    const isAcuityPage = !!acuityData;
    brandColors = brandColors.filter((c: string) => !isPlatformColor(c, isAcuityPage)).slice(0, 3);

    const acuityServices =
      acuityData?.categories?.length ? servicesFromAcuityCategories(acuityData.categories) : [];
    const claudeServiceRows = Array.isArray(extracted.services)
      ? (extracted.services as { name: string; price?: string; duration?: string; category?: string; image?: string }[])
      : [];
    const claudeServicesNorm = claudeServiceRows
      .filter((s) => s && typeof s.name === "string" && s.name.trim())
      .map((s) => normalizeClaudeServiceRow(s));
    const servicesPayload = acuityServices.length > 0 ? acuityServices : claudeServicesNorm;

    const acuityCategoryNames = acuityData?.categories?.map((c) => c.name) ?? [];
    const derivedCategoryNames = orderedUniqueCategoriesFromServices(servicesPayload);
    const categoriesPayload =
      acuityCategoryNames.length > 0 ? acuityCategoryNames : derivedCategoryNames;

    return NextResponse.json({
      business_name: extracted.business_name || null,
      phone: extracted.phone || null,
      address: extracted.address || null,
      description: extracted.description || null,
      services: servicesPayload,
      logo: finalLogo,
      images: finalImages,
      has_hero_image: hasHeroImage,
      brand_colors: brandColors,
      booking_url: fullUrl,
      booking_categories: acuityData?.categories || null,
      categories: categoriesPayload,
    });
  } catch (error: unknown) {
    console.error("Import booking error:", error);
    const status = (error as { status?: number }).status;
    const msg =
      status === 529 || status === 503
        ? "AI service is temporarily busy. Please wait a moment and try again."
        : "Failed to import data. Please try again.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
