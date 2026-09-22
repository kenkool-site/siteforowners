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

async function persistItem(db: IDBDatabase, entry: { id: string; file: File; item: QueueItem }): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function createUploadQueue(eventId: string, uploadOne: UploadOneFn): UploadQueue {
  const files = new Map<string, File>();
  const items: QueueItem[] = [];
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
    await persistItem(db, { id: next.id, file: files.get(next.id)!, item: { ...next } });
    processing = false;
    void processNext();
  }

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
      files.set(id, file);
      items.push(item);
      const db = await getDb();
      await persistItem(db, { id, file, item: { ...item } });
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
