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

function pickTwoThemes(businessType: BusinessType, brandColors?: string[]) {
  const themes = THEMES_BY_VERTICAL[businessType] || [];
  if (!themes.length) return themes.slice(0, 2);

  // If brand colors are provided, find the closest matching themes
  if (brandColors && brandColors.length > 0) {
    const scored = themes.map((theme) => {
      const score = brandColors.reduce((acc, bc) => {
        const dist = colorDistance(bc, theme.colors.primary);
        return acc + dist;
      }, 0);
      return { theme, score };
    });
    scored.sort((a, b) => a.score - b.score);
    // Pick the best match and one contrasting option
    return [scored[0].theme, scored[Math.min(scored.length - 1, Math.floor(scored.length / 2))].theme];
  }

  // Default: shuffle and pick 2
  const shuffled = [...themes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

function colorDistance(hex1: string, hex2: string): number {
  const toRgb = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  try {
    const [r1, g1, b1] = toRgb(hex1);
    const [r2, g2, b2] = toRgb(hex2);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  } catch {
    return 999;
  }
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
      brand_colors,
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
      brand_colors?: string[];
    };

    if (!business_name || !business_type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate 2 AI copy variants in one call
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
    const themes = pickTwoThemes(business_type, brand_colors);
    const variantLabels = ["A", "B"];

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
