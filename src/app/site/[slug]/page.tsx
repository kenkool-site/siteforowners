import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";
import { SiteClient } from "./SiteClient";

type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

interface SiteData {
  preview: PreviewData;
  bookingHours: BookingHoursMap;
  blockedDates: string[];
  tenantId: string | null;
  checkoutMode: "mockup" | "pickup";
  bookingMode: BookingModePolicy;
}

async function getSiteData(slug: string): Promise<SiteData | null> {
  const supabase = createAdminClient();
  const { data: preview, error } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !preview) return null;

  // Find the tenant that owns this preview, if any, then load booking hours + checkout mode.
  let bookingHours: BookingHoursMap = null;
  let blockedDates: string[] = [];
  let tenantId: string | null = null;
  let checkoutMode: "mockup" | "pickup" = "mockup";
  let bookingMode: BookingModePolicy = "in_site_only";

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, checkout_mode, booking_mode")
    .eq("preview_slug", slug)
    .maybeSingle();

  if (tenant?.id) {
    tenantId = tenant.id as string;
    const mode = tenant.checkout_mode as "mockup" | "pickup" | null;
    checkoutMode = mode === "pickup" ? "pickup" : "mockup";
    const rawBookingMode = tenant.booking_mode as string | null;
    if (rawBookingMode === "external_only" || rawBookingMode === "both") {
      bookingMode = rawBookingMode;
    }
    const { data: bs } = await supabase
      .from("booking_settings")
      .select("working_hours, blocked_dates")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    bookingHours = (bs?.working_hours as BookingHoursMap) ?? null;
    blockedDates = (bs?.blocked_dates as string[] | null) ?? [];
  }

  return { preview: preview as PreviewData, bookingHours, blockedDates, tenantId, checkoutMode, bookingMode };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("business_name, generated_copy, images")
    .eq("slug", params.slug)
    .single();

  const name = data?.business_name || "Business";
  const copy = data?.generated_copy as Record<string, unknown> | null;
  const seoTitle = (copy?.en as Record<string, string>)?.seo_title || name;
  const seoDesc =
    (copy?.en as Record<string, string>)?.seo_description ||
    `${name} — Professional services for our community.`;
  const image = data?.images?.[0];

  return {
    title: seoTitle,
    description: seoDesc,
    openGraph: {
      title: seoTitle,
      description: seoDesc,
      ...(image ? { images: [{ url: image }] } : {}),
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
  return (
    <>
      <Script src="/track.js" strategy="afterInteractive" />
      <SiteClient
        data={result.preview}
        bookingHours={result.bookingHours}
        blockedDates={result.blockedDates}
        tenantId={result.tenantId}
        checkoutMode={result.checkoutMode}
        bookingMode={result.bookingMode}
      />
    </>
  );
}
