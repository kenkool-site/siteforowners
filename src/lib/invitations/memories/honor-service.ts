import { createAdminClient } from "@/lib/supabase/admin";
import {
  INVITATION_IMAGE_MAX_BYTES,
  INVITATION_MEDIA_BUCKET,
  getSignedInvitationMedia,
  isInvitationMediaPathForEvent,
  type InvitationMediaKind,
} from "@/lib/invitations/media";
import sharp from "sharp";
import { RekognitionAIProvider, type AIProvider } from "./ai-provider";
import { listGalleryVisibleMedia, toPublicMemoryMedia } from "./gallery";
import {
  buildHonorReview,
  buildPublicHonor,
  honorProfileForEventType,
  suggestRoleKeys,
  validateHonorConfirmation,
  type HonorFaceDraft,
  type HonorMediaRef,
  type HostHonorFace,
  type HostHonorState,
  type PublicHonorView,
} from "./guests-of-honor";
import { HONOR_SIMILARITY_THRESHOLD, compareHonoreeCrops, cropFaceJpeg, facesLeftToRight, type FaceBox } from "./honor-faces";
import {
  countGalleryPhotos,
  deleteHonorRows,
  excludeHonorMedia,
  getHonorBundle,
  getHonorEventContext,
  insertHonorMatchIfNew,
  listHonorCandidates,
  saveHonorDraft,
  setHonorStatus,
  updateHonorConfirmation,
  type HonorBundle,
  type HonoreeRecord,
} from "./honor-repository";
import { deriveObjectKeys } from "./processing-provider";
import { getMemoryMediaById } from "./repository";
import { R2StorageProvider, type StorageProvider } from "./storage-provider";
import type { MemoryMedia } from "./types";

const MAX_FACES = 12;

export function honorReferenceKey(eventId: string): string {
  return `honors/${eventId}/reference.jpg`;
}

export function honorCropKey(eventId: string, index: number): string {
  return `honors/${eventId}/face-${index}.jpg`;
}

export function honorStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface EventSitePhoto {
  ref: string;
  kind: "cover" | "gallery" | "designed_invite";
  label: string;
  url: string;
}

export type { HostHonorFace, HostHonorState };

function faceFromRecord(row: HonoreeRecord): HostHonorFace {
  return {
    index: row.faceIndex,
    name: row.name,
    roleKey: row.roleKey,
    selected: row.selected,
    box: row.box,
  };
}

export function hostStateFromBundle(bundle: HonorBundle | null, photoCount: number): HostHonorState {
  if (!bundle) return { status: "empty", faces: [], photoCount, review: null, lastError: null };
  const review = bundle.set.status === "ready"
    ? buildHonorReview(bundle.honorees, bundle.matches)
    : null;
  return {
    status: bundle.set.status,
    faces: bundle.honorees.map(faceFromRecord),
    photoCount,
    review,
    lastError: bundle.set.lastError,
  };
}

export function assertHonorImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
  if (bytes.byteLength < 16 || bytes.byteLength > INVITATION_IMAGE_MAX_BYTES) {
    throw new Error("photo must be a JPEG, PNG, or WebP under 10MB");
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const riff = String.fromCharCode(...Array.from(bytes.subarray(0, 4)));
  const webp = String.fromCharCode(...Array.from(bytes.subarray(8, 12)));
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  throw new Error("photo must be a JPEG, PNG, or WebP under 10MB");
}

async function downloadStorageObject(storage: StorageProvider, key: string): Promise<Uint8Array> {
  const url = await storage.getSignedDownloadUrl(key, 60);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed with status ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function storeReferenceAndCrops(
  eventId: string,
  bytes: Uint8Array,
  sourceKind: "event_site" | "upload",
  sourceRef: string | null,
  storage: StorageProvider,
  provider: AIProvider,
): Promise<HonorBundle> {
  if (!storage.putObject) throw new Error("storage cannot store the reference photo");
  if (!provider.detectFaceBoxes) throw new Error("face detection is unavailable");
  const boxes = facesLeftToRight(await provider.detectFaceBoxes(bytes)).slice(0, MAX_FACES);
  if (boxes.length === 0) {
    const error = new Error("no faces found");
    error.name = "HonorNoFaces";
    throw error;
  }
  const previous = await getHonorBundle(eventId);
  const staleKeys = previous
    ? [previous.set.sourceObjectKey, ...previous.honorees.map((face) => face.cropObjectKey)].filter((key): key is string => Boolean(key))
    : [];
  const referenceKey = honorReferenceKey(eventId);
  const referenceJpeg = new Uint8Array(await sharp(bytes, { failOn: "none" }).rotate().jpeg({ quality: 85 }).toBuffer());
  await storage.putObject(referenceKey, referenceJpeg, "image/jpeg");
  const event = await getHonorEventContext(eventId);
  const roles = suggestRoleKeys(honorProfileForEventType(event?.eventType), boxes.length);
  const faces: Array<{ faceIndex: number; roleKey: string; box: FaceBox; cropObjectKey: string }> = [];
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    const cropKey = honorCropKey(eventId, index);
    const crop = await cropFaceJpeg(bytes, box);
    await storage.putObject(cropKey, crop, "image/jpeg");
    faces.push({ faceIndex: index, roleKey: roles[index] ?? "guest_of_honor", box, cropObjectKey: cropKey });
  }
  const bundle = await saveHonorDraft({ eventId, sourceKind, sourceRef, sourceObjectKey: referenceKey, faces });
  for (const key of staleKeys) {
    if (key === referenceKey || faces.some((face) => face.cropObjectKey === key)) continue;
    try { await storage.deleteObject(key); } catch (error) {
      console.error("[guests-of-honor] failed to delete a replaced crop", { key, error });
    }
  }
  return bundle;
}

async function invitationImageBytes(eventId: string, path: string, kind: InvitationMediaKind): Promise<Uint8Array> {
  if (kind === "video" || !isInvitationMediaPathForEvent(path, eventId, kind)) throw new Error("photo not found");
  const client = createAdminClient();
  const { data, error } = await client.storage.from(INVITATION_MEDIA_BUCKET).download(path);
  if (error || !data) throw new Error("photo not found");
  const bytes = new Uint8Array(await data.arrayBuffer());
  assertHonorImage(bytes);
  return bytes;
}

export async function listEventSitePhotos(eventId: string): Promise<EventSitePhoto[]> {
  const event = await getHonorEventContext(eventId);
  if (!event) return [];
  const client = createAdminClient();
  const photos: EventSitePhoto[] = [];
  const sign = async (path: string) => getSignedInvitationMedia(path);
  if (event.coverImagePath && isInvitationMediaPathForEvent(event.coverImagePath, eventId, "cover")) {
    photos.push({ ref: "cover", kind: "cover", label: "cover", url: await sign(event.coverImagePath) });
  }
  if (event.designedInvitePath && isInvitationMediaPathForEvent(event.designedInvitePath, eventId, "designed_invite")) {
    photos.push({ ref: "designed_invite", kind: "designed_invite", label: "designed_invite", url: await sign(event.designedInvitePath) });
  }
  const { data, error } = await client
    .from("invitation_media")
    .select("id, storage_path, alt_text, sort_order")
    .eq("event_id", eventId)
    .eq("kind", "gallery_image")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`failed to list event photos: ${error.message}`);
  for (const row of data ?? []) {
    const item = asRecord(row);
    const path = String(item.storage_path ?? "");
    const id = String(item.id ?? "");
    if (!id || !isInvitationMediaPathForEvent(path, eventId, "gallery")) continue;
    photos.push({ ref: id, kind: "gallery", label: String(item.alt_text ?? ""), url: await sign(path) });
  }
  return photos;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export async function detectHonorFaces(input: {
  eventId: string;
  sourceKind: "event_site" | "upload";
  sourceRef?: string | null;
  bytes?: Uint8Array;
  storage?: StorageProvider;
  aiProvider?: AIProvider;
}): Promise<HonorBundle> {
  const storage = input.storage ?? new R2StorageProvider();
  const provider = input.aiProvider ?? new RekognitionAIProvider();
  let bytes = input.bytes;
  if (input.sourceKind === "event_site") {
    const ref = input.sourceRef ?? "";
    const event = await getHonorEventContext(input.eventId);
    if (!event) throw new Error("event not found");
    if (ref === "cover" && event.coverImagePath) bytes = await invitationImageBytes(input.eventId, event.coverImagePath, "cover");
    else if (ref === "designed_invite" && event.designedInvitePath) bytes = await invitationImageBytes(input.eventId, event.designedInvitePath, "designed_invite");
    else {
      const client = createAdminClient();
      const { data, error } = await client.from("invitation_media").select("storage_path").eq("event_id", input.eventId).eq("id", ref).maybeSingle();
      if (error || !data) throw new Error("photo not found");
      const path = String(asRecord(data).storage_path ?? "");
      bytes = await invitationImageBytes(input.eventId, path, "gallery");
    }
  }
  if (!bytes) throw new Error("photo not found");
  assertHonorImage(bytes);
  return storeReferenceAndCrops(input.eventId, bytes, input.sourceKind, input.sourceRef ?? null, storage, provider);
}

async function loadCrops(storage: StorageProvider, honorees: HonoreeRecord[]): Promise<Array<{ honoreeId: string; bytes: Uint8Array }>> {
  const crops = [];
  for (const honoree of honorees) {
    if (!honoree.selected || !honoree.name.trim() || !honoree.cropObjectKey) continue;
    crops.push({ honoreeId: honoree.id, bytes: await downloadStorageObject(storage, honoree.cropObjectKey) });
  }
  return crops;
}

async function matchTargets(
  eventId: string,
  bundle: HonorBundle,
  targets: Array<{ mediaId: string; bytes: Uint8Array }>,
  storage: StorageProvider,
  provider: AIProvider,
): Promise<void> {
  const selected = bundle.honorees.filter((honoree) => honoree.selected && honoree.name.trim());
  const crops = await loadCrops(storage, selected);
  if (crops.length === 0 || targets.length === 0) return;
  const matches = await compareHonoreeCrops(
    crops,
    targets,
    (source, target, threshold) => provider.compareFaces(source, target, threshold),
    HONOR_SIMILARITY_THRESHOLD,
  );
  for (const match of matches) {
    await insertHonorMatchIfNew(eventId, match);
  }
}

function candidateKey(media: MemoryMedia): string | null {
  if (media.mediaKind === "video") return media.objectKeyThumbnail;
  return deriveObjectKeys(media.eventId, media.id).moderation;
}

export async function matchGalleryAgainstHonorees(eventId: string, storage = new R2StorageProvider(), provider: AIProvider = new RekognitionAIProvider()): Promise<void> {
  const bundle = await getHonorBundle(eventId);
  if (!bundle) return;
  const candidates = await listHonorCandidates(eventId);
  const targets: Array<{ mediaId: string; bytes: Uint8Array }> = [];
  for (const media of candidates) {
    const key = candidateKey(media);
    if (!key) continue;
    try {
      targets.push({ mediaId: media.id, bytes: await downloadStorageObject(storage, key) });
    } catch (error) {
      console.error("[guests-of-honor] skipped a photo that could not be read", { mediaId: media.id, error });
    }
  }
  await matchTargets(eventId, bundle, targets, storage, provider);
}

export async function confirmHonorFaces(eventId: string, faces: HonorFaceDraft[], consent: boolean): Promise<HostHonorState> {
  const event = await getHonorEventContext(eventId);
  const profile = honorProfileForEventType(event?.eventType);
  const validation = validateHonorConfirmation(profile, faces, consent);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.name = "HonorValidation";
    throw error;
  }
  await updateHonorConfirmation({ eventId, faces, consent });
  try {
    await matchGalleryAgainstHonorees(eventId);
    await setHonorStatus(eventId, "ready", null);
  } catch (error) {
    console.error("[guests-of-honor] matching failed", { eventId, error });
    await setHonorStatus(eventId, "draft", "matching_failed");
    throw error;
  }
  return getHostHonorState(eventId);
}

export async function getHostHonorState(eventId: string): Promise<HostHonorState> {
  const [bundle, photoCount] = await Promise.all([getHonorBundle(eventId), countGalleryPhotos(eventId)]);
  return hostStateFromBundle(bundle, photoCount);
}

export async function getPublicHonorView(eventId: string): Promise<PublicHonorView | null> {
  const event = await getHonorEventContext(eventId);
  if (!event) return null;
  const bundle = await getHonorBundle(eventId);
  if (!bundle || bundle.set.status !== "ready") return null;
  const media = await listGalleryVisibleMedia(eventId);
  const refs: HonorMediaRef[] = media.map((item) => {
    const pub = toPublicMemoryMedia(item);
    return {
      id: pub.id,
      mediaKind: pub.mediaKind,
      uploaderDisplayName: pub.uploaderDisplayName,
      objectKeyDisplay: pub.objectKeyDisplay,
      objectKeyThumbnail: pub.objectKeyThumbnail,
      capturedAt: pub.capturedAt,
      uploadedAt: pub.uploadedAt,
      durationSeconds: pub.durationSeconds ?? null,
    };
  });
  return buildPublicHonor({
    profile: honorProfileForEventType(event.eventType),
    honorees: bundle.honorees,
    matches: bundle.matches,
    media: refs,
  });
}

export async function removeHonorTagging(eventId: string, storage: StorageProvider = new R2StorageProvider()): Promise<void> {
  const keys = await deleteHonorRows(eventId);
  for (const key of keys) {
    try { await storage.deleteObject(key); } catch (error) {
      console.error("[guests-of-honor] failed to delete stored face data", { key, error });
    }
  }
}

export async function excludeHonorPhoto(eventId: string, mediaId: string): Promise<HostHonorState> {
  await excludeHonorMedia(eventId, mediaId);
  return getHostHonorState(eventId);
}

export async function readHonorObject(eventId: string, key: string, storage: StorageProvider = new R2StorageProvider()): Promise<Uint8Array | null> {
  const bundle = await getHonorBundle(eventId);
  if (!bundle) return null;
  const allowed = new Set([bundle.set.sourceObjectKey, ...bundle.honorees.map((face) => face.cropObjectKey)].filter((value): value is string => Boolean(value)));
  if (!allowed.has(key)) return null;
  return downloadStorageObject(storage, key);
}

export async function matchApprovedMediaAgainstHonorees(eventId: string, mediaId: string, bytes: Uint8Array): Promise<void> {
  if (!honorStorageConfigured()) return;
  const bundle = await getHonorBundle(eventId);
  if (!bundle || bundle.set.status !== "ready") return;
  const storage = new R2StorageProvider();
  const provider = new RekognitionAIProvider();
  await matchTargets(eventId, bundle, [{ mediaId, bytes }], storage, provider);
}

export async function matchApprovedMediaIds(eventId: string, mediaIds: string[]): Promise<void> {
  if (!honorStorageConfigured() || mediaIds.length === 0) return;
  const bundle = await getHonorBundle(eventId);
  if (!bundle || bundle.set.status !== "ready") return;
  const storage = new R2StorageProvider();
  const provider = new RekognitionAIProvider();
  const targets: Array<{ mediaId: string; bytes: Uint8Array }> = [];
  for (const mediaId of mediaIds) {
    const media = await getMemoryMediaById(mediaId);
    if (!media || media.eventId !== eventId || media.moderationStatus !== "approved") continue;
    const key = candidateKey(media);
    if (!key) continue;
    try {
      targets.push({ mediaId, bytes: await downloadStorageObject(storage, key) });
    } catch (error) {
      console.error("[guests-of-honor] skipped an approved photo", { mediaId, error });
    }
  }
  await matchTargets(eventId, bundle, targets, storage, provider);
}
