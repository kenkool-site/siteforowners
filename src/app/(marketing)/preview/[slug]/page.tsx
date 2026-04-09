import { notFound } from "next/navigation";
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
