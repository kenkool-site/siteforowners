import type { MediaKind } from "./types";

// Types a guest browser may declare, after parameters and case are stripped.
// video/x-m4v is what some iOS versions report for a camera-roll clip.
const ALLOWED_GUEST_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

const CANONICAL_CONTENT_TYPE: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "video/x-m4v": "video/mp4",
};

// Used when File.type is empty, which is common for an iPhone capture named
// `81748560966__UUID.MOV`, or when the browser reports application/octet-stream.
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
};

const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface ResolvedGuestUpload {
  mediaKind: MediaKind;
  contentType: string;
}

function normalizeDeclaredContentType(type: string | null | undefined): string {
  return (type ?? "").split(";")[0].trim().toLowerCase();
}

function extensionFromFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

// null means we cannot sign a storage upload for this file. The guest sees
// the unsupported-type message instead of a blank content type that R2 rejects.
export function resolveGuestUpload(file: { name: string; type: string }): ResolvedGuestUpload | null {
  const declared = normalizeDeclaredContentType(file.type);
  const declaredAllowed = ALLOWED_GUEST_UPLOAD_TYPES.has(declared) ? (CANONICAL_CONTENT_TYPE[declared] ?? declared) : "";
  const fromExtension = CONTENT_TYPE_BY_EXTENSION[extensionFromFileName(file.name)] ?? "";
  const contentType = declaredAllowed || fromExtension;
  if (VIDEO_CONTENT_TYPES.has(contentType)) return { mediaKind: "video", contentType };
  if (PHOTO_CONTENT_TYPES.has(contentType)) return { mediaKind: "photo", contentType };
  return null;
}

// 16×16 solid frame, used when the phone can play a clip but cannot draw a
// poster from it (HEVC on iOS often never fires the frame callback). upload
// /complete refuses a video that has no poster object in storage, so a capture
// failure has to still produce a real JPEG.
const GENERIC_POSTER_JPEG_BASE64 = "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABMAAEBAAAAAAAAAAAAAAAAAAAABwEBAQAAAAAAAAAAAAAAAAAABAUQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAQABADASIAAhEAAxEA/9oADAMBAAIRAxEAPwCcgDpj/9k=";

export function genericPosterFile(): File {
  const binary = atob(GENERIC_POSTER_JPEG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], "poster.jpg", { type: "image/jpeg" });
}
