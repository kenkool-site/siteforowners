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
  // Skip very dark or very light colors (likely text/bg defaults)
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness < 30 || brightness > 245) return true;
  // Skip pure grays
  if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15) return true;
  return false;
}

// Extract brand colors directly from HTML/CSS patterns before sending to Claude
function extractColorsFromHtml(html: string): string[] {
  const colors: string[] = [];

  // Acuity: look for scheduler background color in their config
  const acuityBgMatch = html.match(/background[_-]?color['":\s]*['"]?(#[0-9a-fA-F]{6})/i);
  if (acuityBgMatch) colors.push(acuityBgMatch[1]);

  // Look for custom CSS properties with color values
  const cssVarRegex = /--[a-z-]*color[^:]*:\s*(#[0-9a-fA-F]{6})/gi;
  let cssVarMatch: RegExpExecArray | null;
  while ((cssVarMatch = cssVarRegex.exec(html)) !== null) colors.push(cssVarMatch[1]);

  // Look for inline style background colors on main containers
  const inlineStyleRegex = /style="[^"]*background(?:-color)?:\s*(#[0-9a-fA-F]{6})/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineStyleRegex.exec(html)) !== null) colors.push(inlineMatch[1]);

  // Look for meta theme-color
  const themeColorMatch = html.match(/meta[^>]*name=["']theme-color["'][^>]*content=["'](#[0-9a-fA-F]{6})/i);
  if (themeColorMatch) colors.push(themeColorMatch[1]);

  // Deduplicate and filter out platform colors
  const unique = Array.from(new Set(colors.map((c) => c.toLowerCase())));
  return unique.filter((c) => !isPlatformColor(c));
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

    // Auto-prepend https:// if missing
    const fullUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;

    // Fetch the booking page HTML
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

    // Pre-extract colors from HTML patterns (more reliable than LLM guessing)
    const htmlColors = extractColorsFromHtml(html);

    // Use Claude to extract structured data from the page (with retry for transient errors)
    const createMessage = async (attempt = 0): Promise<Anthropic.Message> => {
      try {
        return await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [
            {
              role: "user",
              content: `Extract business information from this booking page HTML. Pull out EVERYTHING you can find.

Return ONLY valid JSON with this structure (omit fields you can't find):
{
  "business_name": "...",
  "phone": "...",
  "address": "...",
  "services": [
    {"name": "Service Name", "price": "$XX", "duration": "XX min"}
  ],
  "logo": "https://url-to-logo-image.jpg",
  "images": ["https://full-url-to-photo.jpg"],
  "brand_colors": ["#hex1", "#hex2"],
  "description": "Brief description of the business if found"
}

Rules:
- Include ALL services/appointment types you find
- Format prices with $ sign
- Format phone as (XXX) XXX-XXXX
- Keep service names clean and concise
- If a price is a range, use the starting price
- For logo: find the business logo image (usually in header, navbar, or og:image meta tag). Return the single best logo URL. Must be a full absolute URL.

IMAGE CLASSIFICATION — CRITICAL:
- For images: you must ONLY include images that are REAL PHOTOGRAPHS of hair, nails, food, the business, or their work.
- EXCLUDE any image that appears to be: a promotional flyer, infographic, text overlay image, banner with text, instructional graphic, product packaging photo, icon, SVG, tiny image, or tracking pixel.
- How to tell: look at the image filename, alt text, surrounding HTML context, and image dimensions. If the image is inside a description/bio section or has text-heavy alt text, it's likely a promotional graphic — SKIP IT.
- If you're unsure whether an image is a real photo or a graphic, EXCLUDE it. We only want clean gallery-worthy photos.
- Include full absolute URLs.

BRAND COLORS — CRITICAL:
- Extract the BUSINESS's brand colors, NOT the booking platform's UI colors.
- For Acuity pages: look for the "schedulerBackgroundColor", "background-color" on the .scheduling-page or #schedule-container, or any custom color set in the scheduler config. The page's main background tint IS the brand color.
- IGNORE these platform UI colors completely: Acuity green (#27ae60, #3DBE8B), Acuity category colors (#ED7087, #F08300, #FFE767, #73C1ED, #6FCF97, #8339B0, #B7A6EB), Booksy blue, Vagaro teal, Calendly blue, any pure grays (#666, #414141, #333).
- Look for: page background color, header/banner colors, colors applied to the business name.
- Include 2-3 hex colors that represent the BUSINESS's visual identity.
${htmlColors.length > 0 ? `\nHINT: I pre-extracted these potential brand colors from the HTML: ${htmlColors.join(", ")}. Verify these and include them if they look like real brand colors (not platform defaults).` : ""}
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

    // Post-process brand colors: merge HTML-extracted colors with Claude's picks,
    // filter out any platform colors that slipped through
    let brandColors: string[] = extracted.brand_colors || [];
    if (htmlColors.length > 0) {
      // Prepend HTML-extracted colors (more reliable), deduplicate
      brandColors = Array.from(new Set(htmlColors.concat(brandColors).map((c: string) => c.toLowerCase())));
    }
    brandColors = brandColors.filter((c: string) => !isPlatformColor(c)).slice(0, 3);

    return NextResponse.json({
      business_name: extracted.business_name || null,
      phone: extracted.phone || null,
      address: extracted.address || null,
      description: extracted.description || null,
      services: extracted.services || [],
      logo: extracted.logo || null,
      images: extracted.images || [],
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
