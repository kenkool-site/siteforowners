"use client";

import type { PreviewData, GeneratedCopy } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";

// Heroes
import { ClassicHero } from "./heroes/ClassicHero";
import { BoldHero } from "./heroes/BoldHero";
import { ElegantHero } from "./heroes/ElegantHero";
import { VibrantHero } from "./heroes/VibrantHero";
import { WarmHero } from "./heroes/WarmHero";

// Services
import { ClassicServices } from "./services/ClassicServices";
import { BoldServices } from "./services/BoldServices";
import { ElegantServices } from "./services/ElegantServices";
import { VibrantServices } from "./services/VibrantServices";
import { WarmServices } from "./services/WarmServices";

// Galleries
import { ClassicGallery } from "./galleries/ClassicGallery";
import { BoldGallery } from "./galleries/BoldGallery";
import { ElegantGallery } from "./galleries/ElegantGallery";
import { VibrantGallery } from "./galleries/VibrantGallery";
import { WarmGallery } from "./galleries/WarmGallery";

// About
import { ClassicAbout } from "./about/ClassicAbout";
import { BoldAbout } from "./about/BoldAbout";
import { ElegantAbout } from "./about/ElegantAbout";
import { VibrantAbout } from "./about/VibrantAbout";
import { WarmAbout } from "./about/WarmAbout";

// Stats (Vibrant only)
import { VibrantStats } from "./stats/VibrantStats";

// Shared
import { TemplateProducts } from "./TemplateProducts";
import { TemplateBooking } from "./TemplateBooking";
import { TemplateContact } from "./TemplateContact";
import { TemplateMap } from "./TemplateMap";
import { TemplateFooter } from "./TemplateFooter";

type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm";

interface TemplateOrchestratorProps {
  data: PreviewData;
  locale?: "en" | "es";
}

function getTemplateName(data: PreviewData): TemplateName {
  const variant = data.template_variant;
  if (variant && ["classic", "bold", "elegant", "vibrant", "warm"].includes(variant)) {
    return variant as TemplateName;
  }
  return "classic";
}

function getColors(data: PreviewData): ThemeColors {
  const customColors = (data.generated_copy as unknown as Record<string, unknown>)?.custom_colors as ThemeColors | undefined;
  if (customColors && customColors.primary) {
    return customColors;
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

function getLogo(data: PreviewData): string | undefined {
  return (data.generated_copy as unknown as Record<string, unknown>)?.logo as string | undefined;
}

function getCopy(data: PreviewData, locale: "en" | "es"): GeneratedCopy["en"] | null {
  if (!data.generated_copy) return null;
  return data.generated_copy[locale];
}

export function TemplateOrchestrator({ data, locale = "en" }: TemplateOrchestratorProps) {
  const template = getTemplateName(data);
  const colors = getColors(data);
  const logo = getLogo(data);
  const copy = getCopy(data, locale);

  const services = data.services.map((s) => ({
    ...s,
    description: copy?.service_descriptions?.[s.name] ?? s.description,
  }));

  const headline = copy?.hero_headline ?? `Welcome to ${data.business_name}`;
  const subheadline = copy?.hero_subheadline ?? "Your neighborhood destination for quality service.";
  const heroImage = data.images?.[0];

  const galleryImages = data.images && data.images.length > 1 ? data.images.slice(1) : [];
  const aboutParagraphs = copy?.about_paragraphs ?? [
    `${data.business_name} is dedicated to providing excellent service to our community.`,
    "Visit us today and experience the difference.",
  ];

  // Shared sections rendered in all templates
  const productsSection = data.products && data.products.length > 0 ? (
    <TemplateProducts products={data.products} colors={colors} />
  ) : null;

  const bookingSection = (
    <TemplateBooking phone={data.phone} bookingUrl={data.booking_url} colors={colors} />
  );

  const contactSection = <TemplateContact colors={colors} previewMode />;
  const mapSection = <TemplateMap address={data.address} colors={colors} />;
  const footerSection = (
    <TemplateFooter
      businessName={data.business_name}
      tagline={copy?.footer_tagline}
      address={data.address}
      phone={data.phone}
      hours={data.hours}
      colors={colors}
    />
  );

  // Template-specific section rendering
  switch (template) {
    case "bold":
      return (
        <div>
          <BoldHero
            businessName={data.business_name}
            headline={headline}
            subheadline={subheadline}
            heroImage={heroImage}
            colors={colors}
            bookingUrl={data.booking_url}
            phone={data.phone}
          />
          {galleryImages.length > 0 && <BoldGallery images={galleryImages} colors={colors} />}
          <BoldServices services={services} colors={colors} />
          <BoldAbout paragraphs={aboutParagraphs} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "elegant":
      return (
        <div>
          <ElegantHero
            businessName={data.business_name}
            headline={headline}
            subheadline={subheadline}
            logo={logo}
            colors={colors}
            bookingUrl={data.booking_url}
            phone={data.phone}
          />
          <ElegantAbout paragraphs={aboutParagraphs} colors={colors} />
          <ElegantServices services={services} colors={colors} />
          {galleryImages.length > 0 && <ElegantGallery images={galleryImages} colors={colors} />}
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "vibrant":
      return (
        <div>
          <VibrantHero
            businessName={data.business_name}
            headline={headline}
            subheadline={subheadline}
            logo={logo}
            colors={colors}
            bookingUrl={data.booking_url}
            phone={data.phone}
          />
          <VibrantServices services={services} colors={colors} />
          <VibrantStats serviceCount={services.length} address={data.address} colors={colors} />
          {galleryImages.length > 0 && <VibrantGallery images={galleryImages} colors={colors} />}
          <VibrantAbout paragraphs={aboutParagraphs} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "warm":
      return (
        <div>
          <WarmHero
            businessName={data.business_name}
            headline={headline}
            subheadline={subheadline}
            heroImage={heroImage}
            logo={logo}
            colors={colors}
            bookingUrl={data.booking_url}
            phone={data.phone}
          />
          <WarmAbout paragraphs={aboutParagraphs} image={data.images?.[1]} colors={colors} />
          {galleryImages.length > 0 && <WarmGallery images={galleryImages} colors={colors} />}
          <WarmServices services={services} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "classic":
    default:
      return (
        <div>
          <ClassicHero
            businessName={data.business_name}
            headline={headline}
            subheadline={subheadline}
            heroImage={heroImage}
            logo={logo}
            colors={colors}
            bookingUrl={data.booking_url}
            phone={data.phone}
          />
          <ClassicServices services={services} colors={colors} />
          {galleryImages.length > 0 && <ClassicGallery images={galleryImages} colors={colors} />}
          <ClassicAbout paragraphs={aboutParagraphs} image={data.images?.[1]} colors={colors} />
          {productsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );
  }
}
