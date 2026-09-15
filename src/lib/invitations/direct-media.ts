import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { buildInvitationMediaPath, INVITATION_IMAGE_MAX_BYTES, INVITATION_VIDEO_MAX_BYTES, validateInvitationMedia, type InvitationMediaExtension, type InvitationMediaKind } from "./media";

const FORMATS: Record<string, { extensions: string[]; video: boolean }> = {
  "image/jpeg": { extensions: ["jpg", "jpeg"], video: false },
  "image/png": { extensions: ["png"], video: false },
  "image/webp": { extensions: ["webp"], video: false },
  "video/mp4": { extensions: ["mp4"], video: true },
  "video/webm": { extensions: ["webm"], video: true },
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export class DirectMediaError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export type MediaUploadMetadata = { kind: InvitationMediaKind; name: string; type: string; size: number; altText: string; mediaId: string | null };
export type MediaUploadTicket = MediaUploadMetadata & { eventId: string; path: string; expiresAt: number; extension: InvitationMediaExtension };

function signature(body: string, secret: string | undefined): Buffer {
  if (!secret || secret.length < 32) throw new Error("Media authorization secret unavailable");
  return createHmac("sha256", secret).update(`invitation-direct-upload-v1:${body}`).digest();
}

export function createMediaUploadTicket(eventId: string, input: MediaUploadMetadata, secret = process.env.SESSION_COOKIE_SECRET, now = Math.floor(Date.now() / 1000)): { ticket: string; path: string } {
  const format = FORMATS[input.type];
  const extension = input.name.split(".").pop()?.toLowerCase();
  if (!UUID.test(eventId) || !["designed_invite", "cover", "gallery", "video"].includes(input.kind)
    || !format || !extension || !format.extensions.includes(extension) || format.video !== (input.kind === "video")
    || !Number.isSafeInteger(input.size) || input.size <= 0) throw new DirectMediaError("invalid_media_type");
  if (input.size > (format.video ? INVITATION_VIDEO_MAX_BYTES : INVITATION_IMAGE_MAX_BYTES)) throw new DirectMediaError("file_too_large");
  if (input.kind === "gallery" && (!input.altText.trim() || input.altText.length > 500)) throw new DirectMediaError("gallery_alt_required");
  if (input.mediaId !== null && (input.kind !== "gallery" || !UUID.test(input.mediaId))) throw new DirectMediaError("invalid_media_reference");
  const path = `${eventId}/${input.kind}/provisional-${randomUUID()}.${extension}`;
  const body = Buffer.from(JSON.stringify({ ...input, name: `upload.${extension}`, eventId, path, extension, expiresAt: now + 2 * 60 * 60 })).toString("base64url");
  return { path, ticket: `${body}.${signature(body, secret).toString("base64url")}` };
}

export function verifyMediaUploadTicket(ticket: string, eventId: string, secret = process.env.SESSION_COOKIE_SECRET, now = Math.floor(Date.now() / 1000)): MediaUploadTicket | null {
  try {
    const [body, signed, extra] = ticket.split(".");
    if (!body || !signed || extra) return null;
    const expected = signature(body, secret), actual = Buffer.from(signed, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MediaUploadTicket;
    if (value.eventId !== eventId || !UUID.test(eventId) || value.expiresAt <= now) return null;
    if (!new RegExp(`^${eventId}/${value.kind}/provisional-[a-f0-9-]{36}\\.${value.extension}$`).test(value.path)) return null;
    return value;
  } catch { return null; }
}

export async function finalizeDirectMedia(ticket: MediaUploadTicket, dependencies: {
  download(path: string): Promise<Blob>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  attach(path: string): Promise<string | null>;
  remove(path: string): Promise<void>;
}): Promise<void> {
  try {
    const blob = await dependencies.download(ticket.path);
    if (blob.size !== ticket.size) throw new DirectMediaError("file_too_large");
    if (blob.type !== ticket.type) throw new DirectMediaError("invalid_media_type");
    const validation = await validateInvitationMedia({ name: ticket.name, type: blob.type, size: blob.size, arrayBuffer: () => blob.arrayBuffer() }, ticket.kind);
    if (!validation.ok) throw new DirectMediaError(validation.code);
    const finalPath = buildInvitationMediaPath(ticket.eventId, ticket.kind, validation.extension);
    // Signed upload tokens only ever name provisional objects. A browser can never
    // mutate this validated final object, even by reusing its upload capability.
    await dependencies.upload(finalPath, validation.bytes, validation.contentType);
    const oldPath = await dependencies.attach(finalPath);
    if (oldPath) await dependencies.remove(oldPath).catch(() => undefined);
    // An ambiguous database outcome must not cause deletion of a committed final
    // object. Unattached final objects are collected by the existing orphan cron.
  } finally {
    await dependencies.remove(ticket.path).catch(() => undefined);
  }
}
