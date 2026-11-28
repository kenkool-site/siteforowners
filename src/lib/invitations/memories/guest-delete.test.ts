import assert from "node:assert/strict";
import test from "node:test";
import { deleteOwnMemoryMedia, GUEST_DELETE_WINDOW_SECONDS } from "./guest-delete";
import type { MemoryMedia } from "./types";
import type { StorageProvider } from "./storage-provider";
import type { StreamConfig } from "./stream";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const STREAM_CONFIG: StreamConfig = { accountId: "a", apiToken: "t", signingKeyId: "k", signingKeyJwk: "j" };

function row(overrides: Partial<MemoryMedia> = {}): MemoryMedia {
  return {
    id: "media-1",
    eventId: "event-1",
    uploaderSessionId: "session-1",
    uploadedAt: new Date(NOW - 10 * 60 * 1000).toISOString(),
    objectKeyOriginal: "originals/event-1/media-1.jpg",
    objectKeyDisplay: "display/event-1/media-1.jpg",
    objectKeyThumbnail: "thumb/event-1/media-1.jpg",
    ...overrides,
  } as MemoryMedia;
}

function harness(mediaRow: MemoryMedia | null, options: { rowDeletes?: boolean; failStorage?: boolean } = {}) {
  const deletedKeys: string[] = [];
  const streamDeletes: string[] = [];
  let rowDeleteArgs: unknown[] | null = null;
  const storage = {
    async deleteObject(key: string) {
      if (options.failStorage) throw new Error("r2 down");
      deletedKeys.push(key);
    },
  } as unknown as StorageProvider;
  const dependencies = {
    getMemoryMediaById: async () => mediaRow,
    deleteOwnRecentMemoryMediaRow: async (...args: unknown[]) => {
      rowDeleteArgs = args;
      return options.rowDeletes ?? true;
    },
    deleteStreamVideo: async (_config: StreamConfig, uid: string) => {
      streamDeletes.push(uid);
      return true;
    },
    getStreamConfig: () => STREAM_CONFIG,
    storage,
  };
  return { dependencies, deletedKeys, streamDeletes, rowDeleteArgs: () => rowDeleteArgs };
}

test("deletes the row, R2 objects, and Stream copy for the uploader inside the window", async () => {
  const h = harness(row({ streamUid: "stream-1" }));
  const outcome = await deleteOwnMemoryMedia("event-1", "media-1", "session-1", h.dependencies, NOW);
  assert.equal(outcome, "deleted");
  assert.deepEqual(h.streamDeletes, ["stream-1"]);
  assert.ok(h.deletedKeys.includes("originals/event-1/media-1.jpg"));
  assert.ok(h.deletedKeys.includes("display/event-1/media-1.jpg"));
  assert.ok(h.deletedKeys.some((key) => key.includes("moderation")));
  const [eventId, mediaId, sessionId, cutoff] = h.rowDeleteArgs() as string[];
  assert.deepEqual([eventId, mediaId, sessionId], ["event-1", "media-1", "session-1"]);
  assert.equal(cutoff, new Date(NOW - GUEST_DELETE_WINDOW_SECONDS * 1000).toISOString());
});

test("someone else's session is refused and nothing is touched", async () => {
  const h = harness(row());
  assert.equal(await deleteOwnMemoryMedia("event-1", "media-1", "session-2", h.dependencies, NOW), "not_owner");
  assert.equal(h.rowDeleteArgs(), null);
  assert.deepEqual(h.deletedKeys, []);
});

test("an upload older than the window is refused", async () => {
  const h = harness(row({ uploadedAt: new Date(NOW - (GUEST_DELETE_WINDOW_SECONDS + 60) * 1000).toISOString() }));
  assert.equal(await deleteOwnMemoryMedia("event-1", "media-1", "session-1", h.dependencies, NOW), "window_closed");
  assert.equal(h.rowDeleteArgs(), null);
});

test("a row the conditional SQL delete no longer matches reports not_found and skips storage", async () => {
  const h = harness(row(), { rowDeletes: false });
  assert.equal(await deleteOwnMemoryMedia("event-1", "media-1", "session-1", h.dependencies, NOW), "not_found");
  assert.deepEqual(h.deletedKeys, []);
});

test("wrong event or missing row reports not_found", async () => {
  const h = harness(row());
  assert.equal(await deleteOwnMemoryMedia("event-2", "media-1", "session-1", h.dependencies, NOW), "not_found");
  assert.equal(await deleteOwnMemoryMedia("event-1", "media-1", "session-1", harness(null).dependencies, NOW), "not_found");
});

test("storage failures stay non-fatal once the row is gone", async () => {
  const h = harness(row(), { failStorage: true });
  assert.equal(await deleteOwnMemoryMedia("event-1", "media-1", "session-1", h.dependencies, NOW), "deleted");
});
