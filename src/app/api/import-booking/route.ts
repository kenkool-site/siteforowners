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

function isPlatformColor(hex: string): boolean {
  const normalized = hex.toLowerCase().trim();
  if (PLATFORM_COLORS.has(normalized)) return true;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness < 30 || brightness > 245) return true;
  if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15) return true;
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

// Fetch an image and return base64 + media type, or null if it fails
async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" } | null> {
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

    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (contentType.includes("png")) mediaType = "image/png";
    else if (contentType.includes("gif")) mediaType = "image/gif";
    else if (contentType.includes("webp")) mediaType = "image/webp";

    return { base64, mediaType };
  } catch {
    return null;
  }
}

// Use Claude Vision to classify images as photos vs promotional graphics
async function classifyImages(
  imageUrls: string[]
): Promise<{ photos: string[]; logo: string | null }> {
  if (imageUrls.length === 0) return { photos: [], logo: null };

  // Fetch up to 8 images in parallel
  const candidates = imageUrls.slice(0, 8);
  const fetched = await Promise.all(
    candidates.map(async (url) => ({
      url,
      data: await fetchImageAsBase64(url),
    }))
  );

  const validImages = fetched.filter((f) => f.data !== null);
  if (validImages.length === 0) return { photos: [], logo: null };

  // Build a single vision request with all images
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  content.push({
    type: "text",
    text: `I have ${validImages.length} images from a small business booking page. For each image, classify it as one of:
- "photo" — a real photograph of hair, nails, food, a person, the business interior/exterior, or their work results. These are gallery-worthy.
- "graphic" — a promotional flyer, infographic, text overlay image, banner with text, instructional graphic, collage with text, product packaging, social media post screenshot, or any image with significant text/typography on it.
- "logo" — the business logo or brand mark.

Return ONLY valid JSON as an array of objects:
[{"index": 0, "type": "photo|graphic|logo"}]

Be strict: if an image has ANY significant text overlaid on it (prices, dates, policies, promotional messages), classify it as "graphic" even if it also contains a photo underneath. We only want clean photos for a website gallery.`,
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
    if (!jsonMatch) return { photos: validImages.map((v) => v.url), logo: null };

    const classifications = JSON.parse(jsonMatch[0]) as Array<{ index: number; type: string }>;

    const photos: string[] = [];
    let logo: string | null = null;

    for (const c of classifications) {
      const img = validImages[c.index];
      if (!img) continue;
      if (c.type === "photo") photos.push(img.url);
      if (c.type === "logo" && !logo) logo = img.url;
    }

    return { photos, logo };
  } catch (err) {
    console.error("Vision classification failed, using all images:", err);
    return { photos: validImages.map((v) => v.url), logo: null };
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
- For images: include ALL image URLs you find (we will filter them visually in a later step). Include full absolute URLs. Skip SVGs and tracking pixels.

BRAND COLORS — CRITICAL:
- Extract the BUSINESS's brand colors, NOT the booking platform's UI colors.
- For Acuity pages: look for "schedulerBackgroundColor", "background-color" on scheduling containers, or any custom color in the scheduler config. The page background tint IS the brand color.
- IGNORE platform UI colors: Acuity green (#27ae60, #3DBE8B), category colors (#ED7087, #F08300, #FFE767, #73C1ED, #6FCF97, #8339B0, #B7A6EB), any pure grays.
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

    const { photos, logo: visionLogo } = await classifyImages(candidateImages);

    // Use vision-detected logo, fall back to HTML-extracted logo
    const finalLogo = visionLogo || extracted.logo || null;
    // Use only vision-classified photos (excluding the logo)
    const finalImages = photos.filter((p: string) => p !== finalLogo);

    // Post-process brand colors
    let brandColors: string[] = extracted.brand_colors || [];
    if (htmlColors.length > 0) {
      brandColors = Array.from(new Set(htmlColors.concat(brandColors).map((c: string) => c.toLowerCase())));
    }
    brandColors = brandColors.filter((c: string) => !isPlatformColor(c)).slice(0, 3);

    return NextResponse.json({
      business_name: extracted.business_name || null,
      phone: extracted.phone || null,
      address: extracted.address || null,
      description: extracted.description || null,
      services: extracted.services || [],
      logo: finalLogo,
      images: finalImages,
      brand_colors: brandColors,
      booking_url: fullUrl,
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
