import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import {
  buildHomeServicesHomepageMetadata,
  hasSpanishHomepageCopy,
} from "@/lib/home-services/homepage-metadata";
import { homepagePath } from "@/lib/home-services/urls";
import { tenantUrl } from "@/lib/tenant-url";
import { buildLocalBusinessJsonLd, serializeJsonLd } from "@/lib/seo-localbusiness";
import { getSiteData } from "../getSiteData";
import { SiteClient } from "../SiteClient";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const result = await getSiteData(params.slug);
  if (!result) return {};

  const { preview, tenantHostFields, isDemo } = result;
  if (preview.business_type !== "home_services") return {};
  if (!hasSpanishHomepageCopy(preview.generated_copy)) {
    return {};
  }

  return buildHomeServicesHomepageMetadata({
    businessName: preview.business_name,
    generatedCopy: preview.generated_copy,
    images: preview.images,
    tenant: tenantHostFields,
    appUrl: APP_URL,
    locale: "es",
    noindex: isDemo,
  });
}

export const revalidate = 0;

export default async function SpanishSitePage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await getSiteData(params.slug);
  if (!result) notFound();

  const { preview } = result;
  if (preview.business_type !== "home_services") notFound();
  if (!hasSpanishHomepageCopy(preview.generated_copy)) {
    notFound();
  }

  const canonicalUrl = tenantUrl(APP_URL, result.tenantHostFields, homepagePath("es"));
  const jsonLd = buildLocalBusinessJsonLd(result, canonicalUrl);
  return (
    <>
      <Script src="/track.js" strategy="afterInteractive" />
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      <SiteClient
        data={preview}
        locale="es"
        bookingHours={result.bookingHours}
        blockedDates={result.blockedDates}
        tenantId={result.tenantId}
        checkoutMode={result.checkoutMode}
        bookingMode={result.bookingMode}
        depositSettings={result.depositSettings}
        isDemo={result.isDemo}
      />
    </>
  );
}
