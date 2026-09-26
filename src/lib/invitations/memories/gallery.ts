// src/lib/invitations/memories/gallery.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRow } from "./repository";
import type { MemoryMedia } from "./types";

export type PublicMemoryMedia = Pick<
  MemoryMedia,
  "id" | "mediaKind" | "uploaderDisplayName" | "objectKeyDisplay" | "objectKeyThumbnail" | "capturedAt" | "uploadedAt"
>;

export function toPublicMemoryMedia(media: MemoryMedia): PublicMemoryMedia {
  return {
    id: media.id,
    mediaKind: media.mediaKind,
    uploaderDisplayName: media.uploaderDisplayName,
    objectKeyDisplay: media.objectKeyDisplay,
    objectKeyThumbnail: media.objectKeyThumbnail,
    capturedAt: media.capturedAt,
    uploadedAt: media.uploadedAt,
  };
}

export function computeGalleryVisible(media: MemoryMedia): boolean {
  return (
    media.uploadStatus === "uploaded" &&
    media.processingStatus === "ready" &&
    media.moderationStatus === "approved"
  );
}

export async function listGalleryVisibleMedia(eventId: string): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .order("captured_at", { ascending: false });

  if (error || !data) return [];
  return data.map(mapRow);
}

// Same gallery-visibility gate as listGalleryVisibleMedia, plus has_faces —
// the candidate pool for a Find Me search. Capped via `limit` so a single
// search can never trigger an unbounded number of downstream CompareFaces
// calls, regardless of event size.
export async function listGalleryVisibleMediaWithFaces(eventId: string, limit: number): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .eq("has_faces", true)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapRow);
}
