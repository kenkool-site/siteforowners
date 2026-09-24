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
export function objectKeyForVideoPoster(eventId: string, mediaId: string): string {
  return `originals/${eventId}/${mediaId}-poster.jpg`;
}

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
