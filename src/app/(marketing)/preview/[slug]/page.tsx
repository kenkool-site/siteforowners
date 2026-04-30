import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import type { BookingModePolicy } from "@/lib/admin-auth";
import { PreviewClient } from "./PreviewClient";

interface PreviewPageData {
  preview: PreviewData;
  bookingMode: BookingModePolicy;
}

async function getPreviewData(slug: string): Promise<PreviewPageData | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;

  // Increment view count
  await supabase
    .from("previews")
    .update({ view_count: (data.view_count || 0) + 1 })
    .eq("slug", slug);

  // Derive booking mode: prefer the linked tenant's value (canonical for
  // active subscribers), fall back to the founder's pending value on the
  // previews row (set via the preview-only editor before activation).
  let bookingMode: BookingModePolicy = "in_site_only";
  const { data: tenant } = await supabase
    .from("tenants")
    .select("booking_mode")
    .eq("preview_slug", slug)
    .maybeSingle();
  const raw =
    (tenant?.booking_mode as string | null | undefined) ??
    (data.booking_mode as string | null | undefined);
  if (raw === "external_only" || raw === "both") {
    bookingMode = raw;
  }

  return { preview: data as PreviewData, bookingMode };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("business_name, images")
    .eq("slug", params.slug)
    .single();

  const name = data?.business_name || "Your Business";
  const title = `${name} — Website Preview | SiteForOwners`;
  const description = `We created this website preview for ${name}. See how your business could look online — fully customized, ready to go live.`;
  const image = data?.images?.[0];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export const revalidate = 0;

export default async function PreviewPage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await getPreviewData(params.slug);

  if (!result) {
    notFound();
  }

  return (
    <PreviewClient data={result.preview} slug={params.slug} bookingMode={result.bookingMode} />
  );
}
