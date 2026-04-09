"use client";

import type { PreviewData, GeneratedCopy } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { TemplateHero } from "./TemplateHero";
import { TemplateServices } from "./TemplateServices";
import { TemplateGallery } from "./TemplateGallery";
import { TemplateAbout } from "./TemplateAbout";
import { TemplateProducts } from "./TemplateProducts";
import { TemplateBooking } from "./TemplateBooking";
import { TemplateContact } from "./TemplateContact";
import { TemplateMap } from "./TemplateMap";
import { TemplateFooter } from "./TemplateFooter";

interface TemplateRendererProps {
  data: PreviewData;
  locale?: "en" | "es";
}

function getColors(data: PreviewData): ThemeColors {
  // Use custom brand colors if available (from Smart Import)
  if (data.custom_colors) {
    return data.custom_colors;
  }
  const themes = THEMES_BY_VERTICAL[data.business_type];
  const theme = themes?.find((t) => t.id === data.color_theme);
  return theme?.colors ?? themes?.[0]?.colors ?? {
    primary: "#B8860B",
    secondary: "#FFFDD0",
    accent: "#DAA520",
    background: "#FFF8F0",
    foreground: "#2D2017",
    muted: "#F5E6D3",
  };
}

function getCopy(data: PreviewData, locale: "en" | "es"): GeneratedCopy["en"] | null {
  if (!data.generated_copy) return null;
  return data.generated_copy[locale];
}

export function TemplateRenderer({ data, locale = "en" }: TemplateRendererProps) {
  const colors = getColors(data);
  const copy = getCopy(data, locale);

  const services = data.services.map((s) => ({
    ...s,
    description: copy?.service_descriptions?.[s.name] ?? s.description,
  }));

  return (
    <div>
      <TemplateHero
        businessName={data.business_name}
        headline={copy?.hero_headline ?? `Welcome to ${data.business_name}`}
        subheadline={copy?.hero_subheadline ?? "Your neighborhood destination for quality service."}
        heroImage={data.images?.[0]}
        logo={data.logo}
        colors={colors}
        bookingUrl={data.booking_url}
        phone={data.phone}
      />

      <TemplateServices
        services={services}
        colors={colors}
      />

      {data.images && data.images.length > 1 && (
        <TemplateGallery
          images={data.images.slice(1)}
          colors={colors}
        />
      )}

      <TemplateAbout
        paragraphs={copy?.about_paragraphs ?? [
          `${data.business_name} is dedicated to providing excellent service to our community.`,
          "Visit us today and experience the difference.",
        ]}
        image={data.images?.[1]}
        colors={colors}
      />

      {data.products && data.products.length > 0 && (
        <TemplateProducts
          products={data.products}
          colors={colors}
        />
      )}

      <TemplateBooking
        phone={data.phone}
        bookingUrl={data.booking_url}
        colors={colors}
      />

      <TemplateContact colors={colors} previewMode />

      <TemplateMap address={data.address} colors={colors} />

      <TemplateFooter
        businessName={data.business_name}
        tagline={copy?.footer_tagline}
        address={data.address}
        phone={data.phone}
        hours={data.hours}
        colors={colors}
      />
    </div>
  );
}
