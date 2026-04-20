export const maxDuration = 120;

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

// Relative luminance for contrast checking (WCAG)
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function isLight(hex: string): boolean {
  return luminance(hex) > 0.4;
}

// Adjust a color until it meets minRatio contrast against a surface
function ensureContrast(fg: string, bg: string, minRatio = 4.5): string {
  const bgIsLight = isLight(bg);
  let current = fg;
  for (let i = 0; i < 15; i++) {
    if (contrastRatio(current, bg) >= minRatio) return current;
    current = bgIsLight ? darken(current, 0.12) : lighten(current, 0.12);
  }
  return bgIsLight ? "#1A1A1A" : "#F5F5F5";
}

/*
 * Build two palettes from brand colors, ensuring ALL critical color pairs
 * used across templates have sufficient contrast.
 *
 * Critical pairs (from template audit):
 *   foreground on background  — main body text
 *   background on foreground  — text on dark hero/footer sections
 *   primary on background     — service prices, accent text, outline buttons
 *   primary on foreground     — links/headings on dark sections (footer, booking)
 *   background on primary     — button text (primary-colored buttons)
 *   foreground on muted       — text on muted sections (contact form)
 */
function buildCustomPalettes(brandColors: string[]): [CustomColors, CustomColors] {
  const rawPrimary = brandColors[0];
  const rawSecondary = brandColors[1] || lighten(rawPrimary, 0.7);
  const rawAccent = brandColors[2] || darken(rawPrimary, 0.2);

  // IMPORTANT: Keep the brand primary color FIXED. It's the brand identity.
  // Only adjust foreground/background to ensure contrast around it.
  // Template components use runtime contrast utilities for edge cases.

  // --- Variant A: Light background ---
  const bgA = lighten(rawPrimary, 0.93);
  const mutedA = lighten(rawPrimary, 0.82);
  let fgA = darken(rawPrimary, 0.65);

  // Ensure body text is readable on light bg
  fgA = ensureContrast(fgA, bgA, 4.5);
  fgA = ensureContrast(fgA, mutedA, 4.5);
  // Ensure inverted text (bg color on fg) is readable
  if (contrastRatio(bgA, fgA) < 4.5) {
    fgA = darken(fgA, 0.15);
    fgA = ensureContrast(fgA, bgA, 4.5);
  }

  const paletteA: CustomColors = {
    primary: rawPrimary,
    secondary: rawSecondary,
    accent: rawAccent,
    background: bgA,
    foreground: fgA,
    muted: mutedA,
  };

  // --- Variant B: Dark background ---
  const bgB = darken(rawPrimary, 0.75);
  const mutedB = darken(rawPrimary, 0.55);
  let fgB = lighten(rawPrimary, 0.93);

  // Ensure body text is readable on dark bg
  fgB = ensureContrast(fgB, bgB, 4.5);

  const paletteB: CustomColors = {
    primary: rawPrimary,
    secondary: lighten(rawPrimary, 0.3),
    accent: rawAccent,
    background: bgB,
    foreground: fgB,
    muted: mutedB,
  };

  return [paletteA, paletteB];
}

interface CustomColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

function lighten(hex: string, amount: number): string {
  try {
    const [r, g, b] = toRgb(hex);
    return toHex(
      r + (255 - r) * amount,
      g + (255 - g) * amount,
      b + (255 - b) * amount
    );
  } catch { return "#FFFFFF"; }
}

function darken(hex: string, amount: number): string {
  try {
    const [r, g, b] = toRgb(hex);
    return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  } catch { return "#1A1A1A"; }
}

type TemplateName = 'classic' | 'bold' | 'elegant' | 'vibrant' | 'warm';

const ALL_TEMPLATES: TemplateName[] = ['classic', 'bold', 'elegant', 'vibrant', 'warm'];

const CONTRAST_PAIRS: Record<TemplateName, TemplateName[]> = {
  classic: ['bold', 'vibrant'],
  bold: ['elegant', 'warm'],
  elegant: ['vibrant', 'bold'],
  vibrant: ['elegant', 'warm'],
  warm: ['bold', 'vibrant'],
};

function pickTwoTemplates(): [TemplateName, TemplateName] {
  const a = ALL_TEMPLATES[Math.floor(Math.random() * ALL_TEMPLATES.length)];
  const pairs = CONTRAST_PAIRS[a];
  const b = pairs[Math.floor(Math.random() * pairs.length)];
  return [a, b];
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
      logo,
      uploaded_images,
      brand_colors,
      booking_categories,
      has_hero_image,
      rating,
      review_count,
      google_reviews,
      hours,
      templates: requestedTemplates,
      keep_colors: keepColors,
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
      logo?: string;
      uploaded_images?: string[];
      has_hero_image?: boolean;
      brand_colors?: string[];
      booking_categories?: unknown[];
      rating?: number;
      review_count?: number;
      google_reviews?: { authorName: string; rating: number; text: string; relativeTime: string }[];
      hours?: Record<string, { open: string; close: string; closed?: boolean }>;
      templates?: string[];
      keep_colors?: boolean;
    };

    if (!business_name || !business_type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`Generate copy: rating=${rating}, review_count=${review_count}, google_reviews=${google_reviews?.length || 0}`);

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
    let images: string[];
    if (uploaded_images && uploaded_images.length > 0) {
      if (has_hero_image === false && stockImages.length > 0) {
        // Imported images are too low-res for hero — use stock photo as hero,
        // imported images go to gallery positions
        images = [stockImages[0], ...uploaded_images];
      } else {
        images = uploaded_images;
      }
    } else {
      images = stockImages;
    }

    const groupId = generateGroupId();
    const customPalettes = brand_colors && brand_colors.length > 0
      ? buildCustomPalettes(brand_colors)
      : null;

    // Use requested templates or auto-pick 2
    const templates: TemplateName[] = requestedTemplates && requestedTemplates.length > 0
      ? requestedTemplates.filter((t): t is TemplateName => ALL_TEMPLATES.includes(t as TemplateName))
      : [...pickTwoTemplates()];

    // Pick themes — if keepColors and we have custom palettes, reuse the same palette for all
    const allThemes = [...(THEMES_BY_VERTICAL[business_type] || [])].sort(() => Math.random() - 0.5);
    const variantLabels = ["A", "B", "C"];

    const supabase = createAdminClient();
    const previewRows = templates.map((tmpl, i) => {
      const variant = variants[i % variants.length];
      // When keepColors: use the first theme for all variants (same look)
      const theme = keepColors ? allThemes[0] : allThemes[i % allThemes.length];
      return {
        slug: generateSlug(business_name),
        business_name,
        business_type,
        phone,
        color_theme: theme.id,
        services: services.filter((s) => s.name.trim()),
        products: products?.filter((p) => p.name.trim()) || [],
        booking_url,
        address,
        images,
        hours: hours || null,
        rating: rating || null,
        review_count: review_count || null,
        generated_copy: {
          en: variant.en,
          es: variant.es,
          ...(customPalettes ? { custom_colors: customPalettes[i % customPalettes.length] } : {}),
          ...(brand_colors && brand_colors.length > 0 ? { brand_colors } : {}),
          ...(logo ? { logo } : {}),
          ...(booking_categories ? { booking_categories } : {}),
          ...(google_reviews && google_reviews.length > 0 ? { google_reviews } : {}),
        },
        template_variant: tmpl,
        group_id: groupId,
        variant_label: variantLabels[i] || String.fromCharCode(65 + i),
      };
    });

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
