import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { PhotosClient } from "./PhotosClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadPhotos(previewSlug: string | null): Promise<{
  images: string[];
  aboutImageUrl: string | null;
}> {
  if (!previewSlug) return { images: [], aboutImageUrl: null };
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("images, generated_copy")
    .eq("slug", previewSlug)
    .maybeSingle();
  const images = (data?.images as string[] | null) ?? [];
  const copy = (data?.generated_copy as Record<string, unknown> | null) ?? {};
  const settings = (copy.section_settings as Record<string, unknown> | undefined) ?? {};
  const about = settings.about_image_url;
  const aboutImageUrl =
    typeof about === "string" && about.length > 0 ? about : null;
  return { images, aboutImageUrl };
}

export default async function PhotosPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const { images, aboutImageUrl } = await loadPhotos(tenant.preview_slug);
  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <PhotosClient
        initialImages={images}
        initialAboutImageUrl={aboutImageUrl}
      />
    </div>
  );
}
