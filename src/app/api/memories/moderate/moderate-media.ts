// src/app/api/memories/moderate/moderate-media.ts
//
// Core moderation logic for a single media item — pulled out of route.ts, not
// just for testability, but because a route.ts file may only export the
// recognized HTTP handlers and a small set of config fields; Next.js's
// typed-routes build step rejects anything else (see this repo's CLAUDE.md
// and the identical treatment in this same plan's
// src/app/api/memories/events/[eventId]/highlights/guest-highlights.ts and
// src/app/api/cron/memories-highlights/memories-highlights-cron.ts, whose
// dependencies-object DI pattern this mirrors).
//
// This split is also what makes video moderation possible at all: photos are
// moderated by workers/memories-processing (the Cloudflare Worker) firing a
// POST to /api/memories/moderate after it finishes deriving display/
// thumbnail/moderation images — but that Worker returns early for any
// unsupported (non-image) extension, which is every video, before it ever
// reaches that fire-and-forget moderation trigger. So nothing ever moderates
// a video through that path, and a video's moderation_status would stay at
// its DB default ('pending') forever — gallery.ts's computeGalleryVisible
// requires 'approved', and host.ts's allowedModerationStatuses("approve")
// only accepts flagged/awaiting_host_review as a starting state, never
// pending, so a host can't even manually rescue it. Exporting this function
// lets upload/complete/route.ts call it directly for the video branch, right
// after markVideoMemoryMediaReady succeeds, independent of the Worker's
// R2-event-notification pipeline entirely (matching this feature's own
// design: a video's whole lifecycle, moderation included, must not depend on
// the async image-processing Worker pipeline the way photos do).
import type { AIProvider } from "@/lib/invitations/memories/ai-provider";
import { resolveModerationOutcome, RekognitionAIProvider } from "@/lib/invitations/memories/ai-provider";
import { requestHighlightGeneration } from "@/lib/invitations/memories/highlight-service";
import { deriveObjectKeys } from "@/lib/invitations/memories/processing-provider";
import {
  getEventMemoriesSettings,
  getMemoryMediaById,
  updateMemoryMediaModeration,
  upsertMemoryMediaDescriptor,
} from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import type { StorageProvider } from "@/lib/invitations/memories/storage-provider";

export interface ModerateMediaResult {
  status: number;
  body: { ok?: true; moderationStatus?: string; error?: string };
}

// Dependencies-object DI seam, same rationale as guest-highlights.ts's own:
// getMemoryMediaById/getEventMemoriesSettings/updateMemoryMediaModeration/
// upsertMemoryMediaDescriptor call createAdminClient() directly and have no
// injection seam of their own, and RekognitionAIProvider/R2StorageProvider
// call real AWS/R2 APIs — without this seam, none of this function's branches
// (video-vs-photo moderation key, the missing-key throw, approved/awaiting
// descriptor extraction, generation queueing) would be testable without a
// real Supabase instance plus live AWS credentials.
export interface ModerateMediaDependencies {
  getMemoryMediaById?: typeof getMemoryMediaById;
  getEventMemoriesSettings?: typeof getEventMemoriesSettings;
  updateMemoryMediaModeration?: typeof updateMemoryMediaModeration;
  upsertMemoryMediaDescriptor?: typeof upsertMemoryMediaDescriptor;
  requestHighlightGeneration?: typeof requestHighlightGeneration;
  storage?: StorageProvider;
  aiProvider?: AIProvider;
}

// mediaId is the only required input — route.ts owns request parsing/auth,
// this owns the actual work, mirroring guest-highlights.ts's
// getGuestHighlightsForEvent split at the route layer.
export async function moderateMedia(
  mediaId: string,
  dependencies: ModerateMediaDependencies = {},
): Promise<ModerateMediaResult> {
  const getMedia = dependencies.getMemoryMediaById ?? getMemoryMediaById;
  const getSettings = dependencies.getEventMemoriesSettings ?? getEventMemoriesSettings;
  const updateModeration = dependencies.updateMemoryMediaModeration ?? updateMemoryMediaModeration;
  const upsertDescriptor = dependencies.upsertMemoryMediaDescriptor ?? upsertMemoryMediaDescriptor;
  const requestGeneration = dependencies.requestHighlightGeneration ?? requestHighlightGeneration;
  const storage = dependencies.storage ?? new R2StorageProvider();
  const provider = dependencies.aiProvider ?? new RekognitionAIProvider();

  const media = await getMedia(mediaId);
  if (!media || !media.objectKeyDisplay) {
    return { status: 409, body: { error: "media not ready for moderation" } };
  }
  const settings = await getSettings(media.eventId);
  if (!settings) return { status: 404, body: { error: "event not found" } };

  let outcome;
  let bytes: Uint8Array;
  try {
    const moderationKey =
      media.mediaKind === "video" ? media.objectKeyThumbnail : deriveObjectKeys(media.eventId, media.id).moderation;
    if (!moderationKey) {
      throw new Error(`no moderation-input key available for ${media.mediaKind} media ${media.id}`);
    }
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
    return { status: 500, body: { error: "moderation failed" } };
  }

  await updateModeration(mediaId, outcome);

  // Best-effort AI Highlight descriptor extraction — never lets a failure
  // here affect the moderation outcome above, which has already been
  // committed. Skipped for rejected/flagged content (no point extracting
  // labels for something that won't be shown). Reuses the moderation
  // derivative `bytes` already downloaded above for moderateImage — no
  // second R2 fetch. Approved media becomes immediately eligible for
  // grouping, so a generation is requested right away; awaiting-review media
  // only gets its descriptor persisted here — generation is queued later, by
  // the host moderation route, once/if the host approves it.
  if (outcome.moderationStatus === "approved" || outcome.moderationStatus === "awaiting_host_review") {
    try {
      const labels = await provider.detectLabels(bytes);
      await upsertDescriptor({ mediaId, labels });
      if (outcome.moderationStatus === "approved") {
        await requestGeneration(media.eventId, false);
      }
    } catch (err) {
      console.error("[memories/moderate] AI Highlight descriptor extraction failed (non-fatal)", { mediaId, error: err });
    }
  }

  return { status: 200, body: { ok: true, moderationStatus: outcome.moderationStatus } };
}
