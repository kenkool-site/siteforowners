import { NextResponse } from "next/server";
import { generateWebsiteCopyVariants } from "@/lib/ai/generate-copy";
import { STOCK_PHOTOS } from "@/lib/templates/stock-photos";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessType, ServiceItem, ProductItem } from "@/lib/ai/types";

function generateSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

function generateGroupId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function pickThreeThemes(businessType: BusinessType) {
  const themes = THEMES_BY_VERTICAL[businessType] || [];
  // Pick 3 diverse themes: one light, one dark, one accent-heavy
  // Shuffle and pick first 3 for variety
  const shuffled = [...themes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      business_name,
      business_type,
      phone,
      tagline,
      description,
      services,
      products,
      booking_url,
      address,
      uploaded_images,
    } = body as {
      business_name: string;
      business_type: BusinessType;
      phone?: string;
      tagline?: string;
      description?: string;
      services: ServiceItem[];
      products?: ProductItem[];
      booking_url?: string;
      address?: string;
      uploaded_images?: string[];
    };

    if (!business_name || !business_type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate 3 AI copy variants in one call
    const variants = await generateWebsiteCopyVariants({
      businessName: business_name,
      businessType: business_type,
      tagline,
      description,
      services: services.filter((s) => s.name.trim()),
      products: products?.filter((p) => p.name.trim()),
      address,
    });

    const stockImages = STOCK_PHOTOS[business_type] || [];
    const images =
      uploaded_images && uploaded_images.length > 0
        ? uploaded_images
        : stockImages;

    const groupId = generateGroupId();
    const themes = pickThreeThemes(business_type);
    const variantLabels = ["A", "B", "C"];

    const supabase = createAdminClient();
    const previewRows = variants.map((variant, i) => ({
      slug: generateSlug(business_name),
      business_name,
      business_type,
      phone,
      color_theme: themes[i].id,
      services: services.filter((s) => s.name.trim()),
      products: products?.filter((p) => p.name.trim()) || [],
      booking_url,
      address,
      images,
      generated_copy: { en: variant.en, es: variant.es },
      template_variant: `${business_type}_${variant.style}`,
      group_id: groupId,
      variant_label: variantLabels[i],
    }));

    const { error: insertError } = await supabase
      .from("previews")
      .insert(previewRows);

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      throw new Error("Failed to store previews");
    }

    return NextResponse.json({
      group_id: groupId,
      slugs: previewRows.map((r) => r.slug),
    });
  } catch (error) {
    console.error("Generate copy error:", error);
    return NextResponse.json(
      { error: "Failed to generate website copy. Please try again." },
      { status: 500 }
    );
  }
}
