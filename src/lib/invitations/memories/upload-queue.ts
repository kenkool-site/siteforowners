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

// posterFile is present only for a video item (the client-captured poster
// JPEG); undefined for a photo. Both files travel and retry together as one
// unit — see the video-support design spec's rationale for not modeling this
// as two separate queue items.
export type UploadOneFn = (file: File, posterFile: File | undefined, onProgress: (percent: number) => void) => Promise<{ mediaId: string }>;

export interface UploadQueue {
  enqueue(file: File, posterFile?: File): Promise<string>;
  retry(id: string): void;
  dismiss(id: string): void;
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
  posterFile?: File;
  item: QueueItem;
  createdAt: number;
  seq: number;
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
    request.onsuccess = () => resolve(request.result as PersistedEntry[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function createUploadQueue(eventId: string, uploadOne: UploadOneFn): UploadQueue {
  // Bundled into one map (not two parallel maps keyed by id) so a file and its
  // optional poster can never drift out of sync with each other.
  const filesById = new Map<string, { file: File; posterFile?: File }>();
  const items: QueueItem[] = [];
  const createdAtById = new Map<string, number>();
  const seqById = new Map<string, number>();
  const listeners = new Set<(items: QueueItem[]) => void>();
  let dbPromise: Promise<IDBDatabase> | null = null;
  let processing = false;
  let nextSeq = 0;

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
      const { file, posterFile } = filesById.get(next.id)!;
      const result = await uploadOne(file, posterFile, (percent) => {
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
    try {
      const db = await getDb();
      const entry = filesById.get(next.id)!;
      await persistItem(db, {
        id: next.id,
        file: entry.file,
        posterFile: entry.posterFile,
        item: { ...next },
        createdAt: createdAtById.get(next.id) ?? Date.now(),
        seq: seqById.get(next.id) ?? 0,
      });
    } catch {
      // Persisting the terminal state failed (storage quota exceeded, private-browsing
      // IndexedDB restrictions, etc). In-memory state and subscribers already reflect the
      // real outcome via notify() above, so the persisted row is briefly stale — an
      // acceptable tradeoff for not leaving `processing` stuck true, which would otherwise
      // permanently freeze the queue for the rest of the session.
    } finally {
      processing = false;
      void processNext();
    }
  }

  void (async function hydrate() {
    const db = await getDb();
    const entries = await readAllItems(db);
    entries.sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq);
    const restored: QueueItem[] = [];
    for (const entry of entries) {
      const item: QueueItem = { ...entry.item };
      if (item.status === "queued" || item.status === "uploading") {
        item.status = "queued";
        item.progress = 0;
        item.error = undefined;
      }
      filesById.set(entry.id, { file: entry.file, posterFile: entry.posterFile });
      createdAtById.set(entry.id, entry.createdAt);
      seqById.set(entry.id, entry.seq);
      restored.push(item);
    }
    if (restored.length > 0) {
      items.unshift(...restored);
      notify();
      void processNext();
    }
  })();

  return {
    async enqueue(file: File, posterFile?: File): Promise<string> {
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
      const seq = nextSeq++;
      filesById.set(id, { file, posterFile });
      createdAtById.set(id, createdAt);
      seqById.set(id, seq);
      items.push(item);
      const db = await getDb();
      await persistItem(db, { id, file, posterFile, item: { ...item }, createdAt, seq });
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
    dismiss(id: string): void {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return;
      items.splice(index, 1);
      filesById.delete(id);
      createdAtById.delete(id);
      seqById.delete(id);
      notify();
      void getDb().then((db) => deleteItem(db, id)).catch(() => undefined);
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
