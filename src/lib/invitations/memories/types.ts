// src/lib/invitations/memories/types.ts
export type MemoriesGuestLevel = "rsvp_guest" | "anonymous";

export interface MemoriesGuestSession {
  eventId: string;
  level: MemoriesGuestLevel;
  rsvpId?: string;
  guestName?: string;
  expiresAt: number; // unix seconds
}

export type MediaKind = "photo" | "video";
export type UploadStatus = "pending" | "uploaded" | "upload_failed";
export type ProcessingStatus = "pending" | "processing" | "ready" | "processing_failed";
export type ModerationStatus =
  | "pending"
  | "awaiting_host_review"
  | "approved"
  | "flagged"
  | "rejected";
export type AiStatus = "not_started" | "processing" | "enriched" | "ai_failed";

export interface MemoryMedia {
  id: string;
  eventId: string;
  uploaderRsvpId: string | null;
  uploaderDisplayName: string | null;
  guestSessionLevel: MemoriesGuestLevel;
  mediaKind: MediaKind;
  objectKeyOriginal: string;
  objectKeyDisplay: string | null;
  objectKeyThumbnail: string | null;
  capturedAt: string | null;
  uploadedAt: string;
  uploadStatus: UploadStatus;
  processingStatus: ProcessingStatus;
  moderationStatus: ModerationStatus;
  aiStatus: AiStatus;
  moderationScore: number | null;
  moderationCategories: string[] | null;
}
