export const maxDuration = 120;

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWebsiteCopyVariants } from "@/lib/ai/generate-copy";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import type { BusinessType } from "@/lib/ai/types";

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

const ALL_TEMPLATES = ["classic", "bold", "elegant", "vibrant", "warm"] as const;

export async function POST(request: Request) {
  try {
    const { slug, templates, instructions, keep_colors } = await request.json();

    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: preview, error: fetchError } = await supabase
      .from("previews")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchError || !preview) {
      return NextResponse.json({ error: "Preview not found" }, { status: 404 });
    }

    const services = (preview.services || []) as { name: string; price: string }[];
    const products = (preview.products || []) as { name: string; price: string }[];
    const currentCopy = (preview.generated_copy || {}) as Record<string, unknown>;

    // Generate 2 fresh copy variants
    const variants = await generateWebsiteCopyVariants({
      businessName: preview.business_name,
      businessType: preview.business_type as BusinessType,
      description: "",
      services: services.filter((s) => s.name.trim()),
      products: products.filter((p) => p.name.trim()),
      address: preview.address || undefined,
      instructions: instructions || undefined,
    });

    // Pick templates — use requested or pick 2 different ones
    const selectedTemplates = templates && templates.length > 0
      ? templates.filter((t: string) => ALL_TEMPLATES.includes(t as typeof ALL_TEMPLATES[number]))
      : [
          preview.template_variant || "classic",
          ALL_TEMPLATES.filter((t) => t !== (preview.template_variant || "classic"))[
            Math.floor(Math.random() * 4)
          ],
        ];

    // Pick themes — if keep_colors, reuse the original theme for all variants
    const allThemes = [...(THEMES_BY_VERTICAL[preview.business_type as BusinessType] || [])].sort(
      () => Math.random() - 0.5
    );

    const groupId = generateGroupId();
    const variantLabels = ["A", "B", "C"];

    // Create new preview rows — keep everything except copy and template
    const previewRows = selectedTemplates.map((tmpl: string, i: number) => {
      const variant = variants[i % variants.length];
      // If keep_colors, use original theme; otherwise pick random
      const theme = keep_colors
        ? allThemes.find((t) => t.id === preview.color_theme) || allThemes[0]
        : allThemes[i % allThemes.length];
      return {
        slug: generateSlug(preview.business_name),
        business_name: preview.business_name,
        business_type: preview.business_type,
        phone: preview.phone,
        color_theme: theme.id,
        services: preview.services,
        products: preview.products,
        booking_url: preview.booking_url,
        address: preview.address,
        images: preview.images,
        hours: preview.hours,
        rating: preview.rating,
        review_count: preview.review_count,
        generated_copy: {
          en: variant.en,
          es: variant.es,
          // Preserve existing non-copy fields (always keep colors if keep_colors)
          ...(keep_colors || currentCopy.custom_colors ? { custom_colors: currentCopy.custom_colors } : {}),
          ...(keep_colors || currentCopy.brand_colors ? { brand_colors: currentCopy.brand_colors } : {}),
          ...(currentCopy.logo ? { logo: currentCopy.logo } : {}),
          ...(currentCopy.booking_categories ? { booking_categories: currentCopy.booking_categories } : {}),
          ...(currentCopy.google_reviews ? { google_reviews: currentCopy.google_reviews } : {}),
        },
        template_variant: keep_colors ? (preview.template_variant || tmpl) : tmpl,
        group_id: groupId,
        variant_label: variantLabels[i] || String.fromCharCode(65 + i),
      };
    });

    const { error: insertError } = await supabase.from("previews").insert(previewRows);

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json({ error: "Failed to create variants" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      group_id: groupId,
    });
  } catch (error) {
    console.error("Regenerate copy error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate" },
      { status: 500 }
    );
  }
}
