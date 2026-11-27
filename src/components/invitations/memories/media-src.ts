export type MediaImageVariant = "display" | "thumbnail";
export type MediaImageSrc = (id: string, variant: MediaImageVariant) => string;

export function defaultMediaSrc(id: string, variant: MediaImageVariant): string {
  return `/api/memories/media/${id}/${variant}`;
}

export function gridVariant(kind: "photo" | "video"): MediaImageVariant {
  return kind === "video" ? "thumbnail" : "display";
}

// A video's Cloudflare Stream copy (see the media route's "adaptive" variant).
export function adaptiveVideoSrc(id: string): string {
  return `/api/memories/media/${id}/adaptive`;
}
