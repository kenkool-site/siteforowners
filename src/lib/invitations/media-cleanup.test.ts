import assert from "node:assert/strict";
import test from "node:test";
import { cleanupInvitationMedia, type ExactReferencePage } from "./media-cleanup";

const oldDate = "2026-09-10T00:00:00.000Z";
const now = new Date("2026-09-14T00:00:00.000Z");

test("cleanup paginates more than one thousand singleton and gallery references before deleting", async () => {
  const eventPaths = Array.from({ length: 1_001 }, (_, index) => `event-${index}/cover/live.jpg`);
  const galleryPaths = Array.from({ length: 1_001 }, (_, index) => `event-${index}/gallery/live.jpg`);
  const eventRanges: Array<[number, number]> = [];
  const galleryRanges: Array<[number, number]> = [];
  const deleted: string[] = [];

  const page = <T>(rows: T[], from: number, to: number): ExactReferencePage<T> => ({
    rows: rows.slice(from, to + 1),
    total: rows.length,
  });
  const result = await cleanupInvitationMedia({
    now,
    listObjects: async () => [
      { path: eventPaths[1_000]!, createdAt: oldDate },
      { path: galleryPaths[1_000]!, createdAt: oldDate },
      { path: "event-orphan/cover/old.jpg", createdAt: oldDate },
    ],
    listEventReferences: async (from, to) => {
      eventRanges.push([from, to]);
      return page(eventPaths.map((path) => ({ designedInvitePath: null, coverImagePath: path, videoPath: null })), from, to);
    },
    listGalleryReferences: async (from, to) => {
      galleryRanges.push([from, to]);
      return page(galleryPaths.map((storagePath) => ({ storagePath })), from, to);
    },
    removeObject: async (path) => { deleted.push(path); },
  });

  assert.deepEqual(eventRanges, [[0, 999], [1_000, 1_999]]);
  assert.deepEqual(galleryRanges, [[0, 999], [1_000, 1_999]]);
  assert.deepEqual(deleted, ["event-orphan/cover/old.jpg"]);
  assert.deepEqual(result, { scanned: 3, deleted: 1, failed: 0 });
});

test("cleanup fails closed without deleting when a later reference page fails", async () => {
  const deleted: string[] = [];
  await assert.rejects(cleanupInvitationMedia({
    now,
    listObjects: async () => [{ path: "event-1/cover/old.jpg", createdAt: oldDate }],
    listEventReferences: async () => ({ rows: [], total: 0 }),
    listGalleryReferences: async (from) => {
      if (from === 0) return { rows: Array.from({ length: 1_000 }, (_, index) => ({ storagePath: `g/${index}` })), total: 1_001 };
      throw new Error("database unavailable");
    },
    removeObject: async (path) => { deleted.push(path); },
  }), /database unavailable/);
  assert.deepEqual(deleted, []);
});

test("cleanup fails closed when an exact count is missing or a page is incomplete", async () => {
  for (const eventPage of [
    { rows: [], total: null },
    { rows: [], total: 1 },
  ] satisfies Array<ExactReferencePage<{ designedInvitePath: null; coverImagePath: null; videoPath: null }>>) {
    const deleted: string[] = [];
    await assert.rejects(cleanupInvitationMedia({
      now,
      listObjects: async () => [{ path: "event-1/cover/old.jpg", createdAt: oldDate }],
      listEventReferences: async () => eventPage,
      listGalleryReferences: async () => ({ rows: [], total: 0 }),
      removeObject: async (path) => { deleted.push(path); },
    }), /complete invitation media references/);
    assert.deepEqual(deleted, []);
  }
});
