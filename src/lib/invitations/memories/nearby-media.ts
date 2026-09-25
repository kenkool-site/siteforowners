// src/lib/invitations/memories/nearby-media.ts
//
// "Every Perspective": surfaces other gallery-visible media from the same
// event captured around the same instant as a given item, so a guest
// viewing one photo/video can see what other guests captured of the same
// moment. Matching is a pure capture-time window — it doesn't depend on the
// host having configured Moments, or on AI Highlights having run — because
// every memory_media row has captured_at populated (see migration 060:
// EXIF when present, else upload time, never null).
import { computeGalleryVisible, listGalleryVisibleMedia, toPublicMemoryMedia, type PublicMemoryMedia } from "./gallery";
import { getMemoryMediaById } from "./repository";

export const NEARBY_WINDOW_MS = 3 * 60 * 1000;

// Pure and exhaustively unit-tested: given a target item and a pool of
// candidates (already fetched, already gallery-visible), returns the ones
// within windowMs of the target's capturedAt, nearest first. Excludes the
// target itself by id. A candidate (or the target) with no capturedAt is
// never considered a match — there's no instant to compare against.
export function findNearbyMatches(
  target: PublicMemoryMedia,
  candidates: PublicMemoryMedia[],
  windowMs: number,
): PublicMemoryMedia[] {
  if (!target.capturedAt) return [];
  const targetTime = Date.parse(target.capturedAt);
  if (!Number.isFinite(targetTime)) return [];

  return candidates
    .filter((candidate) => candidate.id !== target.id && candidate.capturedAt)
    .map((candidate) => ({ candidate, delta: Math.abs(Date.parse(candidate.capturedAt as string) - targetTime) }))
    .filter(({ delta }) => Number.isFinite(delta) && delta <= windowMs)
    .sort((a, b) => a.delta - b.delta)
    .map(({ candidate }) => candidate);
}

// DB-backed lookup the API route (Task 2) calls. Returns null when the
// anchor media doesn't exist or isn't gallery-visible — mirrors
// [mediaId]/[variant]/route.ts's own 404 gate; the route maps this to a 404.
// Reuses listGalleryVisibleMedia (gallery.ts) for the candidate pool rather
// than duplicating its query, so this function's own DB footprint is just
// the anchor lookup plus one already-relied-upon existing call.
export async function getNearbyMedia(mediaId: string): Promise<PublicMemoryMedia[] | null> {
  const media = await getMemoryMediaById(mediaId);
  if (!media || !computeGalleryVisible(media)) return null;

  const candidates = await listGalleryVisibleMedia(media.eventId);
  return findNearbyMatches(toPublicMemoryMedia(media), candidates.map(toPublicMemoryMedia), NEARBY_WINDOW_MS);
}
