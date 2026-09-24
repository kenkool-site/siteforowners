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

export async function listMomentOverridesForEvent(momentIds: string[]): Promise<Record<string, string>> {
  if (momentIds.length === 0) return {};
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_moment_media")
    .select("media_id, moment_id")
    .in("moment_id", momentIds);
  if (error || !data) return {};
  const overrides: Record<string, string> = {};
  for (const row of data) overrides[row.media_id as string] = row.moment_id as string;
  return overrides;
}

export async function setAiClassifiedMoment(mediaId: string, momentId: string): Promise<void> {
  const client = createAdminClient();
  // ignoreDuplicates: media_id is the table's sole primary key, so this never
  // overwrites a row that already exists — whether an earlier AI classification
  // (idempotent under retry) or a host's manual override, which must always win.
  const { error } = await client
    .from("memory_moment_media")
    .upsert({ media_id: mediaId, moment_id: momentId, source: "ai_classified" }, { onConflict: "media_id", ignoreDuplicates: true });
  if (error) throw new Error(`failed to set AI-classified moment: ${error.message}`);
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
export async function listApprovedMemoryDescriptors(eventId: string): Promise<MemoryMediaDescriptor[]> {
  const client = createAdminClient();
  const { data: approvedMedia, error } = await client
    .from("memory_media")
    .select("id,media_kind")
    .eq("event_id", eventId)
    .eq("moderation_status", "approved")
    .eq("upload_status", "uploaded");
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
}

// The event-level highlight settings/state shouldQueueHighlightGeneration's
// policy inputs are built from.
export async function getHighlightGenerationState(eventId: string): Promise<HighlightGenerationState | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select(
      "highlight_mode,published_highlight_generation_id,pending_highlight_generation_id,highlight_generation_status,highlight_last_generated_media_count",
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

// The guest-facing read model: the event's currently published generation's
// visible groups and their media membership. Membership is scoped to the
// published generation specifically (memory_highlight_media rows persist
// across generations until their owning generation row is deleted), and
// groups are scoped to is_visible so a host-hidden group never surfaces here.
//
// Source-aware eligibility, beyond is_visible: host_defined groups are
// created and managed directly by the host through their own UI, independent
// of any generation run, so a temporarily-empty one (e.g. a placeholder
// gallery the host set up ahead of time) is still legitimately shown.
// fallback/ai_generated groups only ever exist because SOME generation run
// produced them — one with no membership row under the CURRENTLY PUBLISHED
// generation specifically (not "any generation, ever") is a stale leftover
// from a prior mode switch (e.g. an event crossing the dynamic floor and
// moving from fallback to ai_generated groups) or from a run that created the
// group but never went on to publish, and must not surface to guests as an
// empty tab.
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

  const eligibleGroups = groups.filter(
    (group) => group.source === "host_defined" || (mediaIdsByGroup.get(group.id)?.length ?? 0) > 0,
  );

  return {
    generationId,
    groups: eligibleGroups.map((group) => ({ group, mediaIds: mediaIdsByGroup.get(group.id) ?? [] })),
  };
}
