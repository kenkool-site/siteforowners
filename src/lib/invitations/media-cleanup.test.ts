import assert from "node:assert/strict";
import test from "node:test";
import { cleanupInvitationMedia } from "./media-cleanup";

const oldDate = "2026-09-10T00:00:00.000Z";
const now = new Date("2026-09-14T00:00:00.000Z");

test("one snapshot preserves a live reference beyond one thousand rows", async () => {
  const paths = Array.from({ length: 1_001 }, (_, index) => `event-${index}/cover/live.jpg`);
  const deleted: string[] = [];
  let snapshotReads = 0;
  const result = await cleanupInvitationMedia({
    now,
    listObjects: async () => [
      { path: paths[1_000]!, createdAt: oldDate },
      { path: "event-orphan/cover/old.jpg", createdAt: oldDate },
    ],
    loadReferenceSnapshot: async () => {
      snapshotReads += 1;
      return { paths };
    },
    removeObject: async (path) => { deleted.push(path); },
  });

  assert.equal(snapshotReads, 1);
  assert.deepEqual(deleted, ["event-orphan/cover/old.jpg"]);
  assert.deepEqual(result, { scanned: 2, deleted: 1, failed: 0 });
});

test("cleanup fails closed without deleting when the snapshot RPC fails", async () => {
  const deleted: string[] = [];
  await assert.rejects(cleanupInvitationMedia({
    now,
    listObjects: async () => [{ path: "event-1/cover/old.jpg", createdAt: oldDate }],
    loadReferenceSnapshot: async () => { throw new Error("database unavailable"); },
    removeObject: async (path) => { deleted.push(path); },
  }), /database unavailable/);
  assert.deepEqual(deleted, []);
});

test("cleanup fails closed when the reference snapshot is malformed", async () => {
  for (const malformed of [null, [], {}, { paths: null }, { paths: ["valid", 7] }]) {
    const deleted: string[] = [];
    await assert.rejects(cleanupInvitationMedia({
      now,
      listObjects: async () => [{ path: "event-1/cover/old.jpg", createdAt: oldDate }],
      loadReferenceSnapshot: async () => malformed,
      removeObject: async (path) => { deleted.push(path); },
    }), /valid invitation media reference snapshot/);
    assert.deepEqual(deleted, []);
  }
});
