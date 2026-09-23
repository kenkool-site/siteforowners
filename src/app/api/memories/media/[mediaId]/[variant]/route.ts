import { NextRequest, NextResponse } from "next/server";
import { computeGalleryVisible } from "@/lib/invitations/memories/gallery";
import { getMemoryMediaById } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

const VARIANTS = new Set(["display", "thumbnail"]);

export async function GET(_request: NextRequest, { params }: { params: { mediaId: string; variant: string } }) {
  if (!VARIANTS.has(params.variant)) return NextResponse.json({ error: "invalid variant" }, { status: 400 });
  const media = await getMemoryMediaById(params.mediaId);
  if (!media || !computeGalleryVisible(media)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const objectKey = params.variant === "display" ? media.objectKeyDisplay : media.objectKeyThumbnail;
  if (!objectKey) return NextResponse.json({ error: "not ready" }, { status: 404 });
  const url = await new R2StorageProvider().getSignedDownloadUrl(objectKey, 5 * 60);
  return NextResponse.redirect(url);
}
