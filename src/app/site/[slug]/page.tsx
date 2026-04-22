import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import { SiteClient } from "./SiteClient";

type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

async function getSiteData(
  slug: string
): Promise<{ preview: PreviewData; bookingHours: BookingHoursMap } | null> {
  const supabase = createAdminClient();
  const { data: preview, error } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !preview) return null;

  // Find the tenant that owns this preview, if any, then load booking hours.
  let bookingHours: BookingHoursMap = null;
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("preview_slug", slug)
    .maybeSingle();

  if (tenant?.id) {
    const { data: bs } = await supabase
      .from("booking_settings")
      .select("working_hours")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    bookingHours = (bs?.working_hours as BookingHoursMap) ?? null;
  }

  return { preview: preview as PreviewData, bookingHours };
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
  return <SiteClient data={result.preview} bookingHours={result.bookingHours} />;
}
