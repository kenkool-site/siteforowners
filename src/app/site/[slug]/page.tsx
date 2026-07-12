import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantUrl } from "@/lib/tenant-url";
import { buildSharePreviewTitle } from "@/lib/share-preview-title";
import type { GeneratedCopy } from "@/lib/ai/types";
import {
  buildHomeServicesHomepageMetadata,
  hasSpanishHomepageCopy,
} from "@/lib/home-services/homepage-metadata";
import { buildLocalBusinessJsonLd, serializeJsonLd } from "@/lib/seo-localbusiness";
import { getSiteData } from "./getSiteData";
import { SiteClient } from "./SiteClient";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("business_name, business_type, generated_copy, images")
    .eq("slug", params.slug)
    .single();

  const { data: tenantMeta } = await supabase
    .from("tenants")
    .select("is_demo, custom_domain, subdomain")
    .eq("preview_slug", params.slug)
    .maybeSingle();
  const noindex = tenantMeta?.is_demo === true;

  const tenantHostFields = {
    custom_domain: (tenantMeta?.custom_domain as string | null) ?? null,
    subdomain: (tenantMeta?.subdomain as string | null) ?? null,
    preview_slug: params.slug,
  };

  const copy = data?.generated_copy as GeneratedCopy | null | undefined;
  const name = data?.business_name || "Business";

  if (data?.business_type === "home_services") {
    return buildHomeServicesHomepageMetadata({
      businessName: name,
      generatedCopy: copy,
      images: data?.images,
      tenant: tenantHostFields,
      appUrl: APP_URL,
      locale: "en",
      noindex,
      includeHreflang: hasSpanishHomepageCopy(copy),
    });
  }

  const canonical = tenantUrl(APP_URL, tenantHostFields, "/");
  const en = copy?.en;
  const seoTitle =
    en?.seo_title?.trim() ||
    (en?.hero_headline?.trim() ? `${name} — ${en.hero_headline.trim()}` : name);
  const shareTitle = buildSharePreviewTitle(name, {
    seoTitle: en?.seo_title,
    heroHeadline: en?.hero_headline,
  });
  const seoDesc =
    en?.seo_description?.trim() ||
    en?.hero_subheadline?.trim() ||
    `${name} — book online, see services, and get in touch.`;
  const image = data?.images?.[0];
  const imageBlock = image ? { images: [{ url: image, alt: name }] } : {};

  return {
    metadataBase: new URL(canonical),
    applicationName: name,
    title: seoTitle,
    description: seoDesc,
    alternates: { canonical },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: shareTitle,
      description: seoDesc,
      type: "website",
      siteName: name,
      url: canonical,
      ...imageBlock,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: seoDesc,
      ...imageBlock,
    },
  };
}

export const revalidate = 0;

export default async function SitePage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await getSiteData(params.slug);
  if (!result) notFound();
  const jsonLd = buildLocalBusinessJsonLd(result, result.canonicalUrl);
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
        data={result.preview}
        locale="en"
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
