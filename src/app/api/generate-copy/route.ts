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

function pickTwoThemes(businessType: BusinessType) {
  const themes = THEMES_BY_VERTICAL[businessType] || [];
  const shuffled = [...themes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

// Build a full color palette from brand colors
function buildCustomPalettes(brandColors: string[]): [CustomColors, CustomColors] {
  const primary = brandColors[0];
  const secondary = brandColors[1] || lighten(primary, 0.7);
  const accent = brandColors[2] || darken(primary, 0.2);

  // Variant A: Light background with brand primary
  const paletteA = {
    primary,
    secondary,
    accent,
    background: lighten(primary, 0.92),
    foreground: darken(primary, 0.6),
    muted: lighten(primary, 0.8),
  };

  // Variant B: Dark background with brand primary as accent
  const paletteB = {
    primary,
    secondary: lighten(primary, 0.3),
    accent,
    background: darken(primary, 0.7),
    foreground: lighten(primary, 0.92),
    muted: darken(primary, 0.5),
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
    const themes = pickTwoThemes(business_type);
    const customPalettes = brand_colors && brand_colors.length > 0
      ? buildCustomPalettes(brand_colors)
      : null;
    const variantLabels = ["A", "B"];
    const [templateA, templateB] = pickTwoTemplates();
    const templates = [templateA, templateB];

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
      generated_copy: {
        en: variant.en,
        es: variant.es,
        // Embed brand-derived colors and logo in the jsonb field
        ...(customPalettes ? { custom_colors: customPalettes[i] } : {}),
        ...(logo ? { logo } : {}),
      },
      template_variant: templates[i],
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
