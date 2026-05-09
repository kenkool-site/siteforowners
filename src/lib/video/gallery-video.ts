export const MAX_GALLERY_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_GALLERY_VIDEO_SECONDS = 30;
export const MAX_GALLERY_VIDEO_TITLE_LENGTH = 80;
export const GALLERY_VIDEO_MIME_TYPE = "video/mp4";

export function isAllowedGalleryVideoType(type: string): boolean {
  return type === GALLERY_VIDEO_MIME_TYPE;
}

export function normalizeGalleryVideoTitle(value: string): string {
  return value.trim().slice(0, MAX_GALLERY_VIDEO_TITLE_LENGTH);
}

export function isGalleryVideoUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const url = new URL(value);
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseBase) return false;
    const supabaseOrigin = new URL(supabaseBase).origin;
    return (
      url.protocol === "https:" &&
      url.origin === supabaseOrigin &&
      url.pathname.startsWith("/storage/v1/object/public/preview-images/gallery-videos/") &&
      url.pathname.toLowerCase().endsWith(".mp4")
    );
  } catch {
    return false;
  }
}

export async function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read video duration."));
    };
    video.src = objectUrl;
  });
}
