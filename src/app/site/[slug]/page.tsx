import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import { SiteClient } from "./SiteClient";

async function getSiteData(slug: string): Promise<PreviewData | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
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

export default async function SitePage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getSiteData(params.slug);

  if (!data) {
    notFound();
  }

  return <SiteClient data={data} />;
}
