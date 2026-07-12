"use client";

import { useReducer } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { PreviewData } from "@/lib/ai/types";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import { galleryFallbackPhotos, hasProjectMedia } from "@/lib/home-services/display";
import { resolveHomeServicesProcessSteps, resolveHomeServicesSectionCopies } from "@/lib/home-services/content-defaults";
import {
  buildSmsHref,
  buildTelHref,
  buildWhatsAppHref,
} from "@/lib/home-services/urls";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import type { GoogleReview } from "../TemplateTestimonials";
import { getHomeServicesColors } from "./home-services-theme";
import { HomeServicesFooter } from "./HomeServicesFooter";
import { HomeServicesGallery } from "./HomeServicesGallery";
import { HomeServicesHero } from "./HomeServicesHero";
import { HomeServicesMobileActionBar } from "./HomeServicesMobileActionBar";
import { HomeServicesNav } from "./HomeServicesNav";
import { HomeServicesServices } from "./HomeServicesServices";
import { HomeServicesTrustStrip } from "./HomeServicesTrustStrip";
import { HomeServicesWhyUs } from "./HomeServicesWhyUs";
import { HomeServicesEstimateModal } from "./HomeServicesEstimateModal";
import { HomeServicesProcess } from "./HomeServicesProcess";
import { HomeServicesProofAndAreas } from "./HomeServicesProofAndAreas";
import { HomeServicesFinalCta } from "./HomeServicesFinalCta";
import { estimateModalReducer, initialEstimateModalState, type EstimateDeliveryMode } from "./estimate-modal-state";

interface HomeServicesTemplateProps {
  data: PreviewData;
  locale: HomeServicesLocale;
  isLive?: boolean;
  onLocaleChange?: (locale: HomeServicesLocale) => void;
  estimateDeliveryMode: EstimateDeliveryMode;
}

interface HomeServicesPageProps {
  data: PreviewData;
  locale: HomeServicesLocale;
  onLocaleChange?: (locale: HomeServicesLocale) => void;
  estimateDeliveryMode: EstimateDeliveryMode;
}

function HomeServicesPage({ data, locale, onLocaleChange, estimateDeliveryMode }: HomeServicesPageProps) {
  const [estimateState, dispatchEstimate] = useReducer(estimateModalReducer, initialEstimateModalState);
  const onEstimate = (serviceName?: string) => dispatchEstimate({ type: "open", service: serviceName });
  const config = parseHomeServicesConfig(data.generated_copy?.home_services_config);
  const sectionCopies = resolveHomeServicesSectionCopies(config.section_copy);
  const processSteps = resolveHomeServicesProcessSteps(config.process_steps);
  const copy = data.generated_copy?.[locale];
  const colors = getHomeServicesColors(data);
  const phoneHref = data.phone ? buildTelHref(data.phone) : null;
  const messageHref =
    (config.message_links.whatsapp_e164
      ? buildWhatsAppHref(config.message_links.whatsapp_e164)
      : null) ??
    (config.message_links.sms_e164 ? buildSmsHref(config.message_links.sms_e164) : null);
  const googleReviews = (data.generated_copy as unknown as Record<string, unknown> | undefined)
    ?.google_reviews as GoogleReview[] | undefined;
  const reviews = googleReviews?.length ? googleReviews : [];
  const coverageSummary =
    locale === "es" ? config.coverage_summary_es : config.coverage_summary_en;
  const showTrust = config.sections.show_trust !== false;
  const galleryFallback = galleryFallbackPhotos(config.gallery_projects, data.images);
  const showGallery =
    config.sections.show_gallery !== false &&
    (config.gallery_projects.some(hasProjectMedia) || galleryFallback.length > 0);
  const showWhyUs =
    config.sections.show_why_us !== false &&
    config.why_us_points.some((point) =>
      locale === "es" ? point.title_es.trim() : point.title_en.trim(),
    );
  const showReviews = config.sections.show_reviews !== false && reviews.length > 0;
  const showServiceAreas =
    config.sections.show_service_areas !== false && (config.service_areas.length > 0 || Boolean(coverageSummary.trim()));
  const showProcess = config.sections.show_process !== false;
  const showEstimate = config.sections.show_estimate !== false;

  return (
    <main id="home" className="min-h-screen bg-white pb-20 md:pb-0">
      <HomeServicesNav
        businessName={data.business_name}
        locale={locale}
        showGallery={showGallery}
        showReviews={showReviews}
        onEstimate={onEstimate}
        colors={colors}
        onLocaleChange={onLocaleChange}
      />
      <HomeServicesHero
        businessName={data.business_name}
        headline={copy?.hero_headline ?? ""}
        subheadline={copy?.hero_subheadline ?? ""}
        heroImage={data.images?.[0]}
        phoneHref={phoneHref}
        messageHref={messageHref}
        serviceAreaNames={config.service_areas.map((area) => area.name)}
        onEstimate={onEstimate}
        colors={colors}
      />
      {showTrust && (
        <HomeServicesTrustStrip
          trustPoints={config.trust_points}
          locale={locale}
          colors={colors}
        />
      )}
      <HomeServicesServices
        services={data.services}
        serviceDescriptions={copy?.service_descriptions ?? {}}
        locale={locale}
        colors={colors}
        onEstimate={onEstimate}
        copy={sectionCopies.services}
      />
      {showGallery && (
        <HomeServicesGallery
          projects={config.gallery_projects}
          fallbackImages={galleryFallback}
          locale={locale}
          colors={colors}
          copy={sectionCopies.recent_work}
        />
      )}
      {showProcess && <HomeServicesProcess steps={processSteps} copy={sectionCopies.process} locale={locale} colors={colors} />}
      {showWhyUs && (
        <HomeServicesWhyUs
          points={config.why_us_points}
          locale={locale}
          colors={colors}
        />
      )}
      {(showReviews || showServiceAreas) && <HomeServicesProofAndAreas reviews={showReviews ? reviews : []} areas={showServiceAreas ? config.service_areas : []} rating={data.rating} reviewCount={data.review_count} coverageSummary={showServiceAreas ? coverageSummary : ""} copies={{ reviews: sectionCopies.reviews, serviceAreas: sectionCopies.service_areas }} locale={locale} colors={colors} />}
      {showEstimate && (
        <HomeServicesFinalCta copy={sectionCopies.final_cta} locale={locale} phoneHref={phoneHref} messageHref={messageHref} onEstimate={() => onEstimate()} colors={colors} />
      )}
      <HomeServicesFooter
        businessName={data.business_name}
        phone={data.phone}
        hours={data.hours}
        socialLinks={data.generated_copy?.social_links}
        coverageSummary={coverageSummary}
        colors={colors}
      />
      <HomeServicesMobileActionBar
        phoneHref={phoneHref}
        messageHref={messageHref}
        onEstimate={onEstimate}
        showEstimate={showEstimate}
        colors={colors}
      />
      <HomeServicesEstimateModal state={estimateState} services={data.services} colors={colors} deliveryMode={estimateDeliveryMode} onClose={() => dispatchEstimate({type:"close"})} onComplete={() => dispatchEstimate({type:"complete"})} />
    </main>
  );
}

export function HomeServicesTemplate({
  data,
  locale,
  onLocaleChange,
  estimateDeliveryMode,
}: HomeServicesTemplateProps) {
  const messages = locale === "es" ? esMessages : enMessages;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HomeServicesPage data={data} locale={locale} onLocaleChange={onLocaleChange} estimateDeliveryMode={estimateDeliveryMode} />
    </NextIntlClientProvider>
  );
}
