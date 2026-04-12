import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import { PreviewClient } from "./PreviewClient";

async function getPreviewData(slug: string): Promise<PreviewData | null> {
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

  return data as PreviewData;
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

export default async function PreviewPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getPreviewData(params.slug);

  if (!data) {
    notFound();
  }

  return <PreviewClient data={data} slug={params.slug} />;
}
