export const maxDuration = 120;

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWebsiteCopyVariants } from "@/lib/ai/generate-copy";
import { getDefaultHeroVideoUrl } from "@/lib/templates/default-hero-videos";
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

const ALL_TEMPLATES = ["classic", "bold", "elegant", "vibrant", "warm", "runway", "grand"] as const;
type TemplateName = typeof ALL_TEMPLATES[number];

function buildSocialProofSummary(
  rating?: number | null,
  reviewCount?: number | null,
  reviews?: unknown,
): string | undefined {
  const parts: string[] = [];
  if (rating && reviewCount) parts.push(`${rating} stars from ${reviewCount} Google reviews`);
  else if (rating) parts.push(`${rating} star Google rating`);
  const reviewHighlights = Array.isArray(reviews)
    ? reviews
        .map((review) =>
          typeof review === "object" && review && "text" in review
            ? String(review.text).trim()
            : "",
        )
        .filter(Boolean)
        .slice(0, 2)
    : [];
  if (reviewHighlights.length > 0) {
    parts.push(`Customer notes: ${reviewHighlights.join(" / ")}`);
  }
  return parts.length > 0 ? parts.join(". ") : undefined;
}

function buildBookingSummary(bookingUrl?: string | null, bookingCategories?: unknown): string | undefined {
  const parts: string[] = [];
  if (bookingUrl) parts.push("Online booking is available");
  if (Array.isArray(bookingCategories) && bookingCategories.length > 0) {
    const categoryNames = bookingCategories
      .map((category) => (typeof category === "object" && category && "name" in category ? String(category.name) : ""))
      .filter(Boolean)
      .slice(0, 5);
    if (categoryNames.length > 0) parts.push(`Booking categories include ${categoryNames.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(". ") : undefined;
}

function buildHoursSummary(hours?: unknown): string | undefined {
  if (!hours || typeof hours !== "object") return undefined;
  return Object.entries(hours as Record<string, { open?: string; close?: string; closed?: boolean }>)
    .slice(0, 7)
    .map(([day, value]) => `${day}: ${value.closed ? "Closed" : `${value.open || ""}-${value.close || ""}`}`)
    .join("; ");
}

function pickThemeForTemplate<T extends { id: string; name: string }>(
  themes: T[],
  template: TemplateName,
  index: number,
): T {
  const keywordsByTemplate: Record<TemplateName, string[]> = {
    classic: ["gold", "navy", "sage", "mocha"],
    bold: ["black", "noir", "midnight", "burgundy", "fire"],
    elegant: ["rose", "champagne", "lavender", "pearl", "sage"],
    vibrant: ["coral", "jade", "ocean", "sunset", "fire", "pink"],
    warm: ["warm", "peach", "mocha", "terracotta", "earth", "tan"],
    runway: ["runway", "noir", "black", "midnight"],
    grand: ["runway", "noir", "black", "midnight"],
  };
  const keywords = keywordsByTemplate[template];
  const ranked = themes.filter((theme) => {
    const haystack = `${theme.id} ${theme.name}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
  const pool = ranked.length > 0 ? ranked : themes;
  return pool[index % pool.length];
}

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

    // Pick templates — use requested or pick 2 different ones
    const selectedTemplates = templates && templates.length > 0
      ? templates.filter((t: string): t is TemplateName => ALL_TEMPLATES.includes(t as TemplateName))
      : [
          (preview.template_variant || "classic") as TemplateName,
          ALL_TEMPLATES.filter((t) => t !== (preview.template_variant || "classic"))[
            Math.floor(Math.random() * (ALL_TEMPLATES.length - 1))
          ],
        ];

    // Generate enough fresh copy variants for every selected design.
    const variants = await generateWebsiteCopyVariants({
      businessName: preview.business_name,
      businessType: preview.business_type as BusinessType,
      description:
        typeof currentCopy.business_description === "string"
          ? currentCopy.business_description
          : undefined,
      services: services.filter((s) => s.name.trim()),
      products: products.filter((p) => p.name.trim()),
      address: preview.address || undefined,
      socialProof: buildSocialProofSummary(preview.rating, preview.review_count, currentCopy.google_reviews),
      bookingSummary: buildBookingSummary(preview.booking_url, currentCopy.booking_categories),
      hoursSummary: buildHoursSummary(preview.hours),
      variantCount: selectedTemplates.length,
      instructions: instructions || undefined,
    });

    // Pick themes — if keep_colors, reuse the original theme for all variants
    const allThemes = [...(THEMES_BY_VERTICAL[preview.business_type as BusinessType] || [])].sort(
      () => Math.random() - 0.5
    );

    const groupId = generateGroupId();
    const variantLabels = ["A", "B", "C"];

    const storedHeroVideo =
      typeof preview.hero_video_url === "string" ? preview.hero_video_url.trim() : "";
    const resolvedRegenHeroVideo =
      storedHeroVideo || getDefaultHeroVideoUrl(preview.business_type as BusinessType) || null;

    // Create new preview rows — keep everything except copy and template
    const previewRows = selectedTemplates.map((tmpl: TemplateName, i: number) => {
      const variant = variants[i % variants.length];
      // If keep_colors, use original theme; otherwise pick random
      const theme = keep_colors
        ? allThemes.find((t) => t.id === preview.color_theme) || allThemes[0]
        : pickThemeForTemplate(allThemes, tmpl, i);
      return {
        slug: generateSlug(preview.business_name),
        business_name: preview.business_name,
        business_type: preview.business_type,
        phone: preview.phone,
        color_theme: theme.id,
        services: preview.services,
        categories: preview.categories,
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
          ...(currentCopy.business_description ? { business_description: currentCopy.business_description } : {}),
        },
        template_variant: tmpl,
        group_id: groupId,
        variant_label: variantLabels[i] || String.fromCharCode(65 + i),
        hero_video_url: resolvedRegenHeroVideo,
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
