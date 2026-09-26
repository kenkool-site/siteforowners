// src/lib/invitations/memories/repository.ts
import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaKind, MemoriesGuestLevel, MemoryMedia } from "./types";
import { allowedModerationStatuses, buildMemoriesEventSummary, moderationStatusForFilter, type HostModerationAction, type HostReviewFilter, type MemoriesEventSummary } from "./host";
import type {
  HighlightGenerationMode,
  HighlightGenerationStatus,
  HighlightGroupSource,
  HighlightMode,
  MemoryHighlightGeneration,
  MemoryHighlightGroup,
  MemoryMediaDescriptor,
  PublishedMemoryHighlights,
} from "./highlight-types";

export function mapRow(row: Record<string, unknown>): MemoryMedia {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    uploaderRsvpId: (row.uploader_rsvp_id as string | null) ?? null,
    uploaderSessionId: (row.uploader_session_id as string | null) ?? null,
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
  uploaderSessionId: string | null;
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
    uploader_session_id: input.uploaderSessionId,
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

// Video's counterpart to markMemoryMediaUploaded — but video never enters the
// photon-rs processing Worker pipeline (no transcoding, see the video-support
// design spec), so this sets the derivative columns directly instead of
// queuing a memory_processing_jobs row. object_key_display is set to the
// video's own original (playing the actual clip *is* "display" for video);
// object_key_thumbnail is set to the client-captured poster.
export async function markVideoMemoryMediaReady(mediaId: string, objectKeyOriginal: string, posterObjectKey: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({
      upload_status: "uploaded",
      object_key_display: objectKeyOriginal,
      object_key_thumbnail: posterObjectKey,
      processing_status: "ready",
    })
    .eq("id", mediaId)
    // Guard on object_key_thumbnail (the column this function actually owns), not
    // upload_status. processing-complete/route.ts's self-heal path also flips
    // upload_status to 'uploaded' independently, triggered by the R2 Worker's own
    // event notification (which can batch for up to 30s) — if that self-heal wins
    // the race and runs before this call, an upload_status='pending' guard would
    // match 0 rows and silently no-op, leaving object_key_display/object_key_thumbnail
    // permanently null even though the guest's /complete call returns 200. The write
    // is value-idempotent by construction (same mediaId always derives the same
    // target values), so guarding on "not yet set" is safe and closes that race.
    .is("object_key_thumbnail", null);
  if (error) throw new Error(`failed to mark video memory_media ready: ${error.message}`);
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
): Promise<{ memoriesEnabled: boolean; memoriesMode: "auto_publish" | "review_required"; startsAt: string | null; findMeEnabled: boolean } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("memories_enabled,memories_mode,starts_at,find_me_enabled")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    memoriesEnabled: data.memories_enabled as boolean,
    memoriesMode: data.memories_mode as "auto_publish" | "review_required",
    startsAt: (data.starts_at as string | null) ?? null,
    findMeEnabled: data.find_me_enabled as boolean,
  };
}

export async function updateEventMemoriesSettings(
  eventId: string,
  updates: { memoriesEnabled?: boolean; memoriesMode?: "auto_publish" | "review_required"; findMeEnabled?: boolean },
): Promise<void> {
  const client = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (updates.memoriesEnabled !== undefined) patch.memories_enabled = updates.memoriesEnabled;
  if (updates.memoriesMode !== undefined) patch.memories_mode = updates.memoriesMode;
  if (updates.findMeEnabled !== undefined) patch.find_me_enabled = updates.findMeEnabled;
  const { error } = await client.from("invitation_events").update(patch).eq("id", eventId);
  if (error) throw new Error(`failed to update memories settings: ${error.message}`);
}

// Global, not per-event — see the migration's own comment on why Find Me's
// search cap is a founder/platform cost-control knob rather than something
// each event host tunes. Falls back to this same default the column itself
// defaults to if the singleton row is ever missing (defensive only; the
// migration always inserts it).
const DEFAULT_FIND_ME_DAILY_LIMIT = 20;

export async function getFindMeDailyLimit(): Promise<number> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memories_find_me_platform_settings")
    .select("daily_search_limit")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULT_FIND_ME_DAILY_LIMIT;
  return data.daily_search_limit as number;
}

export async function updateFindMeDailyLimit(limit: number): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memories_find_me_platform_settings")
    .update({ daily_search_limit: limit })
    .eq("id", true);
  if (error) throw new Error(`failed to update Find Me daily search limit: ${error.message}`);
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

export async function updateMemoryMediaHasFaces(mediaId: string, hasFaces: boolean): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_media").update({ has_faces: hasFaces }).eq("id", mediaId);
  if (error) throw new Error(`failed to update media has_faces: ${error.message}`);
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

export interface MemoryMoment {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  sortOrder: number;
}

export async function listMemoryMoments(eventId: string): Promise<MemoryMoment[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_moments")
    .select("id,name,starts_at,ends_at,sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
    sortOrder: row.sort_order as number,
  }));
}

export async function createMemoryMoment(
  eventId: string,
  input: { name: string; startsAt: string; endsAt: string; sortOrder?: number },
): Promise<MemoryMoment> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_moments")
    .insert({
      event_id: eventId,
      name: input.name,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id,name,starts_at,ends_at,sort_order")
    .single();
  if (error || !data) throw new Error(`failed to create memory moment: ${error?.message}`);
  return {
    id: data.id as string,
    name: data.name as string,
    startsAt: data.starts_at as string,
    endsAt: data.ends_at as string,
    sortOrder: data.sort_order as number,
  };
}

export async function updateMemoryMoment(
  eventId: string,
  momentId: string,
  updates: { name?: string; startsAt?: string; endsAt?: string; sortOrder?: number },
): Promise<void> {
  const client = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.startsAt !== undefined) patch.starts_at = updates.startsAt;
  if (updates.endsAt !== undefined) patch.ends_at = updates.endsAt;
  if (updates.sortOrder !== undefined) patch.sort_order = updates.sortOrder;
  const { error } = await client.from("memory_moments").update(patch).eq("id", momentId).eq("event_id", eventId);
  if (error) throw new Error(`failed to update memory_moment: ${error.message}`);
}

// memory_moment_media rows for this moment are cleaned up automatically —
// its moment_id column is ON DELETE CASCADE (056_invitation_memories_foundation.sql).
export async function deleteMemoryMoment(eventId: string, momentId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_moments").delete().eq("id", momentId).eq("event_id", eventId);
  if (error) throw new Error(`failed to delete memory_moment: ${error.message}`);
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

export async function listMediaForHostReview(eventId: string, filter: HostReviewFilter): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client.from("memory_media").select("*")
    .eq("event_id", eventId)
    .eq("moderation_status", moderationStatusForFilter(filter))
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(`failed to list Memories media: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function getMemoriesEventSummary(eventId: string): Promise<MemoriesEventSummary> {
  const client = createAdminClient();
  const { data, error } = await client.from("memory_media").select("*").eq("event_id", eventId).eq("upload_status", "uploaded");
  if (error) throw new Error(`failed to summarize Memories media: ${error.message}`);
  return buildMemoriesEventSummary((data ?? []).map(mapRow));
}

export async function moderateMemoryMediaForHost(eventId: string, action: HostModerationAction, mediaIds: string[]): Promise<string[]> {
  const nextStatus = action === "approve" ? "approved" : "rejected";
  const client = createAdminClient();
  const { data, error } = await client.from("memory_media")
    .update({ moderation_status: nextStatus })
    .eq("event_id", eventId)
    .in("id", mediaIds)
    .in("moderation_status", allowedModerationStatuses(action))
    .select("id");
  if (error) throw new Error(`failed to moderate Memories media: ${error.message}`);
  return (data ?? []).map((row) => row.id as string);
}

// Scoped to moderation_status='rejected' — the same status the host's
// Removed/Rejected tab already filters on (see moderationStatusForFilter) —
// so a permanent-delete call can never reach a live or pending item even if
// the caller passes an unexpected id.
export async function listRejectedMemoryMediaByIds(eventId: string, mediaIds: string[]): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client.from("memory_media").select("*")
    .eq("event_id", eventId)
    .eq("moderation_status", "rejected")
    .in("id", mediaIds);
  if (error) throw new Error(`failed to list rejected Memories media: ${error.message}`);
  return (data ?? []).map(mapRow);
}

// The hard-delete counterpart to moderateMemoryMediaForHost's soft status
// update — same moderation_status='rejected' scoping, but removes the row
// outright. Callers must delete the row's R2 objects themselves first (this
// function only owns the database row); memory_media's ON DELETE CASCADE
// foreign keys clean up any highlight-descriptor/moment-membership rows.
export async function deleteMemoryMediaRows(eventId: string, mediaIds: string[]): Promise<string[]> {
  const client = createAdminClient();
  const { data, error } = await client.from("memory_media")
    .delete()
    .eq("event_id", eventId)
    .eq("moderation_status", "rejected")
    .in("id", mediaIds)
    .select("id");
  if (error) throw new Error(`failed to permanently delete Memories media: ${error.message}`);
  return (data ?? []).map((row) => row.id as string);
}

// ---------------------------------------------------------------------------
// AI Highlight grouping — independent of memory_moments/memory_moment_media.
// These methods only ever touch the four tables added by
// 058_memory_highlight_grouping.sql plus invitation_events' highlight_*
// columns. Never import or query memory_moments/memory_moment_media here.
// ---------------------------------------------------------------------------

// Versions the label-extraction approach that produced a descriptor row, in
// case a future extraction method needs to distinguish/re-backfill old rows.
// Not currently branched on anywhere; recorded for that future need.
const DESCRIPTOR_VERSION = "rekognition-v1";

function mapHighlightGroupRow(row: Record<string, unknown>): MemoryHighlightGroup {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    semanticKey: row.semantic_key as string,
    source: row.source as HighlightGroupSource,
    sortOrder: row.sort_order as number,
    isVisible: row.is_visible as boolean,
  };
}

function mapHighlightGenerationRow(row: Record<string, unknown>): MemoryHighlightGeneration {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    mode: row.mode as HighlightGenerationMode,
    status: row.status as HighlightGenerationStatus,
    mediaCount: row.media_count as number,
    errorCode: (row.error_code as string | null) ?? null,
    createdAt: row.created_at as string,
    publishedAt: (row.published_at as string | null) ?? null,
  };
}

// Upserts the reusable AI descriptor for one media item (labels extracted
// once, consumed by every future re-grouping run). Idempotent: re-running
// extraction for the same media item overwrites its prior descriptor rather
// than erroring or duplicating.
export async function upsertMemoryMediaDescriptor(input: {
  mediaId: string;
  labels: Array<{ name: string; confidence: number }>;
  embedding?: number[] | null;
  transcriptCues?: string[] | null;
}): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_media_descriptors").upsert(
    {
      media_id: input.mediaId,
      descriptor_version: DESCRIPTOR_VERSION,
      labels: input.labels,
      embedding: input.embedding ?? null,
      transcript_cues: input.transcriptCues ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "media_id" },
  );
  if (error) throw new Error(`failed to upsert memory_media_descriptor: ${error.message}`);
}

// Descriptors for every approved, uploaded media item in an event — the
// input set any classifier (fallback, dynamic, or host-defined) operates on.
// memory_media_descriptors has no event_id column of its own, so this scopes
// via the owning memory_media row.
//
// processing_status = 'ready' matches gallery.ts's listGalleryVisibleMedia's
// own eligibility filter exactly (see computeGalleryVisible). Without it, a
// media item that failed processing (processing_status = 'processing_failed')
// could still get a descriptor, count toward the dynamic-classification floor
// and regeneration interval, and be grouped — while remaining permanently
// invisible/unresolvable to guests, since the gallery/guest-highlights read
// path never surfaces it.
export async function listApprovedMemoryDescriptors(eventId: string): Promise<MemoryMediaDescriptor[]> {
  const client = createAdminClient();
  const { data: approvedMedia, error } = await client
    .from("memory_media")
    .select("id,media_kind")
    .eq("event_id", eventId)
    .eq("moderation_status", "approved")
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready");
  if (error) throw new Error(`failed to list approved memory media for descriptors: ${error.message}`);
  if (!approvedMedia || approvedMedia.length === 0) return [];

  const mediaKindById = new Map<string, MediaKind>();
  for (const row of approvedMedia) mediaKindById.set(row.id as string, row.media_kind as MediaKind);

  const { data: descriptorRows, error: descriptorError } = await client
    .from("memory_media_descriptors")
    .select("media_id,labels,embedding,transcript_cues")
    .in("media_id", Array.from(mediaKindById.keys()));
  if (descriptorError) throw new Error(`failed to list memory_media_descriptors: ${descriptorError.message}`);

  return (descriptorRows ?? []).map((row) => {
    const mediaId = row.media_id as string;
    return {
      mediaId,
      mediaKind: mediaKindById.get(mediaId) ?? "photo",
      labels: (row.labels as Array<{ name: string; confidence: number }>) ?? [],
      embedding: (row.embedding as number[] | undefined) ?? undefined,
      transcriptCues: (row.transcript_cues as string[] | undefined) ?? undefined,
    };
  });
}

export interface MemoryMediaSummary {
  mediaId: string;
  eventId: string;
  mediaKind: MediaKind;
  objectKeyDisplay: string | null;
}

// Approved, uploaded media that has no descriptor row yet — the backlog
// backfillMissingMemoryDescriptors works through (e.g. media approved before
// this feature existed, or a prior extraction attempt that failed).
export async function listApprovedMediaMissingDescriptors(eventId: string, limit: number): Promise<MemoryMediaSummary[]> {
  const client = createAdminClient();
  const { data: approvedMedia, error } = await client
    .from("memory_media")
    .select("id,event_id,media_kind,object_key_display")
    .eq("event_id", eventId)
    .eq("moderation_status", "approved")
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .order("uploaded_at", { ascending: true });
  if (error) throw new Error(`failed to list approved memory media: ${error.message}`);
  if (!approvedMedia || approvedMedia.length === 0) return [];

  const mediaIds = approvedMedia.map((row) => row.id as string);
  const { data: descriptorRows, error: descriptorError } = await client
    .from("memory_media_descriptors")
    .select("media_id")
    .in("media_id", mediaIds);
  if (descriptorError) throw new Error(`failed to list memory_media_descriptors: ${descriptorError.message}`);

  const describedIds = new Set((descriptorRows ?? []).map((row) => row.media_id as string));
  return approvedMedia
    .filter((row) => !describedIds.has(row.id as string))
    .slice(0, limit)
    .map((row) => ({
      mediaId: row.id as string,
      eventId: row.event_id as string,
      mediaKind: row.media_kind as MediaKind,
      objectKeyDisplay: (row.object_key_display as string | null) ?? null,
    }));
}

// The cron worker's periodic backfill pass doesn't know event ids up front
// the way every other caller in this file does — it has to discover the
// backlog across every event itself — so this is the one query here that
// deliberately does NOT scope by event_id.
//
// This calls a SQL RPC (059_memory_highlight_missing_descriptors_rpc.sql)
// instead of the fetch-then-filter-in-JS shape every other function in this
// file uses. That shape was tried here first and had a real bug: capping the
// initial "approved media" fetch at N rows (oldest upload first) and only
// filtering out already-described ones AFTER that fetch means any row past
// the Nth-oldest is never even considered once the oldest N are all
// described — which, since descriptors are attached synchronously at
// approval for almost every path already, is the normal steady state once
// total approved media crosses N. The query would then return [] forever,
// even with plenty of genuinely undescribed newer rows. Doing the "missing
// descriptor" test as a LEFT JOIN ... WHERE IS NULL in SQL, with LIMIT
// applied to that already-filtered result, has no such window to fall
// outside of. See the migration file for a fuller writeup, and
// listApprovedMediaMissingDescriptors just below for the per-event sibling
// this replaced shape was (unsuccessfully) modeled on — that one gets away
// with capping nothing because one event's approved-media count is itself
// bounded (MAX_MEDIA_PER_EVENT), a bound that doesn't exist across events.
export async function listApprovedMediaMissingDescriptorsAcrossEvents(limit: number): Promise<MemoryMediaSummary[]> {
  const client = createAdminClient();
  const { data, error } = await client.rpc("list_approved_media_missing_descriptors_across_events", { p_limit: limit });
  if (error) throw new Error(`failed to list approved memory media missing descriptors across events: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    mediaId: row.media_id as string,
    eventId: row.event_id as string,
    mediaKind: row.media_kind as MediaKind,
    objectKeyDisplay: (row.object_key_display as string | null) ?? null,
  }));
}

// Lists highlight group definitions for an event, optionally narrowed to one
// source (fallback/ai_generated/host_defined) — callers doing a
// semantic-key-keyed upsert always narrow by source, since
// (event_id, source, semantic_key) is the table's real uniqueness boundary.
export async function listMemoryHighlightGroups(eventId: string, source?: HighlightGroupSource): Promise<MemoryHighlightGroup[]> {
  const client = createAdminClient();
  let query = client.from("memory_highlight_groups").select("*").eq("event_id", eventId);
  if (source) query = query.eq("source", source);
  const { data, error } = await query.order("sort_order", { ascending: true });
  if (error) throw new Error(`failed to list memory_highlight_groups: ${error.message}`);
  return (data ?? []).map(mapHighlightGroupRow);
}

export async function createMemoryHighlightGroup(
  eventId: string,
  input: {
    name: string;
    description: string | null;
    semanticKey: string;
    source: HighlightGroupSource;
    sortOrder?: number;
    isVisible?: boolean;
  },
): Promise<MemoryHighlightGroup> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_highlight_groups")
    .insert({
      event_id: eventId,
      name: input.name,
      description: input.description,
      semantic_key: input.semanticKey,
      source: input.source,
      sort_order: input.sortOrder ?? 0,
      is_visible: input.isVisible ?? true,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`failed to create memory_highlight_group: ${error?.message}`);
  return mapHighlightGroupRow(data);
}

// Patches only the provided fields. sortOrder/isVisible are intentionally
// separate, narrow updates from name/description — callers that only want to
// refresh AI-authored copy (regeneration) must not accidentally also touch
// host-controlled ordering/visibility state by passing those keys.
export async function updateMemoryHighlightGroup(
  eventId: string,
  groupId: string,
  updates: { name?: string; description?: string | null; sortOrder?: number; isVisible?: boolean },
): Promise<void> {
  const client = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.sortOrder !== undefined) patch.sort_order = updates.sortOrder;
  if (updates.isVisible !== undefined) patch.is_visible = updates.isVisible;
  const { error } = await client.from("memory_highlight_groups").update(patch).eq("id", groupId).eq("event_id", eventId);
  if (error) throw new Error(`failed to update memory_highlight_group: ${error.message}`);
}

export async function deleteMemoryHighlightGroup(eventId: string, groupId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_highlight_groups").delete().eq("id", groupId).eq("event_id", eventId);
  if (error) throw new Error(`failed to delete memory_highlight_group: ${error.message}`);
}

// Task 6 addition (host-facing mode toggle): the one write Task 4 never
// needed, since its own callers only ever READ highlight_mode (via
// getHighlightGenerationState) to decide which classifier to run. Mirrors
// updateEventMemoriesSettings's shape one column over.
export async function updateEventHighlightMode(eventId: string, mode: HighlightMode): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("invitation_events").update({ highlight_mode: mode }).eq("id", eventId);
  if (error) throw new Error(`failed to update event highlight mode: ${error.message}`);
}

// Task 6 addition: the host-facing groups list, unlike
// getPublishedMemoryHighlights, must show ALL of the host's own group
// definitions regardless of the currently published generation (a group the
// host just created, or one left over from a prior stint in host_defined
// mode, must still be visible/manageable) and is never filtered by
// is_visible (the host is the one toggling that flag, so a hidden group must
// still appear here). Each group is annotated with how many media items are
// currently assigned to it under the event's published generation — 0 for a
// brand-new group, or for any group when nothing has published yet.
export async function listHostDefinedHighlightGroupsWithCounts(
  eventId: string,
): Promise<Array<MemoryHighlightGroup & { mediaCount: number }>> {
  const groups = await listMemoryHighlightGroups(eventId, "host_defined");
  if (groups.length === 0) return [];

  const client = createAdminClient();
  const { data: eventRow, error: eventError } = await client
    .from("invitation_events")
    .select("published_highlight_generation_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new Error(`failed to load event for highlight group counts: ${eventError.message}`);

  const generationId = (eventRow?.published_highlight_generation_id as string | null) ?? null;
  if (!generationId) return groups.map((group) => ({ ...group, mediaCount: 0 }));

  const groupIds = groups.map((group) => group.id);
  const { data: membershipRows, error: membershipError } = await client
    .from("memory_highlight_media")
    .select("group_id")
    .eq("generation_id", generationId)
    .in("group_id", groupIds);
  if (membershipError) throw new Error(`failed to count memory_highlight_media: ${membershipError.message}`);

  const counts = new Map<string, number>();
  for (const row of membershipRows ?? []) {
    const groupId = row.group_id as string;
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  return groups.map((group) => ({ ...group, mediaCount: counts.get(group.id) ?? 0 }));
}

// invitation_events' highlight_generation_status has no 'published' value —
// a generation reaching 'published' resets the event's own status column
// back to 'idle' (see the publish RPC), so this event-level enum is
// deliberately narrower than HighlightGenerationStatus (which describes one
// generation row's own lifecycle, published included).
export type EventHighlightGenerationStatus = "idle" | "queued" | "processing" | "failed";

export interface HighlightGenerationState {
  highlightMode: HighlightMode;
  publishedGenerationId: string | null;
  pendingGenerationId: string | null;
  generationStatus: EventHighlightGenerationStatus;
  lastGeneratedMediaCount: number;
  // The short, machine-readable code failHighlightGeneration/
  // reclaimStaleHighlightGeneration persist to invitation_events on failure
  // (e.g. "EMPTY_OUTPUT", "TIMEOUT") — previously write-only: nothing read
  // this column back, so the host UI could only ever show a generic "the
  // last attempt failed" with no detail, even for a genuinely informative
  // case like missing descriptors.
  generationError: string | null;
}

// The event-level highlight settings/state shouldQueueHighlightGeneration's
// policy inputs are built from.
export async function getHighlightGenerationState(eventId: string): Promise<HighlightGenerationState | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select(
      "highlight_mode,published_highlight_generation_id,pending_highlight_generation_id,highlight_generation_status,highlight_last_generated_media_count,highlight_generation_error",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    highlightMode: data.highlight_mode as HighlightMode,
    publishedGenerationId: (data.published_highlight_generation_id as string | null) ?? null,
    pendingGenerationId: (data.pending_highlight_generation_id as string | null) ?? null,
    generationStatus: data.highlight_generation_status as EventHighlightGenerationStatus,
    lastGeneratedMediaCount: data.highlight_last_generated_media_count as number,
    generationError: (data.highlight_generation_error as string | null) ?? null,
  };
}

// Task 6 addition: the single read the host Highlights management route
// needs — composes getHighlightGenerationState (mode/settings/generation
// status) with listHostDefinedHighlightGroupsWithCounts (groups + counts) so
// both the route handler and the Memories page's server-rendered initial
// props load from one place rather than duplicating this composition. Returns
// null exactly when getHighlightGenerationState does (event not found).
export interface HostHighlightsOverview {
  mode: HighlightMode;
  generationStatus: EventHighlightGenerationStatus;
  pendingGenerationId: string | null;
  publishedGenerationId: string | null;
  lastGeneratedMediaCount: number;
  generationError: string | null;
  groups: Array<MemoryHighlightGroup & { mediaCount: number }>;
}

export async function getHostHighlightsOverview(eventId: string): Promise<HostHighlightsOverview | null> {
  const state = await getHighlightGenerationState(eventId);
  if (!state) return null;
  const groups = await listHostDefinedHighlightGroupsWithCounts(eventId);
  return {
    mode: state.highlightMode,
    generationStatus: state.generationStatus,
    pendingGenerationId: state.pendingGenerationId,
    publishedGenerationId: state.publishedGenerationId,
    lastGeneratedMediaCount: state.lastGeneratedMediaCount,
    generationError: state.generationError,
    groups,
  };
}

// Inserts a new queued generation and points the event at it. If a
// queued/processing generation already exists for this event, the
// memory_highlight_generations_one_pending_idx unique index rejects the
// insert (surfaced here as a thrown error) — callers are expected to check
// HighlightGenerationState.pendingGenerationId first via
// shouldQueueHighlightGeneration's hasPendingGeneration input, so this should
// only ever fire on a genuine race between two concurrent callers.
export async function queueHighlightGeneration(eventId: string, mode: HighlightGenerationMode): Promise<MemoryHighlightGeneration> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_highlight_generations")
    .insert({ event_id: eventId, mode, status: "queued", media_count: 0 })
    .select("*")
    .single();
  if (error || !data) throw new Error(`failed to queue highlight generation: ${error?.message}`);

  const generation = mapHighlightGenerationRow(data);

  const { error: eventError } = await client
    .from("invitation_events")
    .update({
      pending_highlight_generation_id: generation.id,
      highlight_generation_status: "queued",
      highlight_generation_error: null,
    })
    .eq("id", eventId);
  if (eventError) throw new Error(`failed to update event pending highlight pointer: ${eventError.message}`);

  return generation;
}

// Up to `limit` generations still waiting to be processed, across ALL events
// — the cross-event discovery step the cron worker needs before it can call
// claimNextHighlightGeneration/processHighlightGeneration on a specific row
// (both take a generationId already in hand; neither one discovers work on
// its own). Ordered oldest-first and NOT filtered by any staleness cutoff —
// unlike reclaimStaleHighlightGeneration's 'processing' reclaim, a 'queued'
// row is never something to wait out: every run should consider it, so a row
// left queued because a prior invocation crashed before ever calling
// processHighlightGeneration on it is picked up on the very next run rather
// than needing its own separate reclaim path.
export async function listQueuedHighlightGenerations(limit: number): Promise<MemoryHighlightGeneration[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_highlight_generations")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`failed to list queued highlight generations: ${error.message}`);
  return (data ?? []).map(mapHighlightGenerationRow);
}

// Atomically claims one specific queued generation for processing: a single
// UPDATE ... WHERE status = 'queued' is Postgres's own compare-and-swap, so
// two concurrent callers (or the same generationId processed twice) can never
// both receive a non-null row back — the second finds 0 rows matched and gets
// null. This is what makes repeated processing of an already-claimed
// generation (already processing, already published, already failed) a safe
// no-op at the repository layer, before any classifier work is attempted.
export async function claimNextHighlightGeneration(generationId: string): Promise<MemoryHighlightGeneration | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_highlight_generations")
    .update({ status: "processing" })
    .eq("id", generationId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`failed to claim highlight generation: ${error.message}`);
  if (!data) return null;

  const generation = mapHighlightGenerationRow(data);
  const { error: eventError } = await client
    .from("invitation_events")
    .update({ highlight_generation_status: "processing" })
    .eq("id", generation.eventId)
    .eq("pending_highlight_generation_id", generation.id);
  if (eventError) throw new Error(`failed to mark event highlight generation processing: ${eventError.message}`);

  return generation;
}

// Replaces the full membership set for one generation: clears whatever rows
// already exist for it (a no-op on a fresh generationId, but makes a retried
// partial write idempotent) and inserts the new set. ignoreDuplicates guards
// against the input itself containing a repeated (group, media) pair.
export async function replaceHighlightGenerationMemberships(
  generationId: string,
  memberships: Array<{ groupId: string; mediaId: string }>,
): Promise<void> {
  const client = createAdminClient();
  const { error: deleteError } = await client.from("memory_highlight_media").delete().eq("generation_id", generationId);
  if (deleteError) throw new Error(`failed to clear memory_highlight_media for generation: ${deleteError.message}`);
  if (memberships.length === 0) return;

  const { error: insertError } = await client.from("memory_highlight_media").upsert(
    memberships.map((membership) => ({
      generation_id: generationId,
      group_id: membership.groupId,
      media_id: membership.mediaId,
    })),
    { onConflict: "generation_id,group_id,media_id", ignoreDuplicates: true },
  );
  if (insertError) throw new Error(`failed to insert memory_highlight_media rows: ${insertError.message}`);
}

// The only way a generation is ever marked published — a single SQL RPC
// (058_memory_highlight_grouping.sql) that verifies the generation belongs to
// the event and is still processing, then atomically publishes it and
// updates the event's published pointer/count/status/pending-clear in one
// statement. Never hand-roll separate UPDATEs to simulate this.
export async function publishHighlightGeneration(eventId: string, generationId: string, mediaCount: number): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.rpc("publish_memory_highlight_generation", {
    p_event_id: eventId,
    p_generation_id: generationId,
    p_media_count: mediaCount,
  });
  if (error) throw new Error(`failed to publish highlight generation: ${error.message}`);
}

// Records a failed generation attempt with a short, machine-readable error
// code. Deliberately never touches published_highlight_generation_id or
// highlight_last_generated_media_count — a failed regeneration must never
// clobber the generation guests are still seeing. Scoped to
// status = 'processing' so this can only ever transition a generation that is
// genuinely still in-flight: if the publish RPC actually committed but the
// caller saw a transport error (a real possible race), this must not flip an
// already-published generation's status back to failed.
export async function failHighlightGeneration(eventId: string, generationId: string, errorCode: string): Promise<void> {
  const client = createAdminClient();
  const { data, error: generationError } = await client
    .from("memory_highlight_generations")
    .update({ status: "failed", error_code: errorCode })
    .eq("id", generationId)
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (generationError) throw new Error(`failed to mark highlight generation failed: ${generationError.message}`);
  // No row matched — the generation was no longer 'processing' (e.g. it had
  // already published). Nothing to fail, and the event row must not be
  // touched either (it may already correctly reflect a different, newer
  // generation).
  if (!data) return;

  const { error: eventError } = await client
    .from("invitation_events")
    .update({
      highlight_generation_status: "failed",
      highlight_generation_error: errorCode,
      pending_highlight_generation_id: null,
    })
    .eq("id", eventId);
  if (eventError) throw new Error(`failed to update event highlight failure state: ${eventError.message}`);
}

// Reclaims a generation stuck in 'processing' past a staleness threshold
// (e.g. the worker that claimed it crashed mid-run — a Vercel function
// timeout during the Anthropic call is a realistic cause) by marking it
// failed with a TIMEOUT error code. Without this, Task 1's partial unique
// index (one queued-or-processing generation per event) would permanently
// block that event from ever queuing another generation. Scoped to
// status = 'processing' AND created_at older than the cutoff in a single
// atomic UPDATE — the same compare-and-swap shape as claimNextHighlightGeneration —
// so a generation that is merely still legitimately running (or has already
// resolved to published/failed) is left untouched.
export async function reclaimStaleHighlightGeneration(
  generationId: string,
  staleAfterMs: number,
): Promise<MemoryHighlightGeneration | null> {
  const client = createAdminClient();
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const { data, error } = await client
    .from("memory_highlight_generations")
    .update({ status: "failed", error_code: "TIMEOUT" })
    .eq("id", generationId)
    .eq("status", "processing")
    .lt("created_at", cutoff)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`failed to reclaim stale highlight generation: ${error.message}`);
  if (!data) return null;

  const generation = mapHighlightGenerationRow(data);
  const { error: eventError } = await client
    .from("invitation_events")
    .update({
      highlight_generation_status: "failed",
      highlight_generation_error: "TIMEOUT",
      pending_highlight_generation_id: null,
    })
    .eq("id", generation.eventId);
  if (eventError) throw new Error(`failed to update event after reclaiming stale highlight generation: ${eventError.message}`);

  return generation;
}

// Pure eligibility decision, factored out of getPublishedMemoryHighlights so
// it can be unit-tested directly with plain objects (no Supabase call, real
// or fake, needed to prove this logic correct).
//
// Eligibility is keyed off the PUBLISHED GENERATION's own mode — not each
// group's own source in isolation. The two are easy to conflate but are not
// the same thing: a host can switch from host_defined mode back to automatic
// mode, at which point a fresh fallback/automatic generation publishes while
// the OLD host_defined group rows still exist (group definitions are never
// deleted by a mode switch, only superseded). If eligibility looked at each
// group's own `source` alone, those old host_defined groups would stay
// unconditionally visible forever — including as permanent empty "0 photos"
// cards, since they have no membership under the new generation at all —
// because `source === "host_defined"` is true regardless of which
// generation is actually published.
//
//   - When the published generation's mode is "host_defined": eligible
//     groups are exactly the event's host_defined groups, empty ones
//     included — a host-defined group is managed directly by the host
//     through their own UI, independent of any generation run, so a
//     temporarily-empty one (e.g. a placeholder gallery set up ahead of
//     time) is still legitimately shown.
//   - Otherwise (mode is "fallback" or "automatic"): eligible groups are
//     only fallback/ai_generated groups with at least one member in THIS
//     generation specifically. A fallback/ai_generated group only ever
//     exists because some generation run produced it — one with no
//     membership row under the currently published generation is a stale
//     leftover (e.g. from a fallback-to-dynamic mode switch, or a run that
//     created the group but never went on to publish) and must not surface
//     to guests as an empty tab. host_defined groups are never eligible in
//     this branch, however many members they might still carry from a prior
//     stint in host_defined mode — the whole point of this fix.
export function selectEligibleHighlightGroups(
  generationMode: HighlightGenerationMode,
  groups: MemoryHighlightGroup[],
  mediaIdsByGroup: Map<string, string[]>,
): MemoryHighlightGroup[] {
  if (generationMode === "host_defined") {
    return groups.filter((group) => group.source === "host_defined");
  }
  return groups.filter((group) => group.source !== "host_defined" && (mediaIdsByGroup.get(group.id)?.length ?? 0) > 0);
}

// Returns a generation from 'processing' back to 'queued' in place — same
// row, same id, event's pending pointer untouched (it already points at this
// generation) — for processHighlightGeneration's descriptor-readiness wait:
// this generation's approved media isn't fully descriptor-backfilled yet, so
// classification must wait rather than run against a partial/empty
// descriptor set and terminally fail with EMPTY_HIGHLIGHT_OUTPUT. The next
// cron tick reclaims this same queued row (listQueuedHighlightGenerations has
// no staleness cutoff — see its own comment) and retries. Same
// compare-and-swap shape as claimNextHighlightGeneration/
// reclaimStaleHighlightGeneration: scoped to status = 'processing' so a
// generation a concurrent caller already resolved (published/failed/reclaimed
// as stale) is left untouched. Returns whether it actually requeued the row.
export async function requeueHighlightGeneration(eventId: string, generationId: string): Promise<boolean> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_highlight_generations")
    .update({ status: "queued" })
    .eq("id", generationId)
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`failed to requeue highlight generation: ${error.message}`);
  if (!data) return false;

  const { error: eventError } = await client
    .from("invitation_events")
    .update({ highlight_generation_status: "queued" })
    .eq("id", eventId)
    .eq("pending_highlight_generation_id", generationId);
  if (eventError) throw new Error(`failed to update event highlight status after requeue: ${eventError.message}`);
  return true;
}

// The guest-facing read model: the event's currently published generation's
// visible groups and their media membership. Membership is scoped to the
// published generation specifically (memory_highlight_media rows persist
// across generations until their owning generation row is deleted), and
// groups are scoped to is_visible so a host-hidden group never surfaces here.
// See selectEligibleHighlightGroups above for the mode-aware eligibility
// rule beyond is_visible.
export async function getPublishedMemoryHighlights(eventId: string): Promise<PublishedMemoryHighlights> {
  const client = createAdminClient();
  const { data: eventRow, error: eventError } = await client
    .from("invitation_events")
    .select("published_highlight_generation_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new Error(`failed to load event for published highlights: ${eventError.message}`);

  const generationId = (eventRow?.published_highlight_generation_id as string | null) ?? null;
  if (!generationId) return { generationId: null, groups: [] };

  // The published generation's own mode is the eligibility key (see
  // selectEligibleHighlightGroups) — not each group's own source. Defaults
  // to "automatic" only if the generation row is somehow missing (should
  // never happen for a real published_highlight_generation_id, since that
  // column is a foreign key into this same table), which is the safer
  // fallback: it never lets a stale host_defined group leak.
  const { data: generationRow, error: generationError } = await client
    .from("memory_highlight_generations")
    .select("mode")
    .eq("id", generationId)
    .maybeSingle();
  if (generationError) throw new Error(`failed to load published highlight generation: ${generationError.message}`);
  const generationMode = (generationRow?.mode as HighlightGenerationMode | undefined) ?? "automatic";

  const { data: groupRows, error: groupError } = await client
    .from("memory_highlight_groups")
    .select("*")
    .eq("event_id", eventId)
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });
  if (groupError) throw new Error(`failed to list memory_highlight_groups: ${groupError.message}`);

  const groups = (groupRows ?? []).map(mapHighlightGroupRow);
  if (groups.length === 0) return { generationId, groups: [] };

  const groupIds = groups.map((group) => group.id);
  const { data: membershipRows, error: membershipError } = await client
    .from("memory_highlight_media")
    .select("group_id,media_id")
    .eq("generation_id", generationId)
    .in("group_id", groupIds);
  if (membershipError) throw new Error(`failed to list memory_highlight_media: ${membershipError.message}`);

  const mediaIdsByGroup = new Map<string, string[]>();
  for (const group of groups) mediaIdsByGroup.set(group.id, []);
  for (const row of membershipRows ?? []) {
    const list = mediaIdsByGroup.get(row.group_id as string);
    if (list) list.push(row.media_id as string);
  }

  const eligibleGroups = selectEligibleHighlightGroups(generationMode, groups, mediaIdsByGroup);

  return {
    generationId,
    groups: eligibleGroups.map((group) => ({ group, mediaIds: mediaIdsByGroup.get(group.id) ?? [] })),
  };
}
