import { NextRequest, NextResponse } from "next/server";
import { resolveModerationOutcome, RekognitionAIProvider } from "@/lib/invitations/memories/ai-provider";
import { classifyMomentFromLabels } from "@/lib/invitations/memories/moment-classification";
import { deriveObjectKeys } from "@/lib/invitations/memories/processing-provider";
import {
  getEventMemoriesSettings,
  getMemoryMediaById,
  listMemoryMoments,
  setAiClassifiedMoment,
  updateMemoryMediaModeration,
} from "@/lib/invitations/memories/repository";
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
  const provider = new RekognitionAIProvider();
  let outcome;
  let bytes: Uint8Array;
  try {
    const moderationKey = deriveObjectKeys(media.eventId, media.id).moderation;
    const downloadUrl = await storage.getSignedDownloadUrl(moderationKey, 60);
    const imageResponse = await fetch(downloadUrl);
    if (!imageResponse.ok) {
      throw new Error(`R2 download failed with status ${imageResponse.status}`);
    }
    bytes = new Uint8Array(await imageResponse.arrayBuffer());

    const result = await provider.moderateImage(bytes);
    outcome = resolveModerationOutcome(settings.memoriesMode, result);
  } catch (err) {
    console.error("[memories/moderate] failed to fetch or moderate image", { mediaId, error: err });
    return NextResponse.json({ error: "moderation failed" }, { status: 500 });
  }

  await updateMemoryMediaModeration(mediaId, outcome);

  // Best-effort Moment classification — never lets a failure here affect the
  // moderation outcome above, which has already been committed. Skipped for
  // rejected/flagged content (no point classifying something that won't be
  // shown) and for events with no Moments defined yet.
  if (outcome.moderationStatus === "approved" || outcome.moderationStatus === "awaiting_host_review") {
    try {
      const moments = await listMemoryMoments(media.eventId);
      if (moments.length > 0) {
        const detectedLabels = await provider.detectLabels(bytes);
        const match = classifyMomentFromLabels(detectedLabels, moments);
        if (match) await setAiClassifiedMoment(mediaId, match.id);
      }
    } catch (err) {
      console.error("[memories/moderate] moment classification failed (non-fatal)", { mediaId, error: err });
    }
  }

  return NextResponse.json({ ok: true, moderationStatus: outcome.moderationStatus });
}
