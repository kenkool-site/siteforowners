// src/app/api/cron/memories-highlights/route.ts
//
// Periodic worker for the AI Highlight Grouping pipeline (see
// src/lib/invitations/memories/highlight-service.ts). Two independent,
// bounded passes per invocation:
//
//   1. Process whatever highlight generations are sitting in the queue —
//      queued by requestHighlightGeneration, called from the moderation
//      routes whenever new approved media makes an event eligible.
//      claimNextHighlightGeneration/processHighlightGeneration both require a
//      specific generationId already in hand (neither discovers work on its
//      own), so this route's own job is the cross-event discovery step:
//      listQueuedHighlightGenerations finds candidate ids, this pass runs
//      each sequentially.
//
//   2. Backfill descriptors for approved media that predates this feature (or
//      whose extraction previously failed), so events that never got new
//      media after this shipped still eventually become eligible for
//      grouping.
//
// Generation processing always runs first, before backfill does any
// DB/network work of its own: a generation's staleness clock
// (reclaimStaleHighlightGeneration) is measured from queue time, not from
// when a worker actually picks it up, so this route invokes
// processHighlightGeneration promptly rather than queuing further work first.
//
// Follows this codebase's established cron pattern (see
// src/app/api/cron/memories-dlq-drain/route.ts): Bearer CRON_SECRET auth
// first, force-dynamic, a per-item try/catch so one failure never stops the
// batch, and a small JSON summary as the response.
import { NextRequest, NextResponse } from "next/server";
import type { DetectedLabel } from "@/lib/invitations/memories/ai-provider";
import { RekognitionAIProvider } from "@/lib/invitations/memories/ai-provider";
import { processHighlightGeneration } from "@/lib/invitations/memories/highlight-service";
import type { MemoryHighlightGeneration } from "@/lib/invitations/memories/highlight-types";
import { deriveObjectKeys } from "@/lib/invitations/memories/processing-provider";
import {
  listApprovedMediaMissingDescriptorsAcrossEvents,
  listQueuedHighlightGenerations,
  upsertMemoryMediaDescriptor,
} from "@/lib/invitations/memories/repository";
import type { MemoryMediaSummary } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

export const dynamic = "force-dynamic";

// At most this many queued generations are claimed and run per invocation.
// Generation processing is a single Anthropic call plus a handful of DB
// writes, so 3 keeps one function invocation comfortably fast even on a cold
// start, while the 5-minute cron cadence (see vercel.json) still drains a
// normal-sized backlog quickly.
const MAX_GENERATIONS_PER_RUN = 3;

// At most this many approved-but-undescribed media items are analyzed per run
// for the backfill pass — deliberately smaller, lower-priority work than
// generation processing above.
const MAX_BACKFILL_PER_RUN = 5;

export interface MemoriesHighlightsCronDependencies {
  listQueuedHighlightGenerations?: typeof listQueuedHighlightGenerations;
  processHighlightGeneration?: typeof processHighlightGeneration;
  listApprovedMediaMissingDescriptorsAcrossEvents?: typeof listApprovedMediaMissingDescriptorsAcrossEvents;
  upsertMemoryMediaDescriptor?: typeof upsertMemoryMediaDescriptor;
  detectLabels?: (media: MemoryMediaSummary) => Promise<DetectedLabel[]>;
}

export interface MemoriesHighlightsCronResult {
  processed: number;
  failed: number;
  backfilled: number;
  backfillFailed: number;
}

// The only place this route reaches R2/Rekognition directly. Mirrors
// highlight-service.ts's own defaultDetectLabelsForMedia, but reads the
// moderation derivative (a JPEG produced specifically for Rekognition calls —
// see deriveObjectKeys) rather than the display derivative (a .webp meant for
// the gallery UI), matching how /api/memories/moderate itself calls
// detectLabels off the same moderation JPEG it already downloaded.
async function detectLabelsFromModerationDerivative(media: MemoryMediaSummary): Promise<DetectedLabel[]> {
  const storage = new R2StorageProvider();
  const provider = new RekognitionAIProvider();
  const moderationKey = deriveObjectKeys(media.eventId, media.mediaId).moderation;
  const downloadUrl = await storage.getSignedDownloadUrl(moderationKey, 60);
  const imageResponse = await fetch(downloadUrl);
  if (!imageResponse.ok) throw new Error(`R2 download failed with status ${imageResponse.status}`);
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  return provider.detectLabels(bytes);
}

// Core worker logic, factored out from the GET handler so tests can inject
// fakes for every seam without touching Supabase/R2/Rekognition — mirroring
// highlight-service.ts's own `dependencies` DI pattern.
export async function runMemoriesHighlightsCron(
  dependencies: MemoriesHighlightsCronDependencies = {},
): Promise<MemoriesHighlightsCronResult> {
  const listQueued = dependencies.listQueuedHighlightGenerations ?? listQueuedHighlightGenerations;
  const processGeneration = dependencies.processHighlightGeneration ?? processHighlightGeneration;
  const listMissingDescriptors =
    dependencies.listApprovedMediaMissingDescriptorsAcrossEvents ?? listApprovedMediaMissingDescriptorsAcrossEvents;
  const upsertDescriptor = dependencies.upsertMemoryMediaDescriptor ?? upsertMemoryMediaDescriptor;
  const detectLabels = dependencies.detectLabels ?? detectLabelsFromModerationDerivative;

  let processed = 0;
  let failed = 0;

  // The `.slice` on top of the limit already passed to listQueued is a
  // defense-in-depth belt-and-suspenders cap: even if that dependency ever
  // returned more than asked, this loop still never processes more than
  // MAX_GENERATIONS_PER_RUN generations in one invocation.
  const queued: MemoryHighlightGeneration[] = (await listQueued(MAX_GENERATIONS_PER_RUN)).slice(0, MAX_GENERATIONS_PER_RUN);
  for (const generationToProcess of queued) {
    try {
      await processGeneration(generationToProcess.id);
      processed += 1;
    } catch (err) {
      failed += 1;
      console.error("[cron/memories-highlights] generation processing failed", {
        generationId: generationToProcess.id,
        error: err,
      });
    }
  }

  let backfilled = 0;
  let backfillFailed = 0;
  try {
    const missing: MemoryMediaSummary[] = (await listMissingDescriptors(MAX_BACKFILL_PER_RUN)).slice(0, MAX_BACKFILL_PER_RUN);
    for (const item of missing) {
      try {
        const labels = await detectLabels(item);
        await upsertDescriptor({ mediaId: item.mediaId, labels });
        backfilled += 1;
      } catch (err) {
        backfillFailed += 1;
        console.error("[cron/memories-highlights] descriptor backfill failed for media (non-fatal)", {
          mediaId: item.mediaId,
          error: err,
        });
      }
    }
  } catch (err) {
    // Listing itself failed (e.g. a transient DB error) — the backfill pass
    // is strictly best-effort and must never affect the generation-processing
    // results already computed above, so this is logged and swallowed rather
    // than thrown.
    console.error("[cron/memories-highlights] descriptor backfill listing failed (non-fatal)", { error: err });
  }

  return { processed, failed, backfilled, backfillFailed };
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runMemoriesHighlightsCron();
  return NextResponse.json(result);
}
