// src/lib/invitations/memories/gallery.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRow } from "./repository";
import type { MemoryMedia } from "./types";

export function computeGalleryVisible(media: MemoryMedia): boolean {
  return (
    media.uploadStatus === "uploaded" &&
    media.processingStatus === "ready" &&
    media.moderationStatus === "approved"
  );
}

export async function listGalleryVisibleMedia(eventId: string): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .order("captured_at", { ascending: false });

  if (error || !data) return [];
  return data.map(mapRow);
}
