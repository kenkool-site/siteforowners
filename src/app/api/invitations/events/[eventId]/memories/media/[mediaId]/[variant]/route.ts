import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { getMemoryMediaById } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

export async function GET(request: NextRequest, { params }: { params: { eventId: string; mediaId: string; variant: string } }) {
  if (!await requireInvitationAccess(request, params.eventId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (params.variant !== "display" && params.variant !== "thumbnail") return NextResponse.json({ error: "invalid variant" }, { status: 400 });
  const media = await getMemoryMediaById(params.mediaId);
  if (!media || media.eventId !== params.eventId || media.uploadStatus !== "uploaded" || media.processingStatus !== "ready") return NextResponse.json({ error: "not found" }, { status: 404 });
  const key = params.variant === "display" ? media.objectKeyDisplay : media.objectKeyThumbnail;
  if (!key) return NextResponse.json({ error: "not ready" }, { status: 404 });
  return NextResponse.redirect(await new R2StorageProvider().getSignedDownloadUrl(key, 5 * 60));
}
