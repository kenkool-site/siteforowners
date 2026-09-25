// src/lib/invitations/memories/nearby-media.ts
//
// "Every Perspective": surfaces other gallery-visible media from the same
// event captured around the same instant as a given item, so a guest
// viewing one photo/video can see what other guests captured of the same
// moment. Matching is a pure capture-time window — it doesn't depend on the
// host having configured Moments, or on AI Highlights having run — because
// every memory_media row has captured_at populated (see migration 060:
// EXIF when present, else upload time, never null).
import { createAdminClient } from "@/lib/supabase/admin";
import { computeGalleryVisible, toPublicMemoryMedia, type PublicMemoryMedia } from "./gallery";
import { getEventMemoriesSettings, getMemoryMediaById, mapRow } from "./repository";

export const NEARBY_WINDOW_MS = 3 * 60 * 1000;

// Caps the strip/detour cluster so a busy moment (e.g. cake-cutting at a big
// wedding, which can produce 50-100 raw matches) never renders an unbounded
// list of thumbnails. Applied after findNearbyMatches has already sorted
// nearest-first, so the cap keeps the closest matches.
export const NEARBY_MAX_RESULTS = 12;

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
// anchor media doesn't exist, isn't gallery-visible, or Memories has been
// switched off for the event — the route maps a null return to a 404,
// mirroring [mediaId]/[variant]/route.ts's own 404 gate and matching the
// memoriesEnabled gate every other listing endpoint in this codebase applies
// (see gallery/route.ts).
//
// Queries memory_media directly (scoped by event_id, the three gallery
// visibility status columns, and a captured_at window around the anchor)
// rather than reusing listGalleryVisibleMedia's full-event select("*") —
// memory_media_event_captured_idx (056_invitation_memories_foundation.sql)
// is built on (event_id, captured_at) specifically so this per-navigation
// lookup stays indexed and bounded instead of scanning every gallery-visible
// row in the event on every lightbox item change. findNearbyMatches remains
// the authoritative post-query filter+sort (it's already exhaustively
// unit-tested) — this just feeds it a narrower, indexed candidate set.
export async function getNearbyMedia(mediaId: string): Promise<PublicMemoryMedia[] | null> {
  const media = await getMemoryMediaById(mediaId);
  if (!media || !computeGalleryVisible(media)) return null;

  const settings = await getEventMemoriesSettings(media.eventId);
  if (!settings || !settings.memoriesEnabled) return null;

  // No capturedAt (or an unparseable one) means there's no window to
  // construct — bail out before touching the DB at all.
  if (!media.capturedAt) return [];
  const anchorTime = Date.parse(media.capturedAt);
  if (!Number.isFinite(anchorTime)) return [];

  const windowStart = new Date(anchorTime - NEARBY_WINDOW_MS).toISOString();
  const windowEnd = new Date(anchorTime + NEARBY_WINDOW_MS).toISOString();

  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", media.eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .gte("captured_at", windowStart)
    .lte("captured_at", windowEnd);

  if (error || !data) return [];

  // computeGalleryVisible only checks status columns, not whether a
  // thumbnail actually exists — a gallery-visible row can still have a null
  // object_key_thumbnail (see processing-complete/route.ts's hasDerivatives
  // branch). Such a row would render as a broken tile in the strip, or a
  // blank image if detoured into, so it's filtered out of the candidate pool
  // before matching rather than left for the caller to discover.
  const candidates = data.map(mapRow).filter((item) => item.objectKeyThumbnail);

  const matches = findNearbyMatches(toPublicMemoryMedia(media), candidates.map(toPublicMemoryMedia), NEARBY_WINDOW_MS);
  return matches.slice(0, NEARBY_MAX_RESULTS);
}
