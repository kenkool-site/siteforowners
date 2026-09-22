// src/lib/invitations/memories/upload-queue.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { createUploadQueue } from "./upload-queue";

function fakeFile(name: string, bytes: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

test("enqueue adds a queued item and starts uploading it", async () => {
  const queue = createUploadQueue("event-1", async (_file, onProgress) => {
    onProgress(50);
    onProgress(100);
    return { mediaId: "media-1" };
  });
  const id = await queue.enqueue(fakeFile("a.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.ok(item);
  assert.equal(item!.status, "done");
  assert.equal(item!.progress, 100);
  assert.equal(item!.mediaId, "media-1");
});

test("a failed upload marks the item failed and does not auto-retry", async () => {
  let attempts = 0;
  const queue = createUploadQueue("event-2", async () => {
    attempts += 1;
    throw new Error("network error");
  });
  const id = await queue.enqueue(fakeFile("b.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.equal(item!.status, "failed");
  assert.equal(attempts, 1);
});

test("retry re-attempts a failed item", async () => {
  let attempts = 0;
  const queue = createUploadQueue("event-3", async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("network error");
    return { mediaId: "media-3" };
  });
  const id = await queue.enqueue(fakeFile("c.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  queue.retry(id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.equal(item!.status, "done");
  assert.equal(attempts, 2);
});

test("a second enqueue while one item is uploading stays queued, not uploading", async () => {
  let resolveFirst!: () => void;
  const queue = createUploadQueue("event-4", (_file, _onProgress) => {
    return new Promise((resolve) => {
      resolveFirst = () => resolve({ mediaId: "media-4a" });
    });
  });
  await queue.enqueue(fakeFile("d.jpg", 1000));
  const secondId = await queue.enqueue(fakeFile("e.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(queue.getItems().find((i) => i.id === secondId)!.status, "queued");
  resolveFirst();
});

test("subscribe notifies listeners on every state change", async () => {
  const queue = createUploadQueue("event-5", async () => ({ mediaId: "media-5" }));
  const snapshots: number[] = [];
  const unsubscribe = queue.subscribe((items) => snapshots.push(items.length));
  await queue.enqueue(fakeFile("f.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(snapshots.length >= 2); // at least: queued, then done
  unsubscribe();
});

test("a new queue instance for the same event hydrates a previously failed item from IndexedDB", async () => {
  const eventId = "event-6";
  const queue1 = createUploadQueue(eventId, async () => {
    throw new Error("network error");
  });
  const id = await queue1.enqueue(fakeFile("g.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const failedItem = queue1.getItems().find((i) => i.id === id);
  assert.equal(failedItem!.status, "failed");

  // A closed tab / refresh / dropped connection means a brand-new createUploadQueue() call
  // for the same event — it should resume exactly where the previous instance left off by
  // reading what was persisted to IndexedDB, not start from an empty queue.
  const queue2 = createUploadQueue(eventId, async () => ({ mediaId: "should-not-run" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const hydrated = queue2.getItems().find((i) => i.id === id);
  assert.ok(hydrated);
  assert.equal(hydrated!.status, "failed");
});
