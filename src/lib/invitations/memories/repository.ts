// src/lib/invitations/memories/repository.ts
import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaKind, MemoriesGuestLevel, MemoryMedia } from "./types";

export function mapRow(row: Record<string, unknown>): MemoryMedia {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    uploaderRsvpId: (row.uploader_rsvp_id as string | null) ?? null,
    uploaderDisplayName: (row.uploader_display_name as string | null) ?? null,
    guestSessionLevel: row.guest_session_level as MemoriesGuestLevel,
    mediaKind: row.media_kind as MediaKind,
    objectKeyOriginal: row.object_key_original as string,
    objectKeyDisplay: (row.object_key_display as string | null) ?? null,
    objectKeyThumbnail: (row.object_key_thumbnail as string | null) ?? null,
    capturedAt: (row.captured_at as string | null) ?? null,
    uploadedAt: row.uploaded_at as string,
    uploadStatus: row.upload_status as MemoryMedia["uploadStatus"],
    processingStatus: row.processing_status as MemoryMedia["processingStatus"],
    moderationStatus: row.moderation_status as MemoryMedia["moderationStatus"],
    aiStatus: row.ai_status as MemoryMedia["aiStatus"],
    moderationScore: (row.moderation_score as number | null) ?? null,
    moderationCategories: (row.moderation_categories as string[] | null) ?? null,
  };
}

export async function createPendingMemoryMedia(input: {
  id: string;
  eventId: string;
  mediaKind: MediaKind;
  objectKeyOriginal: string;
  guestSessionLevel: MemoriesGuestLevel;
  uploaderRsvpId: string | null;
  uploaderDisplayName: string | null;
}): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_media").insert({
    id: input.id,
    event_id: input.eventId,
    media_kind: input.mediaKind,
    object_key_original: input.objectKeyOriginal,
    guest_session_level: input.guestSessionLevel,
    uploader_rsvp_id: input.uploaderRsvpId,
    uploader_display_name: input.uploaderDisplayName,
  });
  if (error) throw new Error(`failed to create memory_media row: ${error.message}`);
}

export async function markMemoryMediaUploaded(mediaId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({ upload_status: "uploaded" })
    .eq("id", mediaId)
    .eq("upload_status", "pending"); // idempotent: a redelivered "complete" call can't regress or double-apply
  if (error) throw new Error(`failed to mark memory_media uploaded: ${error.message}`);

  // memory_processing_jobs is the durable, retryable unit of work the DLQ drain (Task 6)
  // and any future host-facing "retry" control operate on — it must exist before the R2
  // event notification fires the Worker, not be created reactively after the fact.
  const { error: jobError } = await client
    .from("memory_processing_jobs")
    .upsert(
      { media_id: mediaId, job_type: "derivative", attempt: 1, status: "pending" },
      { onConflict: "media_id,job_type,attempt", ignoreDuplicates: true },
    );
  if (jobError) throw new Error(`failed to queue memory_processing_jobs row: ${jobError.message}`);
}

export async function getMemoryMediaById(mediaId: string): Promise<MemoryMedia | null> {
  const client = createAdminClient();
  const { data, error } = await client.from("memory_media").select("*").eq("id", mediaId).maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function simulateFixtureMediaReady(mediaId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({
      processing_status: "ready",
      moderation_status: "approved",
      object_key_display: `fixture/${mediaId}.webp`,
      object_key_thumbnail: `fixture/${mediaId}.webp`,
    })
    .eq("id", mediaId);
  if (error) throw new Error(`failed to simulate fixture media: ${error.message}`);
}

export async function getEventMemoriesSettings(
  eventId: string,
): Promise<{ memoriesEnabled: boolean; memoriesMode: "auto_publish" | "review_required"; startsAt: string | null } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("memories_enabled,memories_mode,starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    memoriesEnabled: data.memories_enabled as boolean,
    memoriesMode: data.memories_mode as "auto_publish" | "review_required",
    startsAt: (data.starts_at as string | null) ?? null,
  };
}

export async function updateEventMemoriesSettings(
  eventId: string,
  updates: { memoriesEnabled?: boolean; memoriesMode?: "auto_publish" | "review_required" },
): Promise<void> {
  const client = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (updates.memoriesEnabled !== undefined) patch.memories_enabled = updates.memoriesEnabled;
  if (updates.memoriesMode !== undefined) patch.memories_mode = updates.memoriesMode;
  const { error } = await client.from("invitation_events").update(patch).eq("id", eventId);
  if (error) throw new Error(`failed to update memories settings: ${error.message}`);
}

export async function updateMemoryMediaModeration(
  mediaId: string,
  outcome: { moderationStatus: string; moderationScore: number; moderationCategories: string[] },
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({
      moderation_status: outcome.moderationStatus,
      moderation_score: outcome.moderationScore,
      moderation_categories: outcome.moderationCategories,
    })
    .eq("id", mediaId)
    .eq("moderation_status", "pending"); // idempotent: a retried moderation call can't re-flag an already-decided item
  if (error) throw new Error(`failed to update memory_media moderation: ${error.message}`);
}

export async function getRsvpForEditCredential(
  eventId: string,
  rsvpId: string,
): Promise<{ primaryName: string | null; editTokenHash: string } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_rsvps")
    .select("primary_name, edit_token_hash")
    .eq("id", rsvpId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    primaryName: (data.primary_name as string | null) ?? null,
    editTokenHash: data.edit_token_hash as string,
  };
}

export async function countMemoryMediaForEvent(eventId: string): Promise<number> {
  const client = createAdminClient();
  // Only completed uploads count toward the quota. Counting every row regardless of
  // upload_status let an unauthenticated flood of /upload/init calls that never
  // upload anything (abandoned at 'pending') permanently brick a real event's quota
  // with no recovery path; an attacker now has to actually complete 2000 uploads.
  const { count, error } = await client
    .from("memory_media")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded");
  if (error) {
    console.error("[memories/repository] countMemoryMediaForEvent failed", { eventId, error });
    return 0;
  }
  return count ?? 0;
}
