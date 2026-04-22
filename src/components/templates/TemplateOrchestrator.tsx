"use client";

import { useState } from "react";
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

// Navigation
import { SiteNav } from "./SiteNav";
import { AnimationProvider } from "./shared/AnimateSection";

// Shared
import { TemplateProducts } from "./TemplateProducts";
import { TemplateBooking } from "./TemplateBooking";
import { TemplateContact } from "./TemplateContact";
import { TemplateMap } from "./TemplateMap";
import { TemplateFooter } from "./TemplateFooter";
import { TemplateRating } from "./TemplateRating";
import { TemplateTestimonials } from "./TemplateTestimonials";
import type { GoogleReview } from "./TemplateTestimonials";

type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm";

interface TemplateOrchestratorProps {
  data: PreviewData;
  locale?: "en" | "es";
  isLive?: boolean;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
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

export interface SectionSettings {
  show_gallery?: boolean;
  show_about?: boolean;
  show_about_image?: boolean;
  show_services?: boolean;
  show_products?: boolean;
  show_booking?: boolean;
  show_contact?: boolean;
  show_map?: boolean;
  show_testimonials?: boolean;
  show_rating?: boolean;
  show_hours?: boolean;
  disable_animations?: boolean;
  about_image_url?: string | null;
  template_override?: string | null;
}

function getSectionSettings(data: PreviewData): SectionSettings {
  const copy = data.generated_copy as unknown as Record<string, unknown> | null;
  return (copy?.section_settings as SectionSettings) || {};
}

export function TemplateOrchestrator({
  data,
  locale: initialLocale = "en",
  isLive = false,
  bookingHours = null,
}: TemplateOrchestratorProps) {
  const [locale, setLocale] = useState<"en" | "es">(initialLocale);
  const ss = getSectionSettings(data);
  const template = (ss.template_override as TemplateName) || getTemplateName(data);
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
  const heroVideo = data.hero_video_url || undefined;

  const galleryImages = data.images && data.images.length > 1 ? data.images.slice(1) : [];
  const aboutParagraphs = copy?.about_paragraphs ?? [
    `${data.business_name} is dedicated to providing excellent service to our community.`,
    "Visit us today and experience the difference.",
  ];

  // Section visibility (default all visible)
  const showGallery = ss.show_gallery !== false;
  const showAbout = ss.show_about !== false;
  const showAboutImage = ss.show_about_image !== false;
  const showServices = ss.show_services !== false;
  const showProducts = ss.show_products !== false;
  const showBooking = ss.show_booking !== false;
  const showContact = ss.show_contact !== false;
  const showMap = ss.show_map !== false;
  const showTestimonials = ss.show_testimonials !== false;
  const showRating = ss.show_rating !== false;
  const showHours = ss.show_hours !== false;
  const aboutImageOverride = ss.about_image_url || null;
  const animationsEnabled = !ss.disable_animations;

  // Build nav items dynamically based on what sections are visible
  const hasProducts = showProducts && data.products && data.products.length > 0;
  const navItems = [
    { id: "hero", label: "Home" },
    ...(showServices ? [{ id: "services", label: "Services" }] : []),
    ...(hasProducts ? [{ id: "products", label: "Products" }] : []),
    ...(showGallery && galleryImages.length > 0 ? [{ id: "gallery", label: "Gallery" }] : []),
    ...(showAbout ? [{ id: "about", label: "About" }] : []),
    ...(showBooking ? [{ id: "booking", label: "Book Now" }] : []),
    ...(showContact ? [{ id: "contact", label: "Contact" }] : []),
  ];

  // Shared sections — respect visibility settings
  const productsSection = hasProducts ? (
    <div id="products"><TemplateProducts products={data.products!} colors={colors} /></div>
  ) : null;

  const bookingCategories = (data.generated_copy as unknown as Record<string, unknown>)?.booking_categories as
    | { name: string; services: { name: string; price: string; duration: string; id: number }[]; directUrl: string }[]
    | undefined;

  const bookingSection = showBooking ? (
    <TemplateBooking
      phone={data.phone}
      bookingUrl={data.booking_url}
      colors={colors}
      bookingCategories={bookingCategories}
      services={data.services}
      businessName={data.business_name}
      previewSlug={data.slug}
      isLive={isLive}
    />
  ) : null;

  const googleReviews = (data.generated_copy as unknown as Record<string, unknown>)?.google_reviews as GoogleReview[] | undefined;

  const testimonialsSection = showTestimonials && googleReviews && googleReviews.length > 0 ? (
    <TemplateTestimonials reviews={googleReviews} colors={colors} rating={data.rating} reviewCount={data.review_count} />
  ) : null;

  const ratingSection = showRating && !testimonialsSection && data.rating ? (
    <TemplateRating rating={data.rating} reviewCount={data.review_count} colors={colors} />
  ) : null;

  const contactSection = showContact ? <div id="contact"><TemplateContact colors={colors} previewMode /></div> : null;
  const mapSection = showMap ? <TemplateMap address={data.address} colors={colors} /> : null;
  const footerSection = (
    <TemplateFooter
      businessName={data.business_name}
      tagline={copy?.footer_tagline}
      address={data.address}
      phone={data.phone}
      hours={data.hours}
      bookingHours={bookingHours}
      showHours={showHours}
      colors={colors}
    />
  );

  // Template-specific section rendering
  const renderTemplate = () => {
  switch (template) {
    case "bold":
      return (
        <div>
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero"><BoldHero businessName={data.business_name} headline={headline} subheadline={subheadline} heroImage={heroImage} heroVideo={heroVideo} colors={colors} bookingUrl={data.booking_url} phone={data.phone} /></div>
          {showGallery && galleryImages.length > 0 && <div id="gallery"><BoldGallery images={galleryImages} colors={colors} /></div>}
          {showServices && <div id="services"><BoldServices services={services} colors={colors} /></div>}
          {productsSection}
          {showAbout && <div id="about"><BoldAbout paragraphs={aboutParagraphs} colors={colors} /></div>}
          {testimonialsSection || ratingSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "elegant":
      return (
        <div>
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero"><ElegantHero businessName={data.business_name} headline={headline} subheadline={subheadline} logo={logo} colors={colors} bookingUrl={data.booking_url} phone={data.phone} /></div>
          {showAbout && <div id="about"><ElegantAbout paragraphs={aboutParagraphs} colors={colors} /></div>}
          {showServices && <div id="services"><ElegantServices services={services} colors={colors} /></div>}
          {productsSection}
          {showGallery && galleryImages.length > 0 && <div id="gallery"><ElegantGallery images={galleryImages} colors={colors} /></div>}
          {testimonialsSection || ratingSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "vibrant":
      return (
        <div>
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero"><VibrantHero businessName={data.business_name} headline={headline} subheadline={subheadline} logo={logo} colors={colors} bookingUrl={data.booking_url} phone={data.phone} /></div>
          {showServices && <div id="services"><VibrantServices services={services} colors={colors} /></div>}
          <VibrantStats serviceCount={services.length} address={data.address} colors={colors} rating={data.rating} reviewCount={data.review_count} />
          {showGallery && galleryImages.length > 0 && <div id="gallery"><VibrantGallery images={galleryImages} colors={colors} /></div>}
          {productsSection}
          {showAbout && <div id="about"><VibrantAbout paragraphs={aboutParagraphs} colors={colors} /></div>}
          {testimonialsSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );

    case "warm":
      return (
        <div>
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero"><WarmHero businessName={data.business_name} headline={headline} subheadline={subheadline} heroImage={heroImage} heroVideo={heroVideo} logo={logo} colors={colors} bookingUrl={data.booking_url} phone={data.phone} /></div>
          {showAbout && <div id="about"><WarmAbout paragraphs={aboutParagraphs} image={showAboutImage ? (aboutImageOverride || data.images?.[1]) : undefined} colors={colors} /></div>}
          {showGallery && galleryImages.length > 0 && <div id="gallery"><WarmGallery images={galleryImages} colors={colors} /></div>}
          {showServices && <div id="services"><WarmServices services={services} colors={colors} /></div>}
          {productsSection}
          {testimonialsSection || ratingSection}
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
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero"><ClassicHero businessName={data.business_name} headline={headline} subheadline={subheadline} heroImage={heroImage} heroVideo={heroVideo} logo={logo} colors={colors} bookingUrl={data.booking_url} phone={data.phone} /></div>
          {showServices && <div id="services"><ClassicServices services={services} colors={colors} /></div>}
          {showGallery && galleryImages.length > 0 && <div id="gallery"><ClassicGallery images={galleryImages} colors={colors} /></div>}
          {productsSection}
          {showAbout && <div id="about"><ClassicAbout paragraphs={aboutParagraphs} image={showAboutImage ? (aboutImageOverride || data.images?.[1]) : undefined} colors={colors} /></div>}
          {testimonialsSection || ratingSection}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );
  }
  };

  return (
    <AnimationProvider enabled={animationsEnabled}>
      {renderTemplate()}
    </AnimationProvider>
  );
}
