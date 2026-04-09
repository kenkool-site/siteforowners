import { NextResponse } from "next/server";
import { generateWebsiteCopy } from "@/lib/ai/generate-copy";
import { STOCK_PHOTOS } from "@/lib/templates/stock-photos";
import type { BusinessType, ColorTheme, ServiceItem } from "@/lib/ai/types";

function generateSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      business_name,
      business_type,
      phone,
      color_theme,
      tagline,
      services,
      address,
    } = body as {
      business_name: string;
      business_type: BusinessType;
      phone?: string;
      color_theme: ColorTheme;
      tagline?: string;
      services: ServiceItem[];
      address?: string;
    };

    if (!business_name || !business_type || !color_theme) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate AI copy
    const generated_copy = await generateWebsiteCopy({
      businessName: business_name,
      businessType: business_type,
      tagline,
      services: services.filter((s) => s.name.trim()),
      address,
    });

    const slug = generateSlug(business_name);
    const images = STOCK_PHOTOS[business_type] || [];

    // For MVP, store in a simple JSON file or return directly
    // TODO: Week 2 — store in Supabase previews table
    const previewData = {
      slug,
      business_name,
      business_type,
      phone,
      color_theme,
      services: services.filter((s) => s.name.trim()),
      address,
      images,
      generated_copy,
      template_variant: `${business_type}_${color_theme.split("_").slice(1).join("_")}`,
      created_at: new Date().toISOString(),
    };

    // Store in /tmp for MVP (replaced with Supabase in Week 2)
    const fs = await import("fs/promises");
    const dir = "/tmp/siteforowners-previews";
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      `${dir}/${slug}.json`,
      JSON.stringify(previewData, null, 2)
    );

    return NextResponse.json({ slug, preview: previewData });
  } catch (error) {
    console.error("Generate copy error:", error);
    return NextResponse.json(
      { error: "Failed to generate website copy. Please try again." },
      { status: 500 }
    );
  }
}
