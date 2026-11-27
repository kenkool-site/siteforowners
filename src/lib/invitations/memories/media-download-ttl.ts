// How long a guest (or host) media redirect stays valid. Photo derivatives are
// small and re-requested often, so five minutes is enough. A video's display
// object is the original file — pausing past a five-minute signature made
// playback die — so that variant stays valid for an hour. The player also
// asks for a fresh redirect once if the element errors.
export const PHOTO_SIGNED_URL_SECONDS = 5 * 60;
export const VIDEO_ORIGINAL_SIGNED_URL_SECONDS = 60 * 60;

export function signedDownloadTtlSeconds(mediaKind: "photo" | "video", variant: "display" | "thumbnail"): number {
  if (mediaKind === "video" && variant === "display") return VIDEO_ORIGINAL_SIGNED_URL_SECONDS;
  return PHOTO_SIGNED_URL_SECONDS;
}
