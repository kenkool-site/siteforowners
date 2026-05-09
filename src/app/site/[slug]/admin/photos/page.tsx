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
  galleryVideoUrl: string | null;
  galleryVideoTitle: string | null;
}> {
  if (!previewSlug) {
    return {
      images: [],
      aboutImageUrl: null,
      galleryVideoUrl: null,
      galleryVideoTitle: null,
    };
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("images, generated_copy, gallery_video_url, gallery_video_title")
    .eq("slug", previewSlug)
    .maybeSingle();
  const images = (data?.images as string[] | null) ?? [];
  const copy = (data?.generated_copy as Record<string, unknown> | null) ?? {};
  const settings = (copy.section_settings as Record<string, unknown> | undefined) ?? {};
  const about = settings.about_image_url;
  const aboutImageUrl =
    typeof about === "string" && about.length > 0 ? about : null;
  const galleryVideoUrl =
    typeof data?.gallery_video_url === "string" && data.gallery_video_url.length > 0
      ? data.gallery_video_url
      : null;
  const galleryVideoTitle =
    typeof data?.gallery_video_title === "string" && data.gallery_video_title.length > 0
      ? data.gallery_video_title
      : null;
  return { images, aboutImageUrl, galleryVideoUrl, galleryVideoTitle };
}

export default async function PhotosPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const { images, aboutImageUrl, galleryVideoUrl, galleryVideoTitle } = await loadPhotos(tenant.preview_slug);
  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <PhotosClient
        initialImages={images}
        initialAboutImageUrl={aboutImageUrl}
        initialGalleryVideoUrl={galleryVideoUrl}
        initialGalleryVideoTitle={galleryVideoTitle}
      />
    </div>
  );
}
