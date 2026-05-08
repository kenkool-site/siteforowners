import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { PhotosClient } from "./PhotosClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadImages(previewSlug: string | null): Promise<string[]> {
  if (!previewSlug) return [];
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("images")
    .eq("slug", previewSlug)
    .maybeSingle();
  return (data?.images as string[] | null) ?? [];
}

export default async function PhotosPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const images = await loadImages(tenant.preview_slug);
  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <PhotosClient initialImages={images} />
    </div>
  );
}
