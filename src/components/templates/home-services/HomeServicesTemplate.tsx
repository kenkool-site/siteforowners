"use client";

import { NextIntlClientProvider } from "next-intl";
import type { PreviewData } from "@/lib/ai/types";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import { parseHomeServicesConfig } from "@/lib/home-services/types";
import {
  buildSmsHref,
  buildTelHref,
  buildWhatsAppHref,
} from "@/lib/home-services/urls";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import { getHomeServicesColors } from "./home-services-theme";
import { HomeServicesHero } from "./HomeServicesHero";
import { HomeServicesNav } from "./HomeServicesNav";

interface HomeServicesTemplateProps {
  data: PreviewData;
  locale: HomeServicesLocale;
  isLive?: boolean;
}

interface HomeServicesPageProps {
  data: PreviewData;
  locale: HomeServicesLocale;
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

  return (
    <main id="home" className="min-h-screen bg-white pb-20 md:pb-0">
      <HomeServicesNav
        businessName={data.business_name}
        locale={locale}
        showGallery={false}
        showReviews={false}
        estimateHref="#estimate"
        colors={colors}
      />
      <HomeServicesHero
        businessName={data.business_name}
        headline={copy?.hero_headline ?? ""}
        subheadline={copy?.hero_subheadline ?? ""}
        heroImage={data.images?.[0]}
        phoneHref={phoneHref}
        messageHref={messageHref}
        estimateHref="#estimate"
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
