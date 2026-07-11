import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { ValidatedEstimatePhoto } from "@/lib/validation/estimate-photos";

export const ESTIMATE_PHOTO_BUCKET = "estimate-photos";
export const ESTIMATE_PHOTO_LINK_SECONDS = 60 * 60 * 24 * 14;

export function estimatePhotoPath(
  tenantId: string,
  requestId: string,
  photoId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${tenantId}/${requestId}/${photoId}.${extension}`;
}

export async function uploadEstimatePhotos(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  requestId: string,
  photos: ValidatedEstimatePhoto[],
): Promise<{
  uploaded: {
    id: string;
    tenant_id: string;
    estimate_request_id: string;
    storage_path: string;
    content_type: string;
    size_bytes: number;
  }[];
  failedIndices: number[];
}> {
  const results = await Promise.all(
    photos.map(async (photo, index) => {
      const photoId = randomUUID();
      const storagePath = estimatePhotoPath(
        tenantId,
        requestId,
        photoId,
        photo.extension,
      );

      const { error } = await supabase.storage
        .from(ESTIMATE_PHOTO_BUCKET)
        .upload(storagePath, photo.bytes, {
          contentType: photo.contentType.contentType,
          upsert: false,
        });

      if (error) {
        return { ok: false as const, index };
      }

      return {
        ok: true as const,
        row: {
          id: photoId,
          tenant_id: tenantId,
          estimate_request_id: requestId,
          storage_path: storagePath,
          content_type: photo.contentType.contentType,
          size_bytes: photo.sizeBytes,
        },
      };
    }),
  );

  const uploaded: {
    id: string;
    tenant_id: string;
    estimate_request_id: string;
    storage_path: string;
    content_type: string;
    size_bytes: number;
  }[] = [];
  const failedIndices: number[] = [];

  for (const result of results) {
    if (result.ok) {
      uploaded.push(result.row);
    } else {
      failedIndices.push(result.index);
    }
  }

  return { uploaded, failedIndices };
}

export async function createEstimatePhotoLinks(
  supabase: ReturnType<typeof createAdminClient>,
  paths: string[],
): Promise<string[]> {
  const results = await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await supabase.storage
        .from(ESTIMATE_PHOTO_BUCKET)
        .createSignedUrl(path, ESTIMATE_PHOTO_LINK_SECONDS);

      if (error || !data?.signedUrl) {
        return null;
      }

      return data.signedUrl;
    }),
  );

  return results.filter((url): url is string => url !== null);
}
