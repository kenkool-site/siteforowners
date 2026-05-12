"use client";

import { useState } from "react";
import type { PreviewData, GeneratedCopy } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { lightPaletteFromBrandColors } from "@/lib/templates/brand-palette";
import type { BookingModePolicy } from "@/lib/admin-auth";
import { detectProvider } from "@/lib/admin-bookings";

// Heroes
import { ClassicHero } from "./heroes/ClassicHero";
import { BoldHero } from "./heroes/BoldHero";
import { ElegantHero } from "./heroes/ElegantHero";
import { VibrantHero } from "./heroes/VibrantHero";
import { WarmHero } from "./heroes/WarmHero";
import { RunwayHero } from "./heroes/RunwayHero";
import { GrandHero } from "./heroes/GrandHero";

// Services
import { ClassicServices } from "./services/ClassicServices";
import { BoldServices } from "./services/BoldServices";
import { ElegantServices } from "./services/ElegantServices";
import { VibrantServices } from "./services/VibrantServices";
import { WarmServices } from "./services/WarmServices";
import { RunwayServices } from "./services/RunwayServices";

// Galleries
import { ClassicGallery } from "./galleries/ClassicGallery";
import { BoldGallery } from "./galleries/BoldGallery";
import { ElegantGallery } from "./galleries/ElegantGallery";
import { VibrantGallery } from "./galleries/VibrantGallery";
import { WarmGallery } from "./galleries/WarmGallery";
import { RunwayGallery } from "./galleries/RunwayGallery";

// About
import { ClassicAbout } from "./about/ClassicAbout";
import { BoldAbout } from "./about/BoldAbout";
import { ElegantAbout } from "./about/ElegantAbout";
import { VibrantAbout } from "./about/VibrantAbout";
import { WarmAbout } from "./about/WarmAbout";
import { RunwayAbout } from "./about/RunwayAbout";

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
import { ServiceBookingModal } from "./ServiceBookingModal";
import { RunwayBookingCTA } from "./RunwayBookingCTA";
import { TemplateMotionTextBand } from "./TemplateMotionTextBand";
import { TemplateGalleryVideo } from "./TemplateGalleryVideo";

type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm" | "runway" | "grand";

interface TemplateOrchestratorProps {
  data: PreviewData;
  locale?: "en" | "es";
  isLive?: boolean;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  /** ISO date strings (YYYY-MM-DD) for whole days where the tenant is closed. */
  blockedDates?: string[];
  checkoutMode?: "mockup" | "pickup";
  tenantId?: string | null;
  /** v2: booking entry policy. Defaults to in_site_only. */
  bookingMode?: BookingModePolicy;
  depositSettings?: {
    deposit_required: boolean;
    deposit_mode: "fixed" | "percent" | null;
    deposit_value: number | null;
    deposit_cashapp: string | null;
    deposit_zelle: string | null;
    deposit_other_label: string | null;
    deposit_other_value: string | null;
  };
}

function getTemplateName(data: PreviewData): TemplateName {
  const variant = data.template_variant;
  if (variant && ["classic", "bold", "elegant", "vibrant", "warm", "runway", "grand"].includes(variant)) {
    return variant as TemplateName;
  }
  return "classic";
}

function getColors(data: PreviewData): ThemeColors {
  const copy = data.generated_copy as unknown as Record<string, unknown> | undefined;
  const customColors = copy?.custom_colors as ThemeColors | undefined;
  if (customColors && customColors.primary) {
    return customColors;
  }
  const fromBrand = lightPaletteFromBrandColors(copy?.brand_colors);
  if (fromBrand) {
    return fromBrand;
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
  /** px to clip off the top of the booking modal iframe on desktop (>=640px).
   * Use for Acuity tenants with a tall custom intro above the scheduler.
   * 0 = no clip. */
  booking_iframe_top_clip_px?: number;
  /** px to clip off the top of the booking modal iframe on mobile (<640px).
   * Acuity's mobile layout usually has a shorter intro, so this is typically
   * smaller than the desktop value. 0 = no clip. */
  booking_iframe_top_clip_px_mobile?: number;
  /** When true, service category groups start collapsed until the visitor expands them. */
  services_categories_collapsed_default?: boolean;
}

function getSectionSettings(data: PreviewData): SectionSettings {
  const copy = data.generated_copy as unknown as Record<string, unknown> | null;
  return (copy?.section_settings as SectionSettings) || {};
}

// Build a fully-resolved Acuity deep-link URL for a given category/service.
// Acuity schedulers come in two URL shapes and only respect deep linking in
// their own shape:
//
//   Path-based (newer):  https://app.acuityscheduling.com/schedule/<slug>
//     → deep link: .../schedule/<slug>/category/<name>[/appointment/<id>]
//     `<name>` is double-URL-encoded because Acuity's router decodes the path
//     once and its handler decodes again before matching the category.
//
//   Query-based (short forms like <name>.as.me):
//     → deep link: <bookingUrl>?appointmentType=<id | category:RawName>
//
// Falls back to `savedBookingUrl` unchanged when neither shape applies or when
// there's no target (category+service both missing).
function buildAcuityDeepLink(
  savedBookingUrl: string,
  rawCategoryName: string | null,
  serviceId: number | null,
): string {
  if (!rawCategoryName && serviceId == null) return savedBookingUrl;
  try {
    const u = new URL(savedBookingUrl);
    const pathMatch = u.pathname.match(/^\/schedule\/([^/]+)\/?$/i);
    if (pathMatch) {
      const slug = pathMatch[1];
      let path = `/schedule/${slug}`;
      if (rawCategoryName) {
        path += `/category/${encodeURIComponent(encodeURIComponent(rawCategoryName))}`;
      }
      if (serviceId != null) path += `/appointment/${serviceId}`;
      return `${u.protocol}//${u.host}${path}`;
    }
    const param = serviceId != null ? String(serviceId) : `category:${rawCategoryName}`;
    u.searchParams.set("appointmentType", param);
    return u.toString();
  } catch {
    return savedBookingUrl;
  }
}

export function TemplateOrchestrator({
  data,
  locale: initialLocale = "en",
  isLive = false,
  bookingHours = null,
  blockedDates = [],
  checkoutMode = "mockup",
  tenantId = null,
  bookingMode = "in_site_only",
  depositSettings,
}: TemplateOrchestratorProps) {
  const [locale, setLocale] = useState<"en" | "es">(initialLocale);
  const ss = getSectionSettings(data);
  const defaultCategoriesCollapsed = ss.services_categories_collapsed_default === true;
  const template = (ss.template_override as TemplateName) || getTemplateName(data);
  const colors = getColors(data);
  const logo = getLogo(data);
  const copy = getCopy(data, locale);

  const rawBookingCategories = (data.generated_copy as unknown as Record<string, unknown>)?.booking_categories as
    | { name: string; services: { name: string; price: string; duration: string; id: number; image?: string }[]; directUrl: string }[]
    | undefined;

  // Build, in one pass:
  //   - serviceDeepLinkUrls: normalized name → fully-resolved deep-link URL
  //     (used by the Services section's flat list)
  //   - bookingCategories: same shape as raw, but each service is augmented
  //     with its own deepLinkUrl (used by the Booking section's per-service
  //     "Book" buttons to open the in-site modal instead of a new tab)
  const normalizeServiceName = (n: string) =>
    n
      .toLowerCase()
      .replace(/^\d+\.\s*/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const serviceDeepLinkUrls = new Map<string, string>();
  const bookingCategories = rawBookingCategories?.map((cat) => {
    if (!cat.directUrl.includes("acuityscheduling.com") || !data.booking_url) {
      return cat;
    }
    // cat.name has the "1." prefix stripped; Acuity needs the raw name
    // (including the prefix) in the URL. Recover it from the directUrl's
    // encoded appointmentType=category:<RawName> param.
    let rawCatName: string | null = null;
    try {
      const p = new URL(cat.directUrl).searchParams.get("appointmentType");
      if (p && p.startsWith("category:")) rawCatName = p.slice("category:".length);
    } catch {}
    if (rawCatName) {
      serviceDeepLinkUrls.set(
        normalizeServiceName(cat.name),
        buildAcuityDeepLink(data.booking_url, rawCatName, null),
      );
    }
    const augmentedServices = cat.services.map((svc) => {
      const deepLinkUrl = buildAcuityDeepLink(data.booking_url!, rawCatName, svc.id);
      serviceDeepLinkUrls.set(normalizeServiceName(svc.name), deepLinkUrl);
      return { ...svc, deepLinkUrl };
    });
    return { ...cat, services: augmentedServices };
  });

  const services = data.services.map((s) => ({
    ...s,
    description: copy?.service_descriptions?.[s.name] ?? s.description,
    bookingDeepLink: serviceDeepLinkUrls.get(normalizeServiceName(s.name)),
    // Map snake_case from DB JSONB to camelCase for the UI components.
    durationMinutes: s.duration_minutes,
    addOns: s.add_ons,
    image: s.image,
  }));
  const products = (data.products ?? []).map((p) => ({
    ...p,
    description: copy?.product_descriptions?.[p.name] ?? p.description,
  }));

  const categories = (data.categories ?? []) as string[];
  const bookingPolicies = (data.booking_policies ?? "") as string;

  // Modal state — holds the fully-resolved deep-link URL to load in the iframe.
  // Used only by external_only mode with Acuity-style deep links.
  const [selectedBookingDeepLink, setSelectedBookingDeepLink] = useState<string | null>(null);
  const canOpenBookingModal =
    !!data.booking_url && serviceDeepLinkUrls.size > 0;

  // onSelectService is only consumed by TemplateBooking's bookingCategories
  // block (the legacy Acuity-deep-linked services list under external_only
  // mode). The 5 service templates handle their own click behavior — they
  // open new tabs in external_only mode, and call openBookingCalendarForService
  // (which dispatches a custom DOM event with the service name) in
  // in_site_only / both modes so the in-site calendar opens preselected.
  const onSelectService = canOpenBookingModal
    ? (url: string) => setSelectedBookingDeepLink(url)
    : undefined;

  const headline = copy?.hero_headline ?? `Welcome to ${data.business_name}`;
  const subheadline = copy?.hero_subheadline ?? "Your neighborhood destination for quality service.";
  const heroImage = data.images?.[0];
  const heroVideo = data.hero_video_url || undefined;
  const galleryVideoUrl = data.gallery_video_url || undefined;
  const galleryVideoTitle = data.gallery_video_title || undefined;

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
  const hasGalleryImages = galleryImages.length > 0;
  const hasGallerySection = showGallery && (hasGalleryImages || !!galleryVideoUrl);
  const galleryVideoSection = hasGallerySection && galleryVideoUrl ? (
    <TemplateGalleryVideo
      src={galleryVideoUrl}
      galleryVideoTitle={galleryVideoTitle}
      colors={colors}
      template={template}
    />
  ) : null;

  // Build nav items dynamically based on what sections are visible
  const hasProducts = showProducts && products.length > 0;
  const navItems = [
    { id: "hero", label: "Home" },
    ...(showServices ? [{ id: "services", label: "Services" }] : []),
    ...(hasProducts ? [{ id: "products", label: "Products" }] : []),
    ...(hasGallerySection ? [{ id: "gallery", label: "Gallery" }] : []),
    ...(showAbout ? [{ id: "about", label: "About" }] : []),
    ...(showBooking ? [{ id: "booking", label: "Book Now" }] : []),
    ...(showContact ? [{ id: "contact", label: "Contact" }] : []),
  ];

  // Shared sections — respect visibility settings
  const productsSection = hasProducts ? (
    <div id="products">
      <TemplateProducts
        products={products}
        colors={colors}
        checkoutMode={checkoutMode}
        tenantId={tenantId}
        businessPhone={data.phone || undefined}
        businessAddress={data.address || undefined}
      />
    </div>
  ) : null;

  // Build the discriminated booking-mode object that TemplateBooking
  // expects. The simple `bookingMode` string is the policy; we attach
  // the URL + provider name only when the policy needs them. If the
  // policy says external/both but no URL is configured, degrade to
  // in_site_only (mirrors getBookingMode's defensive fallback).
  const tbBookingUrl = data.booking_url?.trim() || "";
  const bookingModeProp =
    bookingMode === "in_site_only" || !tbBookingUrl
      ? ({ mode: "in_site_only" } as const)
      : bookingMode === "external_only"
      ? ({ mode: "external_only", url: tbBookingUrl, providerName: detectProvider(tbBookingUrl) } as const)
      : ({ mode: "both", url: tbBookingUrl, providerName: detectProvider(tbBookingUrl) } as const);

  const bookingSection = showBooking ? (
    <TemplateBooking
      phone={data.phone}
      bookingUrl={data.booking_url}
      colors={colors}
      bookingCategories={bookingCategories}
      services={services}
      businessName={data.business_name}
      previewSlug={data.slug}
      isLive={isLive}
      onSelectService={onSelectService}
      bookingMode={bookingModeProp}
      workingHours={bookingHours}
      blockedDates={blockedDates}
      bookingPolicies={bookingPolicies}
      depositSettings={depositSettings}
    />
  ) : null;

  const googleReviews = (data.generated_copy as unknown as Record<string, unknown>)?.google_reviews as GoogleReview[] | undefined;

  const testimonialsSection = showTestimonials && googleReviews && googleReviews.length > 0 ? (
    <TemplateTestimonials reviews={googleReviews} colors={colors} rating={data.rating} reviewCount={data.review_count} />
  ) : null;

  const ratingSection = showRating && !testimonialsSection && data.rating ? (
    <TemplateRating rating={data.rating} reviewCount={data.review_count} colors={colors} />
  ) : null;

  // previewMode short-circuits the form submit (just shows "Thank you" inline).
  // Live tenant sites need !previewMode so the form POSTs to /api/contact and
  // the lead lands in contact_leads for the owner's /admin/leads page.
  const contactSection = showContact ? <div id="contact"><TemplateContact colors={colors} previewMode={!isLive} /></div> : null;
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
  const getRunwayMarqueeLabel = (value: string) => {
    const short = value
      .replace(/\([^)]*\)/g, "")
      .split(/[\/,&-]/)[0]
      .replace(/\s+/g, " ")
      .trim();
    return short.length > 22 ? `${short.slice(0, 22).trim()}...` : short;
  };
  const runwayMarqueeItems = Array.from(new Set([
    "Book Your Look",
    ...categories.slice(0, 3).map(getRunwayMarqueeLabel),
    ...services.slice(0, 4).map((service) => getRunwayMarqueeLabel(service.name)),
    "Fresh Finish",
    data.business_type === "barbershop" ? "Sharp Lines" : "Camera-Ready Finish",
  ].filter(Boolean))).slice(0, 8);
  const motionTextItems = Array.from(new Set([
    "Book Today",
    ...categories.slice(0, 3),
    ...services.slice(0, 4).map((service) => service.name),
    data.business_type === "nails" ? "Fresh Sets" : "Fresh Looks",
    "Easy Booking",
  ].filter(Boolean))).slice(0, 8);

  // Template-specific section rendering
  const renderTemplate = () => {
  switch (template) {
    case "runway":
    case "grand": {
      const Hero = template === "grand" ? GrandHero : RunwayHero;
      return (
        <div className="bg-black">
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero">
            <Hero
              businessName={data.business_name}
              headline={headline}
              subheadline={subheadline}
              heroImage={heroImage}
              heroVideo={heroVideo}
              colors={colors}
              rating={data.rating}
              reviewCount={data.review_count}
              hasBooking={!!bookingSection}
              hasGallery={hasGallerySection}
            />
          </div>
          {showServices && <div id="services"><RunwayServices services={services} categories={categories} colors={colors} bookingMode={bookingMode} defaultCategoriesCollapsed={defaultCategoriesCollapsed} /></div>}
          <div className="overflow-hidden border-y border-[#D8B255]/30 bg-black py-4 text-[#D8B255]">
            <style>{`
              @keyframes runway-marquee {
                from { transform: translateX(0); }
                to { transform: translateX(-50%); }
              }
            `}</style>
            <div
              className="flex w-max items-center gap-8 whitespace-nowrap text-xs font-black uppercase tracking-[0.36em]"
              style={animationsEnabled ? { animation: "runway-marquee 24s linear infinite" } : undefined}
              aria-hidden="true"
            >
              {[...runwayMarqueeItems, ...runwayMarqueeItems].map((item, index) => (
                <span key={`${item}-${index}`} className="flex items-center gap-8">
                  <span>{item}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D8B255]" />
                </span>
              ))}
            </div>
          </div>
          {galleryVideoSection && !hasGalleryImages ? <div id="gallery">{galleryVideoSection}</div> : galleryVideoSection}
          {showGallery && hasGalleryImages && <RunwayGallery images={galleryImages} colors={colors} />}
          {showAbout && <div id="about"><RunwayAbout paragraphs={aboutParagraphs} image={showAboutImage ? (aboutImageOverride || data.images?.[1]) : undefined} colors={colors} /></div>}
          {productsSection}
          {testimonialsSection || ratingSection}
          {bookingSection && <RunwayBookingCTA />}
          {bookingSection}
          {contactSection}
          {mapSection}
          {footerSection}
        </div>
      );
    }

    case "bold":
      return (
        <div>
          <SiteNav items={navItems} colors={colors} locale={locale} onLocaleChange={setLocale} />
          <div id="hero"><BoldHero businessName={data.business_name} headline={headline} subheadline={subheadline} heroImage={heroImage} heroVideo={heroVideo} colors={colors} bookingUrl={data.booking_url} phone={data.phone} /></div>
          <TemplateMotionTextBand items={motionTextItems} colors={colors} template="bold" enabled={animationsEnabled} />
          {galleryVideoSection && !hasGalleryImages ? <div id="gallery">{galleryVideoSection}</div> : galleryVideoSection}
          {showGallery && hasGalleryImages && <div id="gallery"><BoldGallery images={galleryImages} colors={colors} /></div>}
          {showServices && <div id="services"><BoldServices services={services} categories={categories} colors={colors} bookingMode={bookingMode} defaultCategoriesCollapsed={defaultCategoriesCollapsed} /></div>}
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
          <TemplateMotionTextBand items={motionTextItems} colors={colors} template="elegant" enabled={animationsEnabled} />
          {showAbout && <div id="about"><ElegantAbout paragraphs={aboutParagraphs} colors={colors} /></div>}
          {showServices && <div id="services"><ElegantServices services={services} categories={categories} colors={colors} bookingMode={bookingMode} defaultCategoriesCollapsed={defaultCategoriesCollapsed} /></div>}
          {productsSection}
          {galleryVideoSection && !hasGalleryImages ? <div id="gallery">{galleryVideoSection}</div> : galleryVideoSection}
          {showGallery && hasGalleryImages && <div id="gallery"><ElegantGallery images={galleryImages} colors={colors} /></div>}
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
          <TemplateMotionTextBand items={motionTextItems} colors={colors} template="vibrant" enabled={animationsEnabled} />
          {showServices && <div id="services"><VibrantServices services={services} categories={categories} colors={colors} bookingMode={bookingMode} defaultCategoriesCollapsed={defaultCategoriesCollapsed} /></div>}
          <VibrantStats serviceCount={services.length} address={data.address} colors={colors} rating={data.rating} reviewCount={data.review_count} />
          {galleryVideoSection && !hasGalleryImages ? <div id="gallery">{galleryVideoSection}</div> : galleryVideoSection}
          {showGallery && hasGalleryImages && <div id="gallery"><VibrantGallery images={galleryImages} colors={colors} /></div>}
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
          <TemplateMotionTextBand items={motionTextItems} colors={colors} template="warm" enabled={animationsEnabled} />
          {showAbout && <div id="about"><WarmAbout paragraphs={aboutParagraphs} image={showAboutImage ? (aboutImageOverride || data.images?.[1]) : undefined} colors={colors} /></div>}
          {galleryVideoSection && !hasGalleryImages ? <div id="gallery">{galleryVideoSection}</div> : galleryVideoSection}
          {showGallery && hasGalleryImages && <div id="gallery"><WarmGallery images={galleryImages} colors={colors} /></div>}
          {showServices && <div id="services"><WarmServices services={services} categories={categories} colors={colors} bookingMode={bookingMode} defaultCategoriesCollapsed={defaultCategoriesCollapsed} /></div>}
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
          <TemplateMotionTextBand items={motionTextItems} colors={colors} template="classic" enabled={animationsEnabled} />
          {showServices && <div id="services"><ClassicServices services={services} categories={categories} colors={colors} bookingMode={bookingMode} defaultCategoriesCollapsed={defaultCategoriesCollapsed} /></div>}
          {galleryVideoSection && !hasGalleryImages ? <div id="gallery">{galleryVideoSection}</div> : galleryVideoSection}
          {showGallery && hasGalleryImages && <div id="gallery"><ClassicGallery images={galleryImages} colors={colors} /></div>}
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
      {canOpenBookingModal && (
        <ServiceBookingModal
          open={selectedBookingDeepLink !== null}
          onClose={() => setSelectedBookingDeepLink(null)}
          bookingUrl={selectedBookingDeepLink ?? data.booking_url!}
          businessName={data.business_name}
          colors={colors}
          introText={copy?.booking_intro || data.generated_copy?.en?.booking_intro}
          topClipPx={ss.booking_iframe_top_clip_px ?? 0}
          topClipPxMobile={ss.booking_iframe_top_clip_px_mobile ?? 0}
        />
      )}
    </AnimationProvider>
  );
}
