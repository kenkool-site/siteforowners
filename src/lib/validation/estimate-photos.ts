import {
  detectProfileImageType,
  profileImageTypeMatches,
  type ProfileImageType,
} from "@/lib/profile-image";

export const ESTIMATE_PHOTO_LIMITS = {
  maxFiles: 5,
  maxBytesPerFile: 8 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
} as const;

export interface ValidatedEstimatePhoto {
  bytes: Uint8Array;
  contentType: ProfileImageType;
  extension: "jpg" | "png" | "webp";
  sizeBytes: number;
}

export async function validateEstimatePhotos(
  files: File[],
): Promise<
  | { ok: true; photos: ValidatedEstimatePhoto[] }
  | { ok: false; errors: { index: number; reason: string }[] }
> {
  const errors: { index: number; reason: string }[] = [];

  if (files.length > ESTIMATE_PHOTO_LIMITS.maxFiles) {
    for (let index = ESTIMATE_PHOTO_LIMITS.maxFiles; index < files.length; index++) {
      errors.push({ index, reason: "too_many_files" });
    }
    return { ok: false, errors };
  }

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
  }
  if (totalBytes > ESTIMATE_PHOTO_LIMITS.maxTotalBytes) {
    return { ok: false, errors: [{ index: -1, reason: "total_too_large" }] };
  }

  const photos: ValidatedEstimatePhoto[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];

    if (file.size > ESTIMATE_PHOTO_LIMITS.maxBytesPerFile) {
      errors.push({ index, reason: "file_too_large" });
      continue;
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detected = detectProfileImageType(bytes);

    if (!detected) {
      errors.push({ index, reason: "invalid_image" });
      continue;
    }

    if (!profileImageTypeMatches(file.type, detected)) {
      errors.push({ index, reason: "type_mismatch" });
      continue;
    }

    photos.push({
      bytes,
      contentType: detected,
      extension: detected.extension,
      sizeBytes: bytes.length,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, photos };
}
