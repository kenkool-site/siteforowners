import { NextRequest, NextResponse } from "next/server";
import { resolveModerationOutcome, RekognitionAIProvider } from "@/lib/invitations/memories/ai-provider";
import { getEventMemoriesSettings, getMemoryMediaById, updateMemoryMediaModeration } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

export async function POST(request: NextRequest) {
  if (request.headers.get("x-memories-internal-secret") !== process.env.MEMORIES_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { mediaId } = (await request.json()) as { mediaId: string };

  const media = await getMemoryMediaById(mediaId);
  if (!media || !media.objectKeyDisplay) {
    return NextResponse.json({ error: "media not ready for moderation" }, { status: 409 });
  }
  const settings = await getEventMemoriesSettings(media.eventId);
  if (!settings) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const storage = new R2StorageProvider();
  const downloadUrl = await storage.getSignedDownloadUrl(media.objectKeyDisplay, 60);
  const imageResponse = await fetch(downloadUrl);
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());

  const provider = new RekognitionAIProvider();
  const result = await provider.moderateImage(bytes);
  const outcome = resolveModerationOutcome(settings.memoriesMode, result);

  await updateMemoryMediaModeration(mediaId, outcome);
  return NextResponse.json({ ok: true, moderationStatus: outcome.moderationStatus });
}
