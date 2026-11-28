import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { signedDownloadTtlSeconds } from "@/lib/invitations/memories/media-download-ttl";
import { getMemoryMediaById } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import { adaptivePlaybackLink } from "@/lib/invitations/memories/stream-playback";

export async function GET(request: NextRequest, { params }: { params: { eventId: string; mediaId: string; variant: string } }) {
  if (!await requireInvitationAccess(request, params.eventId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (params.variant !== "display" && params.variant !== "thumbnail" && params.variant !== "adaptive") return NextResponse.json({ error: "invalid variant" }, { status: 400 });
  const media = await getMemoryMediaById(params.mediaId);
  if (!media || media.eventId !== params.eventId || media.uploadStatus !== "uploaded" || media.processingStatus !== "ready") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (params.variant === "adaptive") {
    // A video's Cloudflare Stream copy, same as the guest media route's
    // "adaptive" variant - but host-authorized, so a flagged or removed clip
    // still previews. Until the copy is ready, the R2 original plays instead.
    const adaptive = await adaptivePlaybackLink(media).catch((error) => {
      console.error("[invitations/memories/media] adaptive playback failed, using the original", { mediaId: media.id, error });
      return null;
    });
    return NextResponse.redirect(adaptive?.url ?? new URL(`/api/invitations/events/${params.eventId}/memories/media/${params.mediaId}/display`, request.url));
  }
  const key = params.variant === "display" ? media.objectKeyDisplay : media.objectKeyThumbnail;
  if (!key) return NextResponse.json({ error: "not ready" }, { status: 404 });
  const variant = params.variant === "display" ? "display" : "thumbnail";
  return NextResponse.redirect(await new R2StorageProvider().getSignedDownloadUrl(key, signedDownloadTtlSeconds(media.mediaKind, variant)));
}
