import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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
  let cssVarMatch: RegExpExecArray | null;
  while ((cssVarMatch = cssVarRegex.exec(html)) !== null) colors.push(cssVarMatch[1]);

  const inlineStyleRegex = /style="[^"]*background(?:-color)?:\s*(#[0-9a-fA-F]{6})/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineStyleRegex.exec(html)) !== null) colors.push(inlineMatch[1]);

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
    path = path.replace(/\/s\d{2,4}\//g, "/s1200/");
    path = path.replace(/\/w\d{2,4}\//g, "/w1200/");
    path = path.replace(/\/\d{2,4}x\d{2,4}\//g, "/1200x1200/");
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
    // Only process actual images
    if (!contentType.startsWith("image/")) return null;
    // Skip SVGs
    if (contentType.includes("svg")) return null;

    const buffer = await res.arrayBuffer();
    // Skip tiny images (likely icons/tracking pixels) — under 5KB
    if (buffer.byteLength < 5000) return null;
    // Skip very large images to avoid token limits — over 2MB
    if (buffer.byteLength > 2 * 1024 * 1024) return null;

    const base64 = Buffer.from(buffer).toString("base64");
    const sizeKB = Math.round(buffer.byteLength / 1024);

    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (contentType.includes("png")) mediaType = "image/png";
    else if (contentType.includes("gif")) mediaType = "image/gif";
    else if (contentType.includes("webp")) mediaType = "image/webp";

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

  // Fetch up to 8 images in parallel
  const candidates = imageUrls.slice(0, 8);
  const fetched = await Promise.all(
    candidates.map(async (url) => ({
      url,
      data: await fetchImageAsBase64(url),
    }))
  );

  const validImages = fetched.filter((f) => f.data !== null);
  if (validImages.length === 0) return { photos: [], logo: null, hasHeroImage: false };

  // Build a single vision request with all images
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

  validImages.forEach((img, i) => {
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
      model: "claude-sonnet-4-20250514",
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
      const img = validImages[c.index];
      if (!img) continue;
      if (c.type === "photo") {
        const sizeKB = img.data!.sizeKB;
        // Images under 50KB are likely <600px — too small for full-width hero
        const heroWorthy = sizeKB >= 50;
        photoEntries.push({ url: img.url, quality: c.quality ?? 5, heroWorthy });
      }
      if (c.type === "logo" && !logo) logo = img.url;
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

// Extract data from Vagaro pages using meta tags (services are client-rendered)
function extractVagaroData(html: string, url: string): {
  business_name: string | null;
  description: string | null;
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

  // Extract og:image URLs — Vagaro has many, get up to 10
  const ogImageRegex = /property="og:image"\s+content="([^"]*)"/gi;
  const images: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = ogImageRegex.exec(html)) !== null && images.length < 10) {
    let imgUrl = match[1];
    // Upgrade from 340x340 thumbnails to larger size
    imgUrl = imgUrl.replace(/\/340x340\//g, "/1200x1200/");
    images.push(imgUrl);
  }

  return {
    business_name,
    description,
    images,
    booking_url: url,
  };
}

// Extract structured booking data from Acuity's embedded BUSINESS JSON
interface BookingCategory {
  name: string;
  services: { name: string; price: string; duration: string; id: number }[];
  directUrl: string;
}

function extractAcuityData(html: string): {
  categories: BookingCategory[];
  ownerId: number | null;
  schedulerColor: string | null;
} | null {
  const businessMatch = html.match(/var\s+BUSINESS\s*=\s*(\{[\s\S]*?\});\s*(?:var|$)/);
  if (!businessMatch) return null;

  try {
    const biz = JSON.parse(businessMatch[1]);
    const ownerId: number = biz.id;
    const schedulerColor: string | null = biz.styles?.colors?.schedulerBackground || null;
    const appointmentTypes = biz.appointmentTypes || {};

    const categories: BookingCategory[] = [];
    for (const [categoryName, services] of Object.entries(appointmentTypes)) {
      const svcList = services as Array<{
        id: number; name: string; price: string; duration: number;
      }>;
      categories.push({
        name: categoryName.replace(/^\d+\./, "").trim(),
        services: svcList.map((s) => ({
          name: s.name,
          price: `$${parseFloat(s.price).toFixed(0)}`,
          duration: `${s.duration} min`,
          id: s.id,
        })),
        directUrl: `https://app.acuityscheduling.com/schedule.php?owner=${ownerId}&appointmentType=category:${encodeURIComponent(categoryName)}`,
      });
    }

    return { categories, ownerId, schedulerColor };
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

    // Try Vagaro-specific extraction (services are client-rendered, so use meta tags)
    const vagaroData = extractVagaroData(html, fullUrl);
    if (vagaroData) {
      // For Vagaro, we have images and business info from meta tags.
      // Services aren't in the HTML so we skip Claude parsing and let the wizard
      // use default services for the business type.
      const { photos, logo: visionLogo, hasHeroImage: heroWorthy } = await classifyImages(vagaroData.images);
      const finalImages = photos.map(getHighResUrl);

      return NextResponse.json({
        business_name: vagaroData.business_name,
        phone: null,
        address: null,
        description: vagaroData.description,
        services: [],
        logo: visionLogo || null,
        images: finalImages,
        has_hero_image: heroWorthy && finalImages.length > 0,
        brand_colors: [],
        booking_url: vagaroData.booking_url,
        booking_categories: null,
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
          model: "claude-sonnet-4-20250514",
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
    {"name": "Service Name", "price": "$XX", "duration": "XX min"}
  ],
  "logo": "https://url-to-logo-image.jpg",
  "images": ["https://full-url-to-image.jpg"],
  "brand_colors": ["#hex1", "#hex2"],
  "description": "Brief description of the business if found"
}

Rules:
- Include ALL services/appointment types you find
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
${html.slice(0, 25000)}`,
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

    return NextResponse.json({
      business_name: extracted.business_name || null,
      phone: extracted.phone || null,
      address: extracted.address || null,
      description: extracted.description || null,
      services: extracted.services || [],
      logo: finalLogo,
      images: finalImages,
      has_hero_image: hasHeroImage,
      brand_colors: brandColors,
      booking_url: fullUrl,
      booking_categories: acuityData?.categories || null,
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
