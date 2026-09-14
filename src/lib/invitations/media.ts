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
    matchesMagic: (bytes) =>
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70,
  },
  {
    contentType: "video/webm",
    extensions: ["webm"],
    isVideo: true,
    matchesMagic: (bytes) => startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]),
  },
] as const;

async function readDurationWithMusicMetadata(
  bytes: Uint8Array,
  contentType: string,
): Promise<number | undefined> {
  const { parseBuffer } = await import("music-metadata");
  const metadata = await parseBuffer(
    bytes,
    { mimeType: contentType, size: bytes.byteLength },
    { duration: true, skipCovers: true },
  );
  return metadata.format.duration;
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
  if (!format.matchesMagic(bytes)) return { ok: false, code: "invalid_media_type" };

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

export function isInvitationMediaOrphan(
  object: { createdAt: string; referenced: boolean },
  now = new Date(),
): boolean {
  const createdAt = Date.parse(object.createdAt);
  return !object.referenced
    && Number.isFinite(createdAt)
    && now.getTime() - createdAt > 24 * 60 * 60 * 1000;
}
