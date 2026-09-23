import type { QueueItem } from "./upload-queue";

export interface GuestUploadPreview extends QueueItem {
  previewUrl?: string;
  completedAt?: number;
}

const COMPLETED_PREVIEW_MS = 30_000;

export function visibleOptimisticUploads(
  items: GuestUploadPreview[],
  publishedMediaIds: Set<string>,
  now: number,
): GuestUploadPreview[] {
  return items.filter((item) => {
    if (!item.previewUrl || item.status === "failed") return false;
    if (item.mediaId && publishedMediaIds.has(item.mediaId)) return false;
    if (item.status === "done" && item.completedAt && now - item.completedAt > COMPLETED_PREVIEW_MS) return false;
    return true;
  });
}
