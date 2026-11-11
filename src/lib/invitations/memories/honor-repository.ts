import { createAdminClient } from "@/lib/supabase/admin";
import { mapRow } from "./repository";
import type { MemoryMedia } from "./types";
import type { HonorMatch, HonorPerson } from "./guests-of-honor";

export type HonorSetStatus = "draft" | "processing" | "ready";
export type HonorSourceKind = "event_site" | "upload";

export interface HonorSetRecord {
  id: string;
  eventId: string;
  status: HonorSetStatus;
  sourceKind: HonorSourceKind;
  sourceRef: string | null;
  sourceObjectKey: string | null;
  consentedAt: string | null;
  lastError: string | null;
}

export interface HonoreeRecord extends HonorPerson {
  honorSetId: string;
  eventId: string;
  faceIndex: number;
  box: { left: number; top: number; width: number; height: number };
  cropObjectKey: string | null;
}

export interface HonorBundle {
  set: HonorSetRecord;
  honorees: HonoreeRecord[];
  matches: HonorMatch[];
}

function asRow(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function mapSet(row: Record<string, unknown>): HonorSetRecord {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    status: row.status as HonorSetStatus,
    sourceKind: row.source_kind as HonorSourceKind,
    sourceRef: (row.source_ref as string | null) ?? null,
    sourceObjectKey: (row.source_object_key as string | null) ?? null,
    consentedAt: (row.consented_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
  };
}

function mapHonoree(row: Record<string, unknown>): HonoreeRecord {
  return {
    id: String(row.id),
    honorSetId: String(row.honor_set_id),
    eventId: String(row.event_id),
    name: String(row.display_name ?? ""),
    roleKey: String(row.role_key),
    selected: Boolean(row.selected),
    faceIndex: Number(row.face_index),
    box: {
      left: Number(row.box_left),
      top: Number(row.box_top),
      width: Number(row.box_width),
      height: Number(row.box_height),
    },
    cropObjectKey: (row.crop_object_key as string | null) ?? null,
  };
}

function mapMatch(row: Record<string, unknown>): HonorMatch {
  return {
    mediaId: String(row.media_id),
    honoreeId: String(row.honoree_id),
    excluded: Boolean(row.excluded),
    similarity: Number(row.similarity),
  };
}

export async function getHonorBundle(eventId: string): Promise<HonorBundle | null> {
  const client = createAdminClient();
  const { data, error } = await client.from("memory_honor_sets").select("*").eq("event_id", eventId).maybeSingle();
  if (error) throw new Error(`failed to load guests of honor: ${error.message}`);
  if (!data) return null;
  const set = mapSet(asRow(data));
  const [honoreeResult, matchResult] = await Promise.all([
    client.from("memory_honorees").select("*").eq("honor_set_id", set.id).order("face_index", { ascending: true }),
    client.from("memory_honor_matches").select("*").eq("event_id", eventId),
  ]);
  if (honoreeResult.error) throw new Error(`failed to load honorees: ${honoreeResult.error.message}`);
  if (matchResult.error) throw new Error(`failed to load honor matches: ${matchResult.error.message}`);
  return {
    set,
    honorees: (honoreeResult.data ?? []).map((row) => mapHonoree(asRow(row))),
    matches: (matchResult.data ?? []).map((row) => mapMatch(asRow(row))),
  };
}

export async function saveHonorDraft(input: {
  eventId: string;
  sourceKind: HonorSourceKind;
  sourceRef: string | null;
  sourceObjectKey: string;
  faces: Array<{
    faceIndex: number;
    roleKey: string;
    box: { left: number; top: number; width: number; height: number };
    cropObjectKey: string;
  }>;
}): Promise<HonorBundle> {
  const client = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("memory_honor_sets")
    .upsert({
      event_id: input.eventId,
      status: "draft",
      source_kind: input.sourceKind,
      source_ref: input.sourceRef,
      source_object_key: input.sourceObjectKey,
      consented_at: null,
      last_error: null,
      updated_at: now,
    }, { onConflict: "event_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`failed to save guests of honor: ${error?.message ?? "missing row"}`);
  const set = mapSet(asRow(data));
  const { error: deleteError } = await client.from("memory_honorees").delete().eq("honor_set_id", set.id);
  if (deleteError) throw new Error(`failed to replace honorees: ${deleteError.message}`);
  if (input.faces.length > 0) {
    const { error: insertError } = await client.from("memory_honorees").insert(input.faces.map((face) => ({
      honor_set_id: set.id,
      event_id: input.eventId,
      display_name: "",
      role_key: face.roleKey,
      selected: true,
      face_index: face.faceIndex,
      box_left: face.box.left,
      box_top: face.box.top,
      box_width: face.box.width,
      box_height: face.box.height,
      crop_object_key: face.cropObjectKey,
    })));
    if (insertError) throw new Error(`failed to save detected faces: ${insertError.message}`);
  }
  return (await getHonorBundle(input.eventId)) ?? { set, honorees: [], matches: [] };
}

export async function updateHonorConfirmation(input: {
  eventId: string;
  faces: Array<{ index: number; name: string; roleKey: string; selected: boolean }>;
  consent: boolean;
}): Promise<void> {
  const client = createAdminClient();
  const bundle = await getHonorBundle(input.eventId);
  if (!bundle) throw new Error("guests of honor are not set");
  for (const face of input.faces) {
    const row = bundle.honorees.find((honoree) => honoree.faceIndex === face.index);
    if (!row) throw new Error("face is no longer on this photo");
    const { error } = await client.from("memory_honorees").update({
      display_name: face.selected ? face.name : "",
      role_key: face.roleKey,
      selected: face.selected,
    }).eq("id", row.id);
    if (error) throw new Error(`failed to update honoree: ${error.message}`);
  }
  const { error } = await client.from("memory_honor_sets").update({
    status: "processing",
    consented_at: input.consent ? new Date().toISOString() : null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", bundle.set.id);
  if (error) throw new Error(`failed to update guests of honor: ${error.message}`);
}

export async function setHonorStatus(eventId: string, status: HonorSetStatus, lastError: string | null): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_honor_sets").update({
    status,
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }).eq("event_id", eventId);
  if (error) throw new Error(`failed to update guests of honor status: ${error.message}`);
}

export function honorMatchIsLocked(excluded: boolean | null | undefined): boolean {
  return excluded === true;
}

export async function insertHonorMatchIfNew(eventId: string, match: { honoreeId: string; mediaId: string; similarity: number }): Promise<void> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_honor_matches")
    .select("id, excluded")
    .eq("honoree_id", match.honoreeId)
    .eq("media_id", match.mediaId)
    .maybeSingle();
  if (error) throw new Error(`failed to read honor match: ${error.message}`);
  const existing = data ? asRow(data) : null;
  if (honorMatchIsLocked(existing?.excluded as boolean | undefined)) return;
  if (existing) {
    const { error: updateError } = await client.from("memory_honor_matches").update({ similarity: match.similarity }).eq("id", existing.id);
    if (updateError) throw new Error(`failed to update honor match: ${updateError.message}`);
    return;
  }
  const { error: insertError } = await client.from("memory_honor_matches").insert({
    event_id: eventId,
    honoree_id: match.honoreeId,
    media_id: match.mediaId,
    similarity: match.similarity,
    excluded: false,
  });
  if (insertError) throw new Error(`failed to save honor match: ${insertError.message}`);
}

export async function excludeHonorMedia(eventId: string, mediaId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_honor_matches")
    .update({ excluded: true })
    .eq("event_id", eventId)
    .eq("media_id", mediaId);
  if (error) throw new Error(`failed to exclude honor match: ${error.message}`);
}

export async function deleteHonorRows(eventId: string): Promise<string[]> {
  const bundle = await getHonorBundle(eventId);
  if (!bundle) return [];
  const keys = [
    bundle.set.sourceObjectKey,
    ...bundle.honorees.map((honoree) => honoree.cropObjectKey),
  ].filter((key): key is string => Boolean(key));
  const client = createAdminClient();
  const { error } = await client.from("memory_honor_sets").delete().eq("event_id", eventId);
  if (error) throw new Error(`failed to remove guests of honor: ${error.message}`);
  return keys;
}

export async function listHonorCandidates(eventId: string): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .or("has_faces.is.null,has_faces.eq.true");
  if (error || !data) return [];
  return data.map((row) => mapRow(asRow(row)));
}

export interface HonorEventContext {
  eventType: string;
  coverImagePath: string | null;
  designedInvitePath: string | null;
}

export async function getHonorEventContext(eventId: string): Promise<HonorEventContext | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("event_type, cover_image_path, designed_invite_path")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`failed to load event for guests of honor: ${error.message}`);
  if (!data) return null;
  const row = asRow(data);
  return {
    eventType: String(row.event_type ?? "other"),
    coverImagePath: (row.cover_image_path as string | null) ?? null,
    designedInvitePath: (row.designed_invite_path as string | null) ?? null,
  };
}

export async function countGalleryPhotos(eventId: string): Promise<number> {
  const client = createAdminClient();
  const { count, error } = await client
    .from("memory_media")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .eq("media_kind", "photo");
  if (error) return 0;
  return count ?? 0;
}
