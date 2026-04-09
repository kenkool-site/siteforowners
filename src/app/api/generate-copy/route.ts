import { NextResponse } from "next/server";
import { generateWebsiteCopy } from "@/lib/ai/generate-copy";
import { STOCK_PHOTOS } from "@/lib/templates/stock-photos";
import { createAdminClient } from "@/lib/supabase/admin";
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
      description,
      services,
      address,
      uploaded_images,
    } = body as {
      business_name: string;
      business_type: BusinessType;
      phone?: string;
      color_theme: ColorTheme;
      tagline?: string;
      description?: string;
      services: ServiceItem[];
      address?: string;
      uploaded_images?: string[];
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
      description,
      services: services.filter((s) => s.name.trim()),
      address,
    });

    const slug = generateSlug(business_name);
    const stockImages = STOCK_PHOTOS[business_type] || [];
    const images =
      uploaded_images && uploaded_images.length > 0
        ? uploaded_images
        : stockImages;

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
    };

    const supabase = createAdminClient();
    const { error: insertError } = await supabase
      .from("previews")
      .insert(previewData);

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      throw new Error("Failed to store preview");
    }

    return NextResponse.json({ slug, preview: previewData });
  } catch (error) {
    console.error("Generate copy error:", error);
    return NextResponse.json(
      { error: "Failed to generate website copy. Please try again." },
      { status: 500 }
    );
  }
}
