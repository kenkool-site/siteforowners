import { createHmac, timingSafeEqual } from "node:crypto";
import type { MediaKind } from "./types";

function getTicketSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return secret;
}

// The object key's extension is what the Worker dispatches on (its
// SUPPORTED_IMAGE_EXTENSIONS lookup in workers/memories-processing/src/index.ts),
// so it has to reflect the guest's real file format. Hardcoding `.jpg` made every
// iPhone HEIC upload land under a .jpg key, which photon then failed to decode —
// dead-lettering silently. Unknown types fall back to the kind's default rather
// than inventing an extension from an untrusted string.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

function extensionFor(mediaKind: MediaKind, contentType?: string): string {
  const fallback = mediaKind === "video" ? "mp4" : "jpg";
  if (!contentType) return fallback;
  // Strip any parameters ("image/jpeg; charset=binary") and normalize case.
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  return EXTENSION_BY_CONTENT_TYPE[normalized] ?? fallback;
}

export function objectKeyForOriginal(
  eventId: string,
  mediaId: string,
  mediaKind: MediaKind,
  contentType?: string,
): string {
  return `originals/${eventId}/${mediaId}.${extensionFor(mediaKind, contentType)}`;
}

// A video's poster is a plain JPEG derived from the same ids, independent of
// the video's own container/codec — always ".jpg" regardless of whether the
// clip itself is .mp4/.webm/.mov.
//
// Deliberately NOT under originals/ — that prefix is exactly what the R2 event
// notification watches (see workers/memories-processing/src/index.ts), and
// .jpg is a supported image extension there. A poster key under originals/
// would get picked up and processed as if it were a real media original: the
// Worker would run photon-rs on it, then POST to /api/memories/processing-complete
// with a "media id" of `${mediaId}-poster`, which isn't a real UUID matching any
// memory_media row — a guaranteed Postgres error, retried and dead-lettered on
// every single video upload. posters/ is outside that watched prefix, so the
// Worker never sees these objects at all.
export function objectKeyForVideoPoster(eventId: string, mediaId: string): string {
  return `posters/${eventId}/${mediaId}.jpg`;
}

// Ceiling for the poster JPEG's actual uploaded size, checked post-hoc at
// upload/complete via R2StorageProvider.getObjectSizeBytes (see that route's
// own comment for why this can't be enforced as the presigned PUT URL's
// signed Content-Length the way the main upload's cap is: the poster's real
// size isn't known until the client captures it, well after upload/init has
// already presigned the URL — signing an exact-match Content-Length there
// against a guessed value broke every real poster upload with a signature
// mismatch, since the guessed value essentially never equals the real
// compressed JPEG's byte size). The client caps the captured poster frame at
// 1600px on its longest side (GuestUploadView.tsx's MAX_POSTER_DIMENSION_PX),
// which should never produce more than a few hundred KB at reasonable JPEG
// quality — 2MB is generous headroom above that while still being a real,
// enforced limit.
export const MAX_POSTER_UPLOAD_BYTES = 2 * 1024 * 1024;

export function createMemoriesUploadTicket(
  eventId: string,
  mediaId: string,
  mediaKind: MediaKind,
  contentType?: string,
  secret = getTicketSecret(),
): { ticket: string; objectKey: string } {
  const objectKey = objectKeyForOriginal(eventId, mediaId, mediaKind, contentType);
  const body = Buffer.from(JSON.stringify({ eventId, mediaId, objectKey })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`memories-upload-ticket-v1:${body}`).digest("base64url");
  return { ticket: `${body}.${signature}`, objectKey };
}

export function verifyMemoriesUploadTicket(
  ticket: string,
  eventId: string,
  mediaId: string,
  secret = getTicketSecret(),
): boolean {
  const parts = ticket.split(".");
  if (parts.length !== 2) return false;
  const [body, signature] = parts;

  const expected = createHmac("sha256", secret).update(`memories-upload-ticket-v1:${body}`).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  let parsed: { eventId: string; mediaId: string; objectKey: string };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  return parsed.eventId === eventId && parsed.mediaId === mediaId;
}
