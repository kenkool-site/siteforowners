import assert from "node:assert/strict";
import test from "node:test";
import type { MemoryMedia } from "@/lib/invitations/memories/types";
import type { PermanentlyDeleteDependencies } from "./permanent-delete";
import { permanentlyDeleteMemoryMedia } from "./permanent-delete";

test("permanent-delete module loads under tsx --test", async () => {
  const mod = await import("./permanent-delete");
  assert.equal(typeof mod.permanentlyDeleteMemoryMedia, "function");
});

function media(overrides: Partial<MemoryMedia> & { id: string }): MemoryMedia {
  return {
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderSessionId: null,
    uploaderDisplayName: "Jamie",
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: `originals/${overrides.id}.jpg`,
    objectKeyDisplay: `display/event-1/${overrides.id}.webp`,
    objectKeyThumbnail: `thumbnails/event-1/${overrides.id}.webp`,
    capturedAt: "2026-09-22T20:00:00Z",
    uploadedAt: "2026-09-22T20:01:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "rejected",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  };
}

function fakeStorage(deletedKeys: string[], failingKeys: Set<string> = new Set()) {
  return {
    createPresignedUploadUrl: async () => {
      throw new Error("not used by permanent-delete");
    },
    getSignedDownloadUrl: async () => {
      throw new Error("not used by permanent-delete");
    },
    objectExists: async () => {
      throw new Error("not used by permanent-delete");
    },
    deleteObject: async (objectKey: string) => {
      deletedKeys.push(objectKey);
      if (failingKeys.has(objectKey)) throw new Error(`simulated delete failure for ${objectKey}`);
    },
  };
}

function baseDependencies(overrides: PermanentlyDeleteDependencies = {}): PermanentlyDeleteDependencies {
  return {
    listRejectedMemoryMediaByIds: async () => {
      throw new Error("listRejectedMemoryMediaByIds not stubbed for this test");
    },
    deleteMemoryMediaRows: async () => {
      throw new Error("deleteMemoryMediaRows not stubbed for this test");
    },
    storage: fakeStorage([]),
    ...overrides,
  };
}

test("returns an empty array and deletes nothing when no rows are still rejected", async () => {
  const deletedKeys: string[] = [];
  let deleteRowsCalled = false;
  const result = await permanentlyDeleteMemoryMedia("event-1", ["missing-1"], baseDependencies({
    listRejectedMemoryMediaByIds: async () => [],
    deleteMemoryMediaRows: async () => {
      deleteRowsCalled = true;
      return [];
    },
    storage: fakeStorage(deletedKeys),
  }));
  assert.deepEqual(result, []);
  assert.equal(deleteRowsCalled, false);
  assert.deepEqual(deletedKeys, []);
});

test("deletes original, display, thumbnail, and the derived moderation key for a photo", async () => {
  const deletedKeys: string[] = [];
  const row = media({ id: "photo-1" });
  const result = await permanentlyDeleteMemoryMedia("event-1", ["photo-1"], baseDependencies({
    listRejectedMemoryMediaByIds: async () => [row],
    deleteMemoryMediaRows: async (_eventId, ids) => ids,
    storage: fakeStorage(deletedKeys),
  }));
  assert.deepEqual(result, ["photo-1"]);
  assert.deepEqual(new Set(deletedKeys), new Set([
    "originals/photo-1.jpg",
    "display/event-1/photo-1.webp",
    "thumbnails/event-1/photo-1.webp",
    "moderation/event-1/photo-1.jpg",
  ]));
});

// Video rows store the same key in both objectKeyOriginal and
// objectKeyDisplay (see markVideoMemoryMediaReady) — the object-key set must
// dedup rather than issue a pointless duplicate delete.
test("dedups a video's identical original/display key instead of deleting it twice", async () => {
  const deletedKeys: string[] = [];
  const row = media({
    id: "video-1",
    mediaKind: "video",
    objectKeyOriginal: "originals/video-1.mp4",
    objectKeyDisplay: "originals/video-1.mp4",
    objectKeyThumbnail: "posters/event-1/video-1.jpg",
  });
  await permanentlyDeleteMemoryMedia("event-1", ["video-1"], baseDependencies({
    listRejectedMemoryMediaByIds: async () => [row],
    deleteMemoryMediaRows: async (_eventId, ids) => ids,
    storage: fakeStorage(deletedKeys),
  }));
  assert.deepEqual(new Set(deletedKeys), new Set([
    "originals/video-1.mp4",
    "posters/event-1/video-1.jpg",
    "moderation/event-1/video-1.jpg",
  ]));
  assert.equal(deletedKeys.filter((key) => key === "originals/video-1.mp4").length, 1);
});

test("an R2 delete failure for one object key does not block deleting the database row", async () => {
  const deletedKeys: string[] = [];
  const row = media({ id: "photo-2" });
  let deleteRowsCalledWith: string[] | null = null;
  const result = await permanentlyDeleteMemoryMedia("event-1", ["photo-2"], baseDependencies({
    listRejectedMemoryMediaByIds: async () => [row],
    deleteMemoryMediaRows: async (_eventId, ids) => {
      deleteRowsCalledWith = ids;
      return ids;
    },
    storage: fakeStorage(deletedKeys, new Set(["originals/photo-2.jpg"])),
  }));
  assert.deepEqual(result, ["photo-2"]);
  assert.deepEqual(deleteRowsCalledWith, ["photo-2"]);
});

test("only requests deletion of rows the repository still confirms as rejected", async () => {
  const rows = [media({ id: "photo-3" }), media({ id: "photo-4" })];
  let deleteRowsCalledWith: string[] | null = null;
  const result = await permanentlyDeleteMemoryMedia("event-1", ["photo-3", "photo-4", "photo-5"], baseDependencies({
    listRejectedMemoryMediaByIds: async () => rows,
    deleteMemoryMediaRows: async (_eventId, ids) => {
      deleteRowsCalledWith = ids;
      return ids;
    },
    storage: fakeStorage([]),
  }));
  assert.deepEqual(new Set(deleteRowsCalledWith), new Set(["photo-3", "photo-4"]));
  assert.deepEqual(new Set(result), new Set(["photo-3", "photo-4"]));
});
