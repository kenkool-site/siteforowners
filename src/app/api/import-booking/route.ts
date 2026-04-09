import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

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
- For images: extract image URLs that are PHOTOS of work, gallery images, or service photos. NOT logos, NOT icons, NOT tiny images. Include full absolute URLs. Skip SVGs and tracking pixels.
- For brand_colors: extract hex colors from inline styles, CSS custom properties, background-color, color properties, or meta theme-color tags. Include the 2-3 most prominent brand colors.
- For description: look for meta description, og:description, or any about/bio text

HTML content (first 20000 chars):
${html.slice(0, 20000)}`,
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

    return NextResponse.json({
      business_name: extracted.business_name || null,
      phone: extracted.phone || null,
      address: extracted.address || null,
      description: extracted.description || null,
      services: extracted.services || [],
      logo: extracted.logo || null,
      images: extracted.images || [],
      brand_colors: extracted.brand_colors || [],
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
