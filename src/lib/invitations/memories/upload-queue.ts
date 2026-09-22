// src/lib/invitations/memories/upload-queue.ts
export type QueueItemStatus = "queued" | "uploading" | "done" | "failed";

export interface QueueItem {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: QueueItemStatus;
  progress: number;
  error?: string;
  mediaId?: string;
}

export type UploadOneFn = (file: File, onProgress: (percent: number) => void) => Promise<{ mediaId: string }>;

export interface UploadQueue {
  enqueue(file: File): Promise<string>;
  retry(id: string): void;
  subscribe(listener: (items: QueueItem[]) => void): () => void;
  getItems(): QueueItem[];
}

const DB_NAME = "memories-upload-queue";
const DB_VERSION = 1;
const STORE_NAME = "items";

function openDb(eventId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${DB_NAME}-${eventId}`, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

interface PersistedEntry {
  id: string;
  file: File;
  item: QueueItem;
  // Enqueue timestamp, used only to restore enqueue order on hydration — IndexedDB's
  // getAll() returns rows ordered by the "id" key (a random UUID), not insertion order.
  createdAt: number;
}

async function persistItem(db: IDBDatabase, entry: PersistedEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readAllItems(db: IDBDatabase): Promise<PersistedEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as PersistedEntry[] | undefined) ?? []);
    request.onerror = () => reject(request.error);
  });
}

export function createUploadQueue(eventId: string, uploadOne: UploadOneFn): UploadQueue {
  const files = new Map<string, File>();
  const items: QueueItem[] = [];
  const createdAtById = new Map<string, number>();
  const listeners = new Set<(items: QueueItem[]) => void>();
  let dbPromise: Promise<IDBDatabase> | null = null;
  let processing = false;

  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) dbPromise = openDb(eventId);
    return dbPromise;
  }

  function notify(): void {
    const snapshot = items.map((i) => ({ ...i }));
    listeners.forEach((listener) => listener(snapshot));
  }

  function findItem(id: string): QueueItem | undefined {
    return items.find((i) => i.id === id);
  }

  async function processNext(): Promise<void> {
    if (processing) return;
    const next = items.find((i) => i.status === "queued");
    if (!next) return;
    processing = true;
    next.status = "uploading";
    notify();
    try {
      const file = files.get(next.id)!;
      const result = await uploadOne(file, (percent) => {
        next.progress = percent;
        notify();
      });
      next.status = "done";
      next.progress = 100;
      next.mediaId = result.mediaId;
    } catch (error) {
      next.status = "failed";
      next.error = error instanceof Error ? error.message : "upload failed";
    }
    notify();
    const db = await getDb();
    await persistItem(db, {
      id: next.id,
      file: files.get(next.id)!,
      item: { ...next },
      createdAt: createdAtById.get(next.id) ?? Date.now(),
    });
    processing = false;
    void processNext();
  }

  // Hydration restores queue state from a previous page load (closed tab, refresh, dropped
  // connection). It's deliberately fire-and-forget: createUploadQueue() returns synchronously
  // to match the UploadQueue interface Task 4 consumes (not a Promise<UploadQueue>), so a
  // caller that calls getItems() synchronously right after construction, before this resolves,
  // may still see an empty array. Real consumers use subscribe(), which does receive the
  // restored state once hydration completes and calls notify().
  void (async function hydrate() {
    const db = await getDb();
    const entries = await readAllItems(db);
    entries.sort((a, b) => a.createdAt - b.createdAt);
    const restored: QueueItem[] = [];
    for (const entry of entries) {
      const item: QueueItem = { ...entry.item };
      if (item.status === "queued" || item.status === "uploading") {
        // A mid-flight upload from a previous page load is gone — there's no partial-upload
        // resume, so the whole file goes back to the front of the line to upload again.
        item.status = "queued";
        item.progress = 0;
        item.error = undefined;
      }
      files.set(entry.id, entry.file);
      createdAtById.set(entry.id, entry.createdAt);
      restored.push(item);
    }
    if (restored.length > 0) {
      items.unshift(...restored);
      notify();
      void processNext();
    }
  })();

  return {
    async enqueue(file: File): Promise<string> {
      const id = crypto.randomUUID();
      const item: QueueItem = {
        id,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        status: "queued",
        progress: 0,
      };
      const createdAt = Date.now();
      files.set(id, file);
      createdAtById.set(id, createdAt);
      items.push(item);
      const db = await getDb();
      await persistItem(db, { id, file, item: { ...item }, createdAt });
      notify();
      void processNext();
      return id;
    },
    retry(id: string): void {
      const item = findItem(id);
      if (!item || item.status !== "failed") return;
      item.status = "queued";
      item.error = undefined;
      item.progress = 0;
      notify();
      void processNext();
    },
    subscribe(listener: (items: QueueItem[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getItems(): QueueItem[] {
      return items.map((i) => ({ ...i }));
    },
  };
}
