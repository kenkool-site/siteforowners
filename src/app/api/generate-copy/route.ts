export const maxDuration = 120;

import { NextResponse } from "next/server";
import { generateWebsiteCopyVariants } from "@/lib/ai/generate-copy";
import { getDefaultHeroVideoUrl } from "@/lib/templates/default-hero-videos";
import { STOCK_PHOTOS } from "@/lib/templates/stock-photos";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BusinessType, ServiceItem, ProductItem } from "@/lib/ai/types";
import { buildCustomPalettes } from "@/lib/templates/brand-palette";

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

type TemplateName = 'classic' | 'bold' | 'elegant' | 'vibrant' | 'warm' | 'runway' | 'grand';

const ALL_TEMPLATES: TemplateName[] = ['classic', 'bold', 'elegant', 'vibrant', 'warm', 'runway', 'grand'];

const CONTRAST_PAIRS: Record<TemplateName, TemplateName[]> = {
  classic: ['bold', 'vibrant'],
  bold: ['elegant', 'warm'],
  elegant: ['vibrant', 'bold'],
  vibrant: ['elegant', 'warm'],
  warm: ['bold', 'vibrant'],
  runway: ['elegant', 'warm'],
  grand: ['elegant', 'warm'],
};

function pickTwoTemplates(): [TemplateName, TemplateName] {
  const a = ALL_TEMPLATES[Math.floor(Math.random() * ALL_TEMPLATES.length)];
  const pairs = CONTRAST_PAIRS[a];
  const b = pairs[Math.floor(Math.random() * pairs.length)];
  return [a, b];
}

function buildSocialProofSummary(
  rating?: number,
  reviewCount?: number,
  reviews?: { authorName: string; rating: number; text: string; relativeTime: string }[],
): string | undefined {
  const parts: string[] = [];
  if (rating && reviewCount) parts.push(`${rating} stars from ${reviewCount} Google reviews`);
  else if (rating) parts.push(`${rating} star Google rating`);
  const reviewHighlights = reviews
    ?.map((review) => review.text?.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (reviewHighlights && reviewHighlights.length > 0) {
    parts.push(`Customer notes: ${reviewHighlights.join(" / ")}`);
  }
  return parts.length > 0 ? parts.join(". ") : undefined;
}

function buildBookingSummary(bookingUrl?: string, bookingCategories?: unknown[]): string | undefined {
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

function buildHoursSummary(
  hours?: Record<string, { open: string; close: string; closed?: boolean }>,
): string | undefined {
  if (!hours) return undefined;
  return Object.entries(hours)
    .slice(0, 7)
    .map(([day, value]) => `${day}: ${value.closed ? "Closed" : `${value.open}-${value.close}`}`)
    .join("; ");
}

function servicesFromBookingCategories(bookingCategories?: unknown[]): ServiceItem[] {
  if (!Array.isArray(bookingCategories)) return [];
  return bookingCategories.flatMap((category) => {
    if (!category || typeof category !== "object" || !("name" in category)) return [];
    const categoryName = String(category.name);
    const rawServices = "services" in category && Array.isArray(category.services) ? category.services : [];
    return rawServices
      .filter((service): service is Record<string, unknown> => !!service && typeof service === "object" && "name" in service)
      .map((service) => ({
        name: String(service.name),
        price: typeof service.price === "string" ? service.price : "",
        category: categoryName,
        image: typeof service.image === "string" ? service.image : undefined,
      }));
  });
}

function categoriesFromBookingCategories(bookingCategories?: unknown[]): string[] {
  if (!Array.isArray(bookingCategories)) return [];
  return bookingCategories
    .map((category) =>
      category && typeof category === "object" && "name" in category ? String(category.name).trim() : "",
    )
    .filter(Boolean);
}

/** Gallery URLs from per-service art (booking platforms often lack venue hero photos). */
function uniqueServiceImageUrls(services: ServiceItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of services) {
    const u = s.image?.trim();
    if (!u || !(u.startsWith("https://") || u.startsWith("http://"))) continue;
    if (u.toLowerCase().endsWith(".svg")) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
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
      categories,
      has_hero_image,
      rating,
      review_count,
      google_reviews,
      hours,
      templates: requestedTemplates,
      keep_colors: keepColors,
      hero_video_url,
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
      categories?: string[];
      rating?: number;
      review_count?: number;
      google_reviews?: { authorName: string; rating: number; text: string; relativeTime: string }[];
      hours?: Record<string, { open: string; close: string; closed?: boolean }>;
      templates?: string[];
      keep_colors?: boolean;
      hero_video_url?: string | null;
    };

    if (!business_name || !business_type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`Generate copy: rating=${rating}, review_count=${review_count}, google_reviews=${google_reviews?.length || 0}`);

    const customerHeroVideo = typeof hero_video_url === "string" ? hero_video_url.trim() : "";
    const resolvedHeroVideo =
      customerHeroVideo || getDefaultHeroVideoUrl(business_type) || "";

    // Use requested templates or auto-pick 2
    const templates: TemplateName[] = requestedTemplates && requestedTemplates.length > 0
      ? requestedTemplates.filter((t): t is TemplateName => ALL_TEMPLATES.includes(t as TemplateName))
      : [...pickTwoTemplates()];
    const bookingServices = servicesFromBookingCategories(booking_categories);
    const resolvedServices = bookingServices.length > 0 ? bookingServices : services.filter((s) => s.name.trim());
    const resolvedCategories = categories && categories.length > 0
      ? categories
      : categoriesFromBookingCategories(booking_categories);

    // Generate enough AI copy variants for every selected design.
    const variants = await generateWebsiteCopyVariants({
      businessName: business_name,
      businessType: business_type,
      tagline,
      description,
      services: resolvedServices,
      products: products?.filter((p) => p.name.trim()),
      address,
      socialProof: buildSocialProofSummary(rating, review_count, google_reviews),
      bookingSummary: buildBookingSummary(booking_url, booking_categories),
      hoursSummary: buildHoursSummary(hours),
      variantCount: templates.length,
    });

    const stockImages = STOCK_PHOTOS[business_type] || [];
    const serviceGalleryUrls = uniqueServiceImageUrls(resolvedServices);
    let images: string[];
    if (uploaded_images && uploaded_images.length > 0) {
      if (has_hero_image === false && stockImages.length > 0) {
        // Imported images are too low-res for hero — use stock photo as hero,
        // imported images go to gallery positions
        images = [stockImages[0], ...uploaded_images];
      } else {
        images = uploaded_images;
      }
    } else if (serviceGalleryUrls.length > 0) {
      // Booking import: no venue/Gallery photos, but services often have images — use those
      // instead of generic stock (still optionally tuck stock first when hero is low-res).
      if (has_hero_image === false && stockImages.length > 0) {
        images = [stockImages[0], ...serviceGalleryUrls];
      } else {
        images = serviceGalleryUrls;
      }
    } else {
      images = stockImages;
    }

    const groupId = generateGroupId();
    const customPalettes = brand_colors && brand_colors.length > 0
      ? buildCustomPalettes(brand_colors)
      : null;

    // Pick themes — if keepColors and we have custom palettes, reuse the same palette for all
    const allThemes = [...(THEMES_BY_VERTICAL[business_type] || [])].sort(() => Math.random() - 0.5);
    const variantLabels = ["A", "B", "C"];

    const supabase = createAdminClient();
    const previewRows = templates.map((tmpl, i) => {
      const variant = variants[i % variants.length];
      // When keepColors: use the first theme for all variants (same look)
      const theme = keepColors ? allThemes[0] : pickThemeForTemplate(allThemes, tmpl, i);
      return {
        slug: generateSlug(business_name),
        business_name,
        business_type,
        phone,
        color_theme: theme.id,
        services: resolvedServices,
        categories: resolvedCategories,
        products: products?.filter((p) => p.name.trim()) || [],
        booking_url,
        address,
        images,
        hours: hours || null,
        imported_hours: hours || null,
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
          ...(description ? { business_description: description } : {}),
        },
        template_variant: tmpl,
        group_id: groupId,
        variant_label: variantLabels[i] || String.fromCharCode(65 + i),
        ...(resolvedHeroVideo ? { hero_video_url: resolvedHeroVideo } : {}),
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
