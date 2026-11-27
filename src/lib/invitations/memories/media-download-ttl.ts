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

// Guests' phones can only reuse a downloaded photo or video if they are handed
// the same link again. So every request in the same hour gets one link, signed
// as of the hour's start, and it stays valid for the ttl above on top of that
// hour, so whenever it is handed out it still has at least the ttl left.
export const SHARED_LINK_WINDOW_SECONDS = 60 * 60;

export function sharedSignedLink(ttlSeconds: number, nowMs: number = Date.now()) {
  const windowMs = SHARED_LINK_WINDOW_SECONDS * 1000;
  const startMs = Math.floor(nowMs / windowMs) * windowMs;
  return {
    signingDate: new Date(startMs),
    expiresInSeconds: SHARED_LINK_WINDOW_SECONDS + ttlSeconds,
    // The redirect to that link can be reused until the hour ends.
    reuseSeconds: Math.max(1, Math.floor((startMs + windowMs - nowMs) / 1000)),
  };
}
