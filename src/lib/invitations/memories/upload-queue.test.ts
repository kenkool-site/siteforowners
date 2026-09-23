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
  const queue = createUploadQueue("event-4", () => {
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

test("a new queue instance for the same event hydrates a previously failed item, and retry() on it genuinely re-uploads", async () => {
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
  let retriedFile: File | undefined;
  const queue2 = createUploadQueue(eventId, async (file) => {
    retriedFile = file;
    return { mediaId: "media-6-retry" };
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const hydrated = queue2.getItems().find((i) => i.id === id);
  assert.ok(hydrated);
  assert.equal(hydrated!.status, "failed");

  // Prove the File payload actually survived the IndexedDB round-trip well enough to
  // genuinely re-upload — not just that the row exists with the right status.
  queue2.retry(id);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const retried = queue2.getItems().find((i) => i.id === id);
  assert.equal(retried!.status, "done");
  assert.equal(retried!.mediaId, "media-6-retry");
  assert.ok(retriedFile);
  // Not asserting retriedFile!.name here: fake-indexeddb's structured-clone implementation
  // degrades a File to a plain Blob on round-trip (confirmed by direct inspection — size,
  // type, and byte content all survive; the File-specific `name` does not). Real browser
  // IndexedDB fully preserves File objects per spec, so this is a test-shim limitation, not
  // upload-queue.ts behavior — size/type/content are what actually matters for re-upload.
  assert.equal(retriedFile!.size, 1000);
  assert.equal(retriedFile!.type, "image/jpeg");
});

test("same-tick batch enqueues hydrate in original enqueue order despite millisecond timestamp collisions", async () => {
  const eventId = "event-7";
  // Everything fails so the array order set at hydration time is never disturbed further —
  // isolates the ordering fix from any processing/race behavior.
  const queue1 = createUploadQueue(eventId, async () => {
    throw new Error("network error");
  });
  // Deliberately no `await` between these — this is the normal shape of a multi-file
  // <input multiple> picker handler, and the exact scenario that made every item share the
  // same Date.now() millisecond before the seq-counter fix.
  const p1 = queue1.enqueue(fakeFile("h1.jpg", 1000));
  const p2 = queue1.enqueue(fakeFile("h2.jpg", 1000));
  const p3 = queue1.enqueue(fakeFile("h3.jpg", 1000));
  const p4 = queue1.enqueue(fakeFile("h4.jpg", 1000));
  const p5 = queue1.enqueue(fakeFile("h5.jpg", 1000));
  const ids = await Promise.all([p1, p2, p3, p4, p5]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  for (const id of ids) {
    assert.equal(queue1.getItems().find((i) => i.id === id)!.status, "failed");
  }

  const queue2 = createUploadQueue(eventId, async () => ({ mediaId: "unused" }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const hydratedIds = queue2.getItems().map((i) => i.id);
  assert.deepEqual(hydratedIds, ids);
});

test("dismiss removes a completed upload from the visible and persisted queue", async () => {
  const eventId = "event-8";
  const queue = createUploadQueue(eventId, async () => ({ mediaId: "media-8" }));
  const id = await queue.enqueue(fakeFile("finished.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(queue.getItems().find((item) => item.id === id)?.status, "done");

  queue.dismiss(id);
  assert.equal(queue.getItems().some((item) => item.id === id), false);

  const hydrated = createUploadQueue(eventId, async () => ({ mediaId: "unused" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(hydrated.getItems().some((item) => item.id === id), false);
});
