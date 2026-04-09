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

    // Use Claude to extract structured data from the page
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Extract business information from this booking page HTML. Pull out everything you can find.

Return ONLY valid JSON with this structure (omit fields you can't find):
{
  "business_name": "...",
  "phone": "...",
  "address": "...",
  "services": [
    {"name": "Service Name", "price": "$XX", "duration": "XX min"}
  ]
}

Rules:
- Include ALL services/appointment types you find
- Format prices with $ sign
- Format phone as (XXX) XXX-XXXX
- Keep service names clean and concise
- If a price is a range, use the starting price

HTML content (first 15000 chars):
${html.slice(0, 15000)}`,
        },
      ],
    });

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
      services: extracted.services || [],
      booking_url: fullUrl,
    });
  } catch (error) {
    console.error("Import booking error:", error);
    return NextResponse.json(
      { error: "Failed to import data. Please try again." },
      { status: 500 }
    );
  }
}
