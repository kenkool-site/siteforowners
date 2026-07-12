import { ESTIMATE_PHOTO_LIMITS } from "@/lib/validation/estimate-photos";

export type EstimatePhotoSelectionError =
  | "invalid"
  | "file_too_large"
  | "too_many_files"
  | "total_too_large";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateEstimatePhotoSelection(
  photos: readonly Pick<File, "size" | "type">[],
): EstimatePhotoSelectionError | undefined {
  if (photos.length > ESTIMATE_PHOTO_LIMITS.maxFiles) return "too_many_files";
  if (photos.some((file) => file.size > ESTIMATE_PHOTO_LIMITS.maxBytesPerFile)) return "file_too_large";
  if (photos.reduce((total, file) => total + file.size, 0) > ESTIMATE_PHOTO_LIMITS.maxTotalBytes) return "total_too_large";
  if (photos.some((file) => !PHOTO_TYPES.has(file.type))) return "invalid";
  return undefined;
}
