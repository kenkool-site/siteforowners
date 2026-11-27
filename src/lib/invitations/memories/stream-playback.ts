import { sharedSignedLink, VIDEO_ORIGINAL_SIGNED_URL_SECONDS } from "./media-download-ttl";
import { updateMemoryMediaStream } from "./repository";
import { getStreamConfig, getStreamVideoState, signedPlaybackUrl, signStreamToken } from "./stream";
import type { MemoryMedia } from "./types";

// A signed Stream playback link for a video, or null when it should keep
// playing from its R2 original: Stream isn't set up, the video has no Stream
// copy, or Stream is still making it. While the copy is being made, the first
// request after it finishes records it as ready.
export async function adaptivePlaybackLink(media: MemoryMedia, nowMs: number = Date.now()): Promise<{ url: string; reuseSeconds: number } | null> {
  const config = getStreamConfig();
  if (!config || media.mediaKind !== "video" || !media.streamUid) return null;
  if (media.streamStatus === "failed" || media.streamStatus === "archived") return null;

  let hlsUrl = media.streamStatus === "ready" ? media.streamHlsUrl ?? null : null;
  if (!hlsUrl) {
    const state = await getStreamVideoState(config, media.streamUid).catch(() => null);
    if (!state) return null;
    if (state.failed) {
      await updateMemoryMediaStream(media.id, { streamStatus: "failed" }).catch(() => undefined);
      return null;
    }
    if (!state.ready || !state.hlsUrl) return null;
    hlsUrl = state.hlsUrl;
    await updateMemoryMediaStream(media.id, {
      streamStatus: "ready",
      streamHlsUrl: hlsUrl,
      ...(state.durationSeconds !== null ? { durationSeconds: state.durationSeconds } : {}),
    }).catch((error) => console.error("[memories/stream] failed to record a ready Stream copy", { mediaId: media.id, error }));
  }

  // Same shared hourly link as the R2 original, so phones reuse what they loaded.
  const link = sharedSignedLink(VIDEO_ORIGINAL_SIGNED_URL_SECONDS, nowMs);
  const expiresAtSeconds = link.signingDate.getTime() / 1000 + link.expiresInSeconds;
  const url = signedPlaybackUrl(hlsUrl, media.streamUid, signStreamToken(config, media.streamUid, expiresAtSeconds));
  return url ? { url, reuseSeconds: link.reuseSeconds } : null;
}
