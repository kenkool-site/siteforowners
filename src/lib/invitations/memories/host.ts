import type { MemoryMedia, ModerationStatus } from "./types";

export type HostReviewFilter = "live" | "flagged" | "pending" | "removed" | "published" | "rejected";
export type HostModerationAction = "approve" | "reject" | "remove";

export function moderationStatusForFilter(filter: HostReviewFilter): ModerationStatus {
  if (filter === "live" || filter === "published") return "approved";
  if (filter === "pending") return "awaiting_host_review";
  if (filter === "removed" || filter === "rejected") return "rejected";
  return "flagged";
}

export function allowedModerationStatuses(action: HostModerationAction): ModerationStatus[] {
  return action === "remove" ? ["approved"] : ["flagged", "awaiting_host_review"];
}

export type MemoriesEventSummary = {
  photoCount: number;
  videoCount: number;
  guestContributorCount: number;
  flaggedCount: number;
  recentThumbnailMediaIds: string[];
};

export function buildMemoriesEventSummary(rows: MemoryMedia[]): MemoriesEventSummary {
  const visible = rows.filter((row) => row.uploadStatus === "uploaded" && row.processingStatus === "ready" && row.moderationStatus === "approved");
  const contributorKeys = visible
    .map((row) => row.uploaderRsvpId
      ?? row.uploaderSessionId
      ?? (row.uploaderDisplayName ? `name:${row.uploaderDisplayName.trim().toLocaleLowerCase()}` : null))
    .filter((value): value is string => Boolean(value));
  return {
    photoCount: visible.filter((row) => row.mediaKind === "photo").length,
    videoCount: visible.filter((row) => row.mediaKind === "video").length,
    guestContributorCount: new Set(contributorKeys).size,
    flaggedCount: rows.filter((row) => row.moderationStatus === "flagged").length,
    recentThumbnailMediaIds: [...visible]
      .filter((row) => row.objectKeyThumbnail)
      .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))
      .slice(0, 6)
      .map((row) => row.id),
  };
}
