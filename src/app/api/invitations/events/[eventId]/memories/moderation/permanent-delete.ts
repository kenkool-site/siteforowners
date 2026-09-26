// src/app/api/invitations/events/[eventId]/memories/moderation/permanent-delete.ts
//
// Hard-delete logic for already-rejected/removed media, pulled out of
// route.ts for the same reason moderate-media.ts is: a route.ts file may
// only export the recognized HTTP handlers and a small set of config
// fields (see this repo's CLAUDE.md).
import { deriveObjectKeys } from "@/lib/invitations/memories/processing-provider";
import { deleteMemoryMediaRows, listRejectedMemoryMediaByIds } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import type { StorageProvider } from "@/lib/invitations/memories/storage-provider";

// Dependencies-object DI seam, same rationale as ModerateMediaDependencies:
// listRejectedMemoryMediaByIds/deleteMemoryMediaRows call createAdminClient()
// directly and R2StorageProvider calls the real R2 API — without this seam,
// none of this function's branches (object-key collection, best-effort
// delete tolerance, the rejected-only scoping) would be testable without a
// real Supabase instance plus live R2 credentials.
export interface PermanentlyDeleteDependencies {
  listRejectedMemoryMediaByIds?: typeof listRejectedMemoryMediaByIds;
  deleteMemoryMediaRows?: typeof deleteMemoryMediaRows;
  storage?: StorageProvider;
}

// Returns the ids actually deleted — a subset of mediaIds when some were no
// longer rejected (already restored, or never existed for this event).
export async function permanentlyDeleteMemoryMedia(
  eventId: string,
  mediaIds: string[],
  dependencies: PermanentlyDeleteDependencies = {},
): Promise<string[]> {
  const listRejected = dependencies.listRejectedMemoryMediaByIds ?? listRejectedMemoryMediaByIds;
  const deleteRows = dependencies.deleteMemoryMediaRows ?? deleteMemoryMediaRows;
  const storage = dependencies.storage ?? new R2StorageProvider();

  const rows = await listRejected(eventId, mediaIds);
  if (!rows.length) return [];

  // A dedicated Set: video rows store the same key in both objectKeyDisplay
  // and objectKeyOriginal (see markVideoMemoryMediaReady), and every photo
  // row's moderation-derivative key is deterministic rather than stored —
  // both would otherwise cause a duplicate, harmless but wasteful, delete.
  const objectKeys = new Set<string>();
  for (const row of rows) {
    objectKeys.add(row.objectKeyOriginal);
    if (row.objectKeyDisplay) objectKeys.add(row.objectKeyDisplay);
    if (row.objectKeyThumbnail) objectKeys.add(row.objectKeyThumbnail);
    objectKeys.add(deriveObjectKeys(row.eventId, row.id).moderation);
  }

  // Best-effort: an R2 delete failure must never block removing the database
  // row — a leaked storage object is a much smaller problem than a "Delete
  // all permanently" the host clicked that silently fails to remove rows.
  await Promise.all(Array.from(objectKeys).map(async (key) => {
    try {
      await storage.deleteObject(key);
    } catch (error) {
      console.error("[memories/moderation] failed to delete R2 object during permanent delete (non-fatal)", { eventId, key, error });
    }
  }));

  return deleteRows(eventId, rows.map((row) => row.id));
}
