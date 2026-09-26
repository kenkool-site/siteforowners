// src/app/api/memories/events/[eventId]/find-me/find-me-search.ts
//
// Core Find Me logic — pulled out of route.ts because a route.ts file may
// only export the recognized HTTP handlers and a small set of config fields
// (see this repo's CLAUDE.md), matching every other route this project has
// added this session (moderate-media.ts, nearby-media.ts).
import type { AIProvider } from "@/lib/invitations/memories/ai-provider";
import { RekognitionAIProvider } from "@/lib/invitations/memories/ai-provider";
import { listGalleryVisibleMediaWithFaces, toPublicMemoryMedia, type PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { allowFindMeAttempt } from "@/lib/invitations/memories/find-me-rate-limit";
import { deriveObjectKeys } from "@/lib/invitations/memories/processing-provider";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import type { StorageProvider } from "@/lib/invitations/memories/storage-provider";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

const MAX_CANDIDATES = 300;
const CONCURRENCY = 5;
const SIMILARITY_THRESHOLD = 80;

export interface FindMeSearchResult {
  status: number;
  body: { media?: PublicMemoryMedia[]; error?: string };
}

// Dependencies-object DI seam, same rationale as moderate-media.ts's own:
// getEventMemoriesSettings/listGalleryVisibleMediaWithFaces/allowFindMeAttempt
// call createAdminClient() directly and have no injection seam of their own,
// and RekognitionAIProvider/R2StorageProvider call real AWS/R2 APIs.
export interface FindMeSearchDependencies {
  getEventMemoriesSettings?: typeof getEventMemoriesSettings;
  listGalleryVisibleMediaWithFaces?: typeof listGalleryVisibleMediaWithFaces;
  allowFindMeAttempt?: typeof allowFindMeAttempt;
  storage?: StorageProvider;
  aiProvider?: AIProvider;
}

// Pure and independently testable: given already-downloaded candidate bytes
// and a comparison function, runs the comparisons with bounded concurrency
// and returns matches (similarity > 0) sorted best-first. Kept separate from
// the R2/DB-fetching orchestration below so this concurrency/threshold/sort
// behavior can be verified with plain fakes — no fetch or storage involved.
export async function compareAgainstCandidates(
  selfieBytes: Uint8Array,
  candidates: Array<{ media: MemoryMedia; bytes: Uint8Array }>,
  compareFaces: (source: Uint8Array, target: Uint8Array, threshold: number) => Promise<number>,
  concurrency: number,
): Promise<Array<{ media: MemoryMedia; similarity: number }>> {
  const results: Array<{ media: MemoryMedia; similarity: number }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor++;
      const candidate = candidates[index];
      let similarity = 0;
      try {
        similarity = await compareFaces(selfieBytes, candidate.bytes, SIMILARITY_THRESHOLD);
      } catch (err) {
        console.error("[memories/find-me] face comparison failed for a candidate, skipping it", { mediaId: candidate.media.id, error: err });
      }
      if (similarity > 0) results.push({ media: candidate.media, similarity });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  return results.sort((a, b) => b.similarity - a.similarity);
}

// Pure and independently testable, mirroring compareAgainstCandidates's own
// worker-pool shape: downloads candidate bytes with bounded concurrency so a
// large gallery (up to MAX_CANDIDATES) doesn't serialize hundreds of
// sequential network round-trips before any comparison can even start. Kept
// as a separate function (not merged into compareAgainstCandidates) so each
// stage stays independently testable with its own fakes.
export async function downloadCandidates(
  candidateMedia: MemoryMedia[],
  storage: StorageProvider,
  concurrency: number,
): Promise<Array<{ media: MemoryMedia; bytes: Uint8Array }>> {
  const candidates: Array<{ media: MemoryMedia; bytes: Uint8Array }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidateMedia.length) {
      const index = cursor++;
      const media = candidateMedia[index];
      const key = media.mediaKind === "video" ? media.objectKeyThumbnail : deriveObjectKeys(media.eventId, media.id).moderation;
      if (!key) continue;
      try {
        const downloadUrl = await storage.getSignedDownloadUrl(key, 60);
        const response = await fetch(downloadUrl);
        if (!response.ok) continue;
        candidates.push({ media, bytes: new Uint8Array(await response.arrayBuffer()) });
      } catch (err) {
        console.error("[memories/find-me] failed to fetch a candidate photo, skipping it", { mediaId: media.id, error: err });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidateMedia.length) }, () => worker()));
  return candidates;
}

export async function searchFindMe(
  eventId: string,
  guestSessionId: string,
  selfieBytes: Uint8Array,
  dependencies: FindMeSearchDependencies = {},
): Promise<FindMeSearchResult> {
  const getSettings = dependencies.getEventMemoriesSettings ?? getEventMemoriesSettings;
  const listCandidates = dependencies.listGalleryVisibleMediaWithFaces ?? listGalleryVisibleMediaWithFaces;
  const allowAttempt = dependencies.allowFindMeAttempt ?? allowFindMeAttempt;
  const storage = dependencies.storage ?? new R2StorageProvider();
  const provider = dependencies.aiProvider ?? new RekognitionAIProvider();

  const settings = await getSettings(eventId);
  if (!settings || !settings.memoriesEnabled || !settings.findMeEnabled) {
    return { status: 404, body: { error: "find me not enabled for this event" } };
  }

  const allowed = await allowAttempt(eventId, guestSessionId);
  if (!allowed) return { status: 429, body: { error: "too many searches, try again later" } };

  const candidateMedia = await listCandidates(eventId, MAX_CANDIDATES);
  const candidates = await downloadCandidates(candidateMedia, storage, CONCURRENCY);

  const matches = await compareAgainstCandidates(
    selfieBytes,
    candidates,
    (source, target, threshold) => provider.compareFaces(source, target, threshold),
    CONCURRENCY,
  );

  return { status: 200, body: { media: matches.map((match) => toPublicMemoryMedia(match.media)) } };
}
