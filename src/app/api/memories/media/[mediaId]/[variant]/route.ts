import { NextRequest, NextResponse } from "next/server";
import { computeGalleryVisible } from "@/lib/invitations/memories/gallery";
import { sharedSignedLink, signedDownloadTtlSeconds } from "@/lib/invitations/memories/media-download-ttl";
import { getMemoryMediaById } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import { adaptivePlaybackLink } from "@/lib/invitations/memories/stream-playback";

// "adaptive" is a video's Cloudflare Stream copy, for phones that play HLS.
// Until that copy exists it sends the phone to the R2 original instead.
const VARIANTS = new Set(["display", "thumbnail", "adaptive"]);

export async function GET(request: NextRequest, { params }: { params: { mediaId: string; variant: string } }) {
  if (!VARIANTS.has(params.variant)) return NextResponse.json({ error: "invalid variant" }, { status: 400 });
  const media = await getMemoryMediaById(params.mediaId);
  if (!media || !computeGalleryVisible(media)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (params.variant === "adaptive") {
    const adaptive = await adaptivePlaybackLink(media).catch((error) => {
      console.error("[memories/media] adaptive playback failed, using the original", { mediaId: media.id, error });
      return null;
    });
    const response = NextResponse.redirect(adaptive?.url ?? new URL(`/api/memories/media/${media.id}/display`, request.url));
    // While Stream is still making the copy, ask again soon.
    const reuseSeconds = adaptive ? adaptive.reuseSeconds : 60;
    response.headers.set("Cache-Control", `public, max-age=${reuseSeconds}, s-maxage=${Math.min(60, reuseSeconds)}`);
    return response;
  }
  const objectKey = params.variant === "display" ? media.objectKeyDisplay : media.objectKeyThumbnail;
  if (!objectKey) return NextResponse.json({ error: "not ready" }, { status: 404 });
  const variant = params.variant === "display" ? "display" : "thumbnail";
  const link = sharedSignedLink(signedDownloadTtlSeconds(media.mediaKind, variant));
  const url = await new R2StorageProvider().getSignedDownloadUrl(objectKey, link.expiresInSeconds, { signingDate: link.signingDate });
  const response = NextResponse.redirect(url);
  // Phones reuse the redirect until the hour ends; the CDN for at most a minute,
  // so a photo the host hides stops being served soon after.
  response.headers.set("Cache-Control", `public, max-age=${link.reuseSeconds}, s-maxage=${Math.min(60, link.reuseSeconds)}`);
  return response;
}
