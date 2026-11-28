// A guest's own "that was an accident" delete. Only the uploader's session
// may use it, and only within GUEST_DELETE_WINDOW_SECONDS of the upload -
// after that (or once the signed guest session expires) the host's moderation
// tools are the only way media leaves an event. Unlike a host removal this
// is a hard delete: the row, the R2 objects, and any Cloudflare Stream copy
// all go, and the host never sees the item again.
import { deriveObjectKeys } from "./processing-provider";
import { deleteOwnRecentMemoryMediaRow, getMemoryMediaById } from "./repository";
import { deleteStreamVideo, getStreamConfig } from "./stream";
import { R2StorageProvider } from "./storage-provider";
import type { StorageProvider } from "./storage-provider";

export const GUEST_DELETE_WINDOW_SECONDS = 60 * 60;

export type GuestDeleteOutcome = "deleted" | "not_found" | "not_owner" | "window_closed";

// Same dependencies-object DI seam as permanentlyDeleteMemoryMedia, and for
// the same reason: everything this touches needs live Supabase/R2/Stream.
export interface GuestDeleteDependencies {
  getMemoryMediaById?: typeof getMemoryMediaById;
  deleteOwnRecentMemoryMediaRow?: typeof deleteOwnRecentMemoryMediaRow;
  deleteStreamVideo?: typeof deleteStreamVideo;
  getStreamConfig?: typeof getStreamConfig;
  storage?: StorageProvider;
}

export async function deleteOwnMemoryMedia(
  eventId: string,
  mediaId: string,
  sessionId: string,
  dependencies: GuestDeleteDependencies = {},
  nowMs: number = Date.now(),
): Promise<GuestDeleteOutcome> {
  const getById = dependencies.getMemoryMediaById ?? getMemoryMediaById;
  const deleteRow = dependencies.deleteOwnRecentMemoryMediaRow ?? deleteOwnRecentMemoryMediaRow;
  const removeStreamVideo = dependencies.deleteStreamVideo ?? deleteStreamVideo;
  const streamConfig = (dependencies.getStreamConfig ?? getStreamConfig)();

  const row = await getById(mediaId);
  if (!row || row.eventId !== eventId) return "not_found";
  if (!sessionId || row.uploaderSessionId !== sessionId) return "not_owner";
  const uploadedAfterIso = new Date(nowMs - GUEST_DELETE_WINDOW_SECONDS * 1000).toISOString();
  if (row.uploadedAt < uploadedAfterIso) return "window_closed";

  // The row goes first, with every condition re-checked inside the delete
  // itself, so a concurrent host purge or a window that closed between the
  // read above and now can't double-delete or over-delete. Once the row is
  // gone nothing can serve the media; storage cleanup after is best-effort.
  if (!(await deleteRow(eventId, mediaId, sessionId, uploadedAfterIso))) return "not_found";

  if (row.streamUid && streamConfig) {
    try {
      await removeStreamVideo(streamConfig, row.streamUid);
    } catch (error) {
      console.error("[memories/guest-delete] failed to delete the Stream copy (non-fatal)", { mediaId, error });
    }
  }

  const storage = dependencies.storage ?? new R2StorageProvider();
  const objectKeys = new Set<string>([row.objectKeyOriginal]);
  if (row.objectKeyDisplay) objectKeys.add(row.objectKeyDisplay);
  if (row.objectKeyThumbnail) objectKeys.add(row.objectKeyThumbnail);
  objectKeys.add(deriveObjectKeys(row.eventId, row.id).moderation);
  await Promise.all(Array.from(objectKeys).map(async (key) => {
    try {
      await storage.deleteObject(key);
    } catch (error) {
      console.error("[memories/guest-delete] failed to delete an R2 object (non-fatal)", { mediaId, key, error });
    }
  }));

  return "deleted";
}
