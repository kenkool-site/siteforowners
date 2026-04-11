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

  // --- Variant A: Light background ---
  const bgA = lighten(rawPrimary, 0.93);
  const mutedA = lighten(rawPrimary, 0.82);
  let fgA = darken(rawPrimary, 0.65);
  let primaryA = rawPrimary;

  // 1. foreground on background (body text): 4.5:1
  fgA = ensureContrast(fgA, bgA, 4.5);
  // 2. primary on background (prices, labels): 3:1 minimum
  primaryA = ensureContrast(primaryA, bgA, 3);
  // 3. background on primary (button text): 3:1 minimum
  if (contrastRatio(bgA, primaryA) < 3) {
    primaryA = ensureContrast(primaryA, bgA, 4);
  }
  // 4. foreground on muted (contact form text): 4.5:1
  fgA = ensureContrast(fgA, mutedA, 4.5);

  const paletteA: CustomColors = {
    primary: primaryA,
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
  let primaryB = rawPrimary;

  // 1. foreground on background (body text on dark): 4.5:1
  fgB = ensureContrast(fgB, bgB, 4.5);
  // 2. background on foreground — text on dark hero/footer: this is fgB text on bgB background, already checked
  // 3. primary on foreground (dark) surface — links in footer: 3:1
  primaryB = ensureContrast(primaryB, bgB, 3);
  // 4. If primary is too close to foreground, separate them
  if (contrastRatio(primaryB, fgB) < 1.5) {
    primaryB = isLight(primaryB) ? darken(primaryB, 0.2) : lighten(primaryB, 0.2);
    primaryB = ensureContrast(primaryB, bgB, 3);
  }
  // 5. foreground on primary (button text): 3:1
  if (contrastRatio(fgB, primaryB) < 3) {
    fgB = ensureContrast(fgB, primaryB, 3);
    // Re-check fgB on bgB after adjustment
    fgB = ensureContrast(fgB, bgB, 4.5);
  }

  const paletteB: CustomColors = {
    primary: primaryB,
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
      booking_categories?: unknown[];
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
        ...(booking_categories ? { booking_categories } : {}),
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
