import { randomUUID } from "node:crypto";

export const INVITATION_MEDIA_BUCKET = "invitation-media";
export const INVITATION_MEDIA_SIGNED_URL_SECONDS = 15 * 60;
export const INVITATION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const INVITATION_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const INVITATION_VIDEO_MAX_SECONDS = 60;
export const INVITATION_GALLERY_MAX_ITEMS = 12;

export type InvitationMediaKind = "designed_invite" | "cover" | "gallery" | "video";
export type InvitationMediaExtension = "jpg" | "jpeg" | "png" | "webp" | "mp4" | "webm";

export type InvitationMediaItem = {
  id?: string;
  kind: InvitationMediaKind;
  path: string;
  url: string;
  altText?: string;
  sortOrder?: number;
};

export type InvitationMediaSnapshot = {
  designedInvite: InvitationMediaItem | null;
  cover: InvitationMediaItem | null;
  video: InvitationMediaItem | null;
  gallery: InvitationMediaItem[];
};

export type InvitationGalleryMediaRow = {
  id: string;
  storagePath: string;
  altText: string;
  sortOrder: number;
};

export type InvitationMediaFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ValidatedInvitationMedia = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm";
  extension: InvitationMediaExtension;
};

export type InvitationMediaValidationResult =
  | ({ ok: true } & ValidatedInvitationMedia)
  | {
      ok: false;
      code:
        | "invalid_media_type"
        | "file_too_large"
        | "video_too_long"
        | "video_duration_unreadable";
    };

type MediaFormat = {
  contentType: ValidatedInvitationMedia["contentType"];
  extensions: readonly InvitationMediaExtension[];
  isVideo: boolean;
  matchesMagic(bytes: Uint8Array): boolean;
};

const startsWith = (bytes: Uint8Array, expected: readonly number[]): boolean =>
  expected.every((value, index) => bytes[index] === value);

const textAt = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...Array.from(bytes.subarray(offset, offset + length)));

const MP4_BRANDS = new Set([
  "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9",
  "mp41", "mp42", "avc1", "M4V ", "MSNV",
]);

function readUint32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

type IsoBox = { type: string; payloadStart: number; end: number };

function isoBoxes(bytes: Uint8Array, start: number, end: number): IsoBox[] | null {
  const boxes: IsoBox[] = [];
  for (let offset = start; offset < end;) {
    const size = readUint32(bytes, offset);
    if (size === undefined || size < 8 || offset + size > end) return null;
    boxes.push({ type: textAt(bytes, offset + 4, 4), payloadStart: offset + 8, end: offset + size });
    offset += size;
  }
  return boxes;
}

function matchesMp4(bytes: Uint8Array): boolean {
  const boxes = isoBoxes(bytes, 0, bytes.length);
  const ftyp = boxes?.[0];
  return Boolean(
    ftyp
    && ftyp.type === "ftyp"
    && ftyp.end - ftyp.payloadStart >= 8
    && MP4_BRANDS.has(textAt(bytes, ftyp.payloadStart, 4)),
  );
}

function readEbmlSize(bytes: Uint8Array, offset: number): { value: number; length: number } | null {
  const first = bytes[offset];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = first & (marker - 1);
  for (let index = 1; index < length; index += 1) value = value * 256 + bytes[offset + index]!;
  return Number.isSafeInteger(value) ? { value, length } : null;
}

function ebmlIdLength(first: number | undefined): number | null {
  if (first === undefined || first === 0) return null;
  if (first & 0x80) return 1;
  if (first & 0x40) return 2;
  if (first & 0x20) return 3;
  if (first & 0x10) return 4;
  return null;
}

function matchesWebm(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return false;
  const headerSize = readEbmlSize(bytes, 4);
  if (!headerSize) return false;
  let offset = 4 + headerSize.length;
  const end = offset + headerSize.value;
  if (end > bytes.length) return false;
  while (offset < end) {
    const idLength = ebmlIdLength(bytes[offset]);
    if (!idLength || offset + idLength > end) return false;
    const isDocType = idLength === 2 && bytes[offset] === 0x42 && bytes[offset + 1] === 0x82;
    offset += idLength;
    const size = readEbmlSize(bytes, offset);
    if (!size) return false;
    offset += size.length;
    const payloadEnd = offset + size.value;
    if (payloadEnd > end) return false;
    if (isDocType) {
      return size.value === 4
        && bytes[offset] === 0x77
        && bytes[offset + 1] === 0x65
        && bytes[offset + 2] === 0x62
        && bytes[offset + 3] === 0x6d;
    }
    offset = payloadEnd;
  }
  return false;
}

const MEDIA_FORMATS: readonly MediaFormat[] = [
  {
    contentType: "image/jpeg",
    extensions: ["jpg", "jpeg"],
    isVideo: false,
    matchesMagic: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  },
  {
    contentType: "image/png",
    extensions: ["png"],
    isVideo: false,
    matchesMagic: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    contentType: "image/webp",
    extensions: ["webp"],
    isVideo: false,
    matchesMagic: (bytes) =>
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && bytes[8] === 0x57
      && bytes[9] === 0x45
      && bytes[10] === 0x42
      && bytes[11] === 0x50,
  },
  {
    contentType: "video/mp4",
    extensions: ["mp4"],
    isVideo: true,
    matchesMagic: matchesMp4,
  },
  {
    contentType: "video/webm",
    extensions: ["webm"],
    isVideo: true,
    matchesMagic: matchesWebm,
  },
] as const;

async function readDurationWithMusicMetadata(
  bytes: Uint8Array,
  contentType: string,
): Promise<number | undefined> {
  const mp4Timeline = contentType === "video/mp4" ? readMp4VideoTimelineDuration(bytes) : undefined;
  if (contentType === "video/mp4" && mp4Timeline === undefined) return undefined;
  const { parseBuffer } = await import("music-metadata");
  const metadata = await parseBuffer(
    bytes,
    { mimeType: contentType, size: bytes.byteLength },
    { duration: true, skipCovers: true },
  );
  return contentType === "video/mp4" ? mp4Timeline : metadata.format.duration;
}

function timelineDuration(
  bytes: Uint8Array,
  atom: IsoBox,
  kind: "mdhd" | "mvhd",
): number | undefined {
  const { payloadStart, end } = atom;
  if (payloadStart >= end) return undefined;
  const version = bytes[payloadStart];
  if (version !== 0 && version !== 1) return undefined;
  const requiredLength = version === 1 ? (kind === "mdhd" ? 36 : 112) : (kind === "mdhd" ? 24 : 100);
  if (end - payloadStart < requiredLength) return undefined;
  const timescaleOffset = version === 1 ? payloadStart + 20 : payloadStart + 12;
  const durationOffset = version === 1 ? payloadStart + 24 : payloadStart + 16;
  const timescale = readUint32(bytes, timescaleOffset);
  if (!timescale) return undefined;
  if (version === 1) {
    if (durationOffset + 8 > end) return undefined;
    const duration = new DataView(bytes.buffer, bytes.byteOffset + durationOffset, 8).getBigUint64(0);
    const seconds = Number(duration) / timescale;
    return Number.isFinite(seconds) ? seconds : undefined;
  }
  const duration = readUint32(bytes, durationOffset);
  return duration === undefined ? undefined : duration / timescale;
}

/** Reads MP4 movie/video timelines because music-metadata derives MP4 duration from audio. */
export function readMp4VideoTimelineDuration(bytes: Uint8Array): number | undefined {
  const topLevel = isoBoxes(bytes, 0, bytes.length);
  const moov = topLevel?.find((box) => box.type === "moov");
  if (!moov) return undefined;
  const moovChildren = isoBoxes(bytes, moov.payloadStart, moov.end);
  if (!moovChildren) return undefined;
  const durations: number[] = [];
  const mvhd = moovChildren.find((box) => box.type === "mvhd");
  if (!mvhd) return undefined;
  const movieDuration = timelineDuration(bytes, mvhd, "mvhd");
  if (movieDuration === undefined) return undefined;
  durations.push(movieDuration);

  let foundVideo = false;
  for (const trak of moovChildren.filter((box) => box.type === "trak")) {
    const trakChildren = isoBoxes(bytes, trak.payloadStart, trak.end);
    const mdia = trakChildren?.find((box) => box.type === "mdia");
    if (!mdia) continue;
    const mediaChildren = isoBoxes(bytes, mdia.payloadStart, mdia.end);
    if (!mediaChildren) return undefined;
    const hdlr = mediaChildren?.find((box) => box.type === "hdlr");
    const mdhd = mediaChildren?.find((box) => box.type === "mdhd");
    if (!hdlr || hdlr.end - hdlr.payloadStart < 12 || bytes[hdlr.payloadStart] !== 0) return undefined;
    if (textAt(bytes, hdlr.payloadStart + 8, 4) !== "vide") continue;
    foundVideo = true;
    if (!mdhd) return undefined;
    const duration = timelineDuration(bytes, mdhd, "mdhd");
    if (duration === undefined) return undefined;
    durations.push(duration);
  }
  if (!foundVideo || durations.length === 0) return undefined;
  return Math.max(...durations);
}

export async function validateInvitationMedia(
  file: InvitationMediaFile,
  kind: InvitationMediaKind,
  dependencies: {
    readDurationSeconds?: (bytes: Uint8Array, contentType: string) => Promise<number | undefined>;
  } = {},
): Promise<InvitationMediaValidationResult> {
  const format = MEDIA_FORMATS.find((candidate) => candidate.contentType === file.type);
  const extension = file.name.split(".").pop()?.toLowerCase() as InvitationMediaExtension | undefined;
  const expectsVideo = kind === "video";

  if (!format || !extension || format.isVideo !== expectsVideo || !format.extensions.includes(extension)) {
    return { ok: false, code: "invalid_media_type" };
  }
  const maximumSize = format.isVideo ? INVITATION_VIDEO_MAX_BYTES : INVITATION_IMAGE_MAX_BYTES;
  if (file.size > maximumSize) return { ok: false, code: "file_too_large" };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, code: "invalid_media_type" };
  }
  try {
    if (!format.matchesMagic(bytes)) return { ok: false, code: "invalid_media_type" };
  } catch {
    return { ok: false, code: "invalid_media_type" };
  }

  if (format.isVideo) {
    try {
      const readDuration = dependencies.readDurationSeconds ?? readDurationWithMusicMetadata;
      const duration = await readDuration(bytes, format.contentType);
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
        return { ok: false, code: "video_duration_unreadable" };
      }
      if (duration > INVITATION_VIDEO_MAX_SECONDS) return { ok: false, code: "video_too_long" };
    } catch {
      return { ok: false, code: "video_duration_unreadable" };
    }
  }

  return {
    ok: true,
    bytes,
    contentType: format.contentType,
    extension,
  };
}

export function buildInvitationMediaPath(
  eventId: string,
  kind: InvitationMediaKind,
  extension: InvitationMediaExtension,
): string {
  return `${eventId}/${kind}/${randomUUID()}.${extension}`;
}

export function isInvitationMediaPathForEvent(
  path: string,
  eventId: string,
  kind: InvitationMediaKind,
): boolean {
  const prefix = `${eventId}/${kind}/`;
  const filename = path.slice(prefix.length);
  return path.startsWith(prefix) && filename.length > 0 && !filename.includes("/");
}

export function validateInvitationGalleryCount(
  currentCount: number,
): { ok: true } | { ok: false; code: "gallery_full" } {
  return currentCount < INVITATION_GALLERY_MAX_ITEMS
    ? { ok: true }
    : { ok: false, code: "gallery_full" };
}

export async function getSignedInvitationMedia(
  path: string,
  dependencies?: {
    createSignedUrl(path: string, expiresIn: number): Promise<string>;
  },
): Promise<string> {
  if (dependencies) {
    return dependencies.createSignedUrl(path, INVITATION_MEDIA_SIGNED_URL_SECONDS);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data, error } = await createAdminClient().storage
    .from(INVITATION_MEDIA_BUCKET)
    .createSignedUrl(path, INVITATION_MEDIA_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("Unable to sign invitation media", { cause: error });
  return data.signedUrl;
}

export async function readInvitationReferenceBytes(
  path: string,
  eventId: string,
  dependencies?: { download(path: string): Promise<Blob> },
): Promise<{ bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" }> {
  if (!isInvitationMediaPathForEvent(path, eventId, "designed_invite")) throw new Error("Invalid invitation reference path");
  const extension = path.split(".").pop()?.toLowerCase();
  const mediaType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : null;
  if (!mediaType) throw new Error("Invalid invitation reference image");
  let blob: Blob;
  if (dependencies) blob = await dependencies.download(path);
  else {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data, error } = await createAdminClient().storage.from(INVITATION_MEDIA_BUCKET).download(path);
    if (error || !data) throw new Error("Invitation reference unavailable", { cause: error });
    blob = data;
  }
  if (blob.size > INVITATION_IMAGE_MAX_BYTES) throw new Error("Invitation reference image is too large");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const validation = await validateInvitationMedia({ name: `reference.${extension}`, type: mediaType, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, "designed_invite");
  if (!validation.ok) throw new Error("Invalid invitation reference image");
  return { bytes: validation.bytes, mediaType: validation.contentType as "image/jpeg" | "image/png" | "image/webp" };
}

export async function createInvitationMediaSnapshot(
  event: {
    id: string;
    designedInvitePath: string | null;
    coverImagePath: string | null;
    videoPath: string | null;
  },
  dependencies: {
    listGallery(eventId: string): Promise<InvitationGalleryMediaRow[]>;
    sign(path: string): Promise<string>;
  },
): Promise<InvitationMediaSnapshot> {
  const singleton = async (
    kind: Exclude<InvitationMediaKind, "gallery">,
    path: string | null,
  ): Promise<InvitationMediaItem | null> => path
    ? { kind, path, url: await dependencies.sign(path) }
    : null;
  const designedInvite = await singleton("designed_invite", event.designedInvitePath);
  const cover = await singleton("cover", event.coverImagePath);
  const video = await singleton("video", event.videoPath);
  const galleryRows = await dependencies.listGallery(event.id);
  const gallery: InvitationMediaItem[] = [];
  for (const row of galleryRows) {
    gallery.push({
      id: row.id,
      kind: "gallery",
      path: row.storagePath,
      url: await dependencies.sign(row.storagePath),
      altText: row.altText,
      sortOrder: row.sortOrder,
    });
  }
  return { designedInvite, cover, video, gallery };
}

export async function getInvitationMediaForManagement(
  event: {
    id: string;
    designedInvitePath: string | null;
    coverImagePath: string | null;
    videoPath: string | null;
  },
): Promise<InvitationMediaSnapshot> {
  const { getFixtureInvitationMedia, isInvitationE2EFixturesEnabled } = await import("./e2e-fixtures");
  if (isInvitationE2EFixturesEnabled()) return getFixtureInvitationMedia(event.id);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const client = createAdminClient();
  return createInvitationMediaSnapshot(event, {
    listGallery: async (eventId) => {
      const { data, error } = await client
        .from("invitation_media")
        .select("id,storage_path,alt_text,sort_order")
        .eq("event_id", eventId)
        .eq("kind", "gallery_image")
        .order("sort_order", { ascending: true });
      if (error) throw new Error("Unable to load invitation gallery", { cause: error });
      return ((data ?? []) as unknown as Array<{
        id: string;
        storage_path: string;
        alt_text: string;
        sort_order: number;
      }>).map((row) => ({
        id: row.id,
        storagePath: row.storage_path,
        altText: row.alt_text,
        sortOrder: row.sort_order,
      }));
    },
    sign: async (path) => getSignedInvitationMedia(path, {
      createSignedUrl: async (storagePath, expiresIn) => {
        const { data, error } = await client.storage
          .from(INVITATION_MEDIA_BUCKET)
          .createSignedUrl(storagePath, expiresIn);
        if (error || !data?.signedUrl) throw new Error("Unable to sign invitation media", { cause: error });
        return data.signedUrl;
      },
    }),
  });
}

export async function finalizeInvitationMediaUpload(input: {
  newPath: string;
  oldPath: string | null;
  upload(path: string): Promise<void>;
  finalize(): Promise<void>;
  remove(path: string): Promise<void>;
}): Promise<void> {
  await input.upload(input.newPath);
  try {
    await input.finalize();
  } catch (error) {
    try {
      await input.remove(input.newPath);
    } catch {
      // The cleanup cron will retry removal of this unreferenced object.
    }
    throw error;
  }
  if (input.oldPath && input.oldPath !== input.newPath) {
    try {
      await input.remove(input.oldPath);
    } catch {
      // The database points at the new object; orphan cleanup handles the old one.
    }
  }
}

export async function removeInvitationSingletonMedia(input: {
  eventId: string;
  kind: Exclude<InvitationMediaKind, "gallery">;
  expectedPath: string;
  clearReference(eventId: string, kind: Exclude<InvitationMediaKind, "gallery">, expectedPath: string): Promise<boolean>;
  removeObject(path: string): Promise<void>;
}): Promise<"removed" | "conflict"> {
  if (!await input.clearReference(input.eventId, input.kind, input.expectedPath)) return "conflict";
  await input.removeObject(input.expectedPath);
  return "removed";
}

export function isInvitationMediaOrphan(
  object: { createdAt: string; referenced: boolean },
  now = new Date(),
): boolean {
  const createdAt = Date.parse(object.createdAt);
  return !object.referenced
    && Number.isFinite(createdAt)
    && now.getTime() - createdAt > 24 * 60 * 60 * 1000;
}
