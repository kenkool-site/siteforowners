import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { PhotosClient } from "./PhotosClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadPhotos(previewSlug: string | null): Promise<{
  images: string[];
  galleryVideoUrl: string | null;
  galleryVideoTitle: string | null;
  mobileGallerySlider: boolean;
}> {
  if (!previewSlug) {
    return {
      images: [],
      galleryVideoUrl: null,
      galleryVideoTitle: null,
      mobileGallerySlider: false,
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
  const settings =
    (copy.section_settings as Record<string, unknown> | undefined) ?? {};
  const mobileGallerySlider = settings.mobile_gallery_slider === true;
  const galleryVideoUrl =
    typeof data?.gallery_video_url === "string" && data.gallery_video_url.length > 0
      ? data.gallery_video_url
      : null;
  const galleryVideoTitle =
    typeof data?.gallery_video_title === "string" && data.gallery_video_title.length > 0
      ? data.gallery_video_title
      : null;
  return { images, galleryVideoUrl, galleryVideoTitle, mobileGallerySlider };
}

export default async function PhotosPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const { images, galleryVideoUrl, galleryVideoTitle, mobileGallerySlider } =
    await loadPhotos(tenant.preview_slug);
  return (
    <div className="px-4 py-5 md:px-8 md:py-8">
      <PhotosClient
        initialImages={images}
        initialGalleryVideoUrl={galleryVideoUrl}
        initialGalleryVideoTitle={galleryVideoTitle}
        initialMobileGallerySlider={mobileGallerySlider}
      />
    </div>
  );
}
