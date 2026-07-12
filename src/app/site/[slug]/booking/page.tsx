import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("business_name")
    .eq("slug", params.slug)
    .single();

  const { data: tenantMeta } = await supabase
    .from("tenants")
    .select("custom_domain, subdomain")
    .eq("preview_slug", params.slug)
    .maybeSingle();

  const name = data?.business_name || "Business";

  // Canonical points at the tenant homepage — /booking is a utility entry point
  // (Google Business Profile link), not its own indexable page. noindex avoids
  // duplicate-content with the homepage it renders.
  const canonical = tenantUrl(
    APP_URL,
    {
      custom_domain: (tenantMeta?.custom_domain as string | null) ?? null,
      subdomain: (tenantMeta?.subdomain as string | null) ?? null,
      preview_slug: params.slug,
    },
    "/",
  );

  return {
    title: `Book Online — ${name}`,
    description: `Book an appointment with ${name} online.`,
    alternates: { canonical },
    robots: { index: false, follow: true },
  };
}

export const revalidate = 0;

export default async function BookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await getSiteData(params.slug);
  if (!result) notFound();
  if (result.preview.business_type === "home_services") {
    notFound();
  }
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
        autoOpenBooking
      />
    </>
  );
}
