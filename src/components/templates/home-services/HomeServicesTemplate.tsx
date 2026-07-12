"use client";

import { useTranslations } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import type { PreviewData } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import { hasProjectMedia } from "@/lib/home-services/display";
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
import { HomeServicesReviews } from "./HomeServicesReviews";
import { HomeServicesServiceAreas } from "./HomeServicesServiceAreas";
import { HomeServicesServices } from "./HomeServicesServices";
import { HomeServicesTrustStrip } from "./HomeServicesTrustStrip";
import { HomeServicesWhyUs } from "./HomeServicesWhyUs";
import { HomeServicesEstimateForm } from "./HomeServicesEstimateForm";
import { ensureReadable } from "@/lib/templates/contrast";

interface HomeServicesTemplateProps {
  data: PreviewData;
  locale: HomeServicesLocale;
  isLive?: boolean;
}

interface HomeServicesPageProps {
  data: PreviewData;
  locale: HomeServicesLocale;
}

interface DirectEstimateCardProps {
  phoneHref: string | null;
  messageHref: string | null;
  colors: ThemeColors;
}

function DirectEstimateCard({ phoneHref, messageHref, colors }: DirectEstimateCardProps) {
  const t = useTranslations("homeServices");
  const headingColor = ensureReadable(colors.muted, colors.primary);
  const textColor = ensureReadable(colors.muted, colors.foreground);
  const estimateTextColor = ensureReadable(colors.background, colors.secondary, 3);
  const outlineTextColor = ensureReadable(colors.primary, colors.background, 3);

  return (
    <div
      className="mx-auto max-w-3xl rounded-[2rem] border p-6 text-center sm:p-8"
      style={{
        backgroundColor: colors.background,
        borderColor: `${colors.foreground}12`,
      }}
    >
      <h2
        id="estimate-heading"
        className="text-2xl font-bold tracking-tight sm:text-3xl"
        style={{ color: headingColor }}
      >
        {t("estimate.directTitle")}
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed" style={{ color: textColor, opacity: 0.9 }}>
        {t("estimate.directBody")}
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
        {phoneHref && (
          <a
            href={phoneHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: colors.secondary, color: estimateTextColor }}
          >
            {t("estimate.directCall")}
          </a>
        )}
        {messageHref && (
          <a
            href={messageHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full border px-6 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              borderColor: `${colors.primary}35`,
              color: outlineTextColor,
              backgroundColor: colors.background,
            }}
          >
            {t("estimate.directMessage")}
          </a>
        )}
      </div>
    </div>
  );
}

function HomeServicesPage({ data, locale }: HomeServicesPageProps) {
  const config = parseHomeServicesConfig(data.generated_copy?.home_services_config);
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
  const showGallery =
    config.sections.show_gallery !== false &&
    config.gallery_projects.some(hasProjectMedia);
  const showWhyUs =
    config.sections.show_why_us !== false &&
    config.why_us_points.some((point) =>
      locale === "es" ? point.title_es.trim() : point.title_en.trim(),
    );
  const showReviews = config.sections.show_reviews !== false && reviews.length > 0;
  const showServiceAreas =
    config.sections.show_service_areas !== false && Boolean(coverageSummary.trim());
  const showEstimate = config.sections.show_estimate !== false;
  const estimateEnabled = Boolean(config.notification?.destination_e164);
  const estimateHref = "#estimate";

  return (
    <main id="home" className="min-h-screen bg-white pb-20 md:pb-0">
      <HomeServicesNav
        businessName={data.business_name}
        locale={locale}
        showGallery={showGallery}
        showReviews={showReviews}
        estimateHref={estimateHref}
        colors={colors}
      />
      <HomeServicesHero
        businessName={data.business_name}
        headline={copy?.hero_headline ?? ""}
        subheadline={copy?.hero_subheadline ?? ""}
        heroImage={data.images?.[0]}
        phoneHref={phoneHref}
        messageHref={messageHref}
        estimateHref={estimateHref}
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
      />
      {showGallery && (
        <HomeServicesGallery
          projects={config.gallery_projects}
          locale={locale}
          colors={colors}
        />
      )}
      {showWhyUs && (
        <HomeServicesWhyUs
          points={config.why_us_points}
          locale={locale}
          colors={colors}
        />
      )}
      {showReviews && (
        <HomeServicesReviews
          reviews={reviews}
          rating={data.rating}
          reviewCount={data.review_count}
          colors={colors}
        />
      )}
      {showServiceAreas && (
        <HomeServicesServiceAreas
          coverageSummary={coverageSummary}
          locale={locale}
          colors={colors}
        />
      )}
      {showEstimate && (
        <section
          id="estimate"
          className="px-4 py-16 sm:px-6"
          style={{ backgroundColor: colors.muted }}
          aria-labelledby="estimate-heading"
        >
          {estimateEnabled ? (
            <HomeServicesEstimateForm
              services={data.services}
              phoneHref={phoneHref}
              messageHref={messageHref}
              colors={colors}
            />
          ) : (
            <DirectEstimateCard
              phoneHref={phoneHref}
              messageHref={messageHref}
              colors={colors}
            />
          )}
        </section>
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
        estimateHref={estimateHref}
        showEstimate={showEstimate}
        colors={colors}
      />
    </main>
  );
}

export function HomeServicesTemplate({
  data,
  locale,
}: HomeServicesTemplateProps) {
  const messages = locale === "es" ? esMessages : enMessages;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HomeServicesPage data={data} locale={locale} />
    </NextIntlClientProvider>
  );
}
