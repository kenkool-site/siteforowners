// src/components/invitations/memories/GuestUploadView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createUploadQueue, type QueueItem, type UploadQueue } from "@/lib/invitations/memories/upload-queue";

const UNSUPPORTED_TYPES = new Set(["image/heic", "image/heif"]);

async function uploadOne(
  eventId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ mediaId: string }> {
  const initRes = await fetch(`/api/memories/events/${eventId}/upload/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaKind: "photo", contentType: file.type, sizeBytes: file.size }),
  });
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new Error(body.error ?? "upload initialization failed");
  }
  const { mediaId, ticket, uploadUrl } = await initRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("error", () => reject(new Error("upload failed")));
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("upload failed"));
    });
    xhr.send(file);
  });

  const completeRes = await fetch(`/api/memories/events/${eventId}/upload/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaId, ticket }),
  });
  if (!completeRes.ok) throw new Error("upload completion failed");
  return { mediaId };
}

export function GuestUploadView({ eventId, accent }: { eventId: string; accent: string }) {
  const t = useTranslations("invitations.public.memories.upload");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const queueRef = useRef<UploadQueue | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const queue = createUploadQueue(eventId, (file, onProgress) => uploadOne(eventId, file, onProgress));
    queueRef.current = queue;
    return queue.subscribe(setItems);
  }, [eventId]);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || !queueRef.current) return;
    setRejectionError(null);
    for (const file of Array.from(fileList)) {
      if (UNSUPPORTED_TYPES.has(file.type)) {
        setRejectionError(t("heicError"));
        continue;
      }
      void queueRef.current.enqueue(file);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        capture="environment"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="min-h-12 rounded-md px-4 py-3 text-sm font-semibold text-white"
        style={{ backgroundColor: accent }}
      >
        {items.length > 0 ? t("addMore") : t("addMore")}
      </button>
      {rejectionError && <p role="alert" className="text-sm text-red-700">{rejectionError}</p>}
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border border-gray-200 p-3">
            <p className="truncate text-sm font-medium">{item.fileName}</p>
            {item.status === "queued" && <p className="text-sm text-gray-500">{t("queued")}</p>}
            {item.status === "uploading" && (
              <>
                <p className="text-sm text-gray-500">{t("uploading", { percent: item.progress })}</p>
                <progress value={item.progress} max={100} className="mt-1 block h-2 w-full" style={{ accentColor: accent }} />
              </>
            )}
            {item.status === "done" && <p className="text-sm text-green-700">{t("done")}</p>}
            {item.status === "failed" && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-red-700">{t("failed")}</p>
                <button
                  type="button"
                  onClick={() => queueRef.current?.retry(item.id)}
                  className="min-h-8 rounded-md border px-3 text-sm font-semibold"
                  style={{ borderColor: accent, color: accent }}
                >
                  {t("retry")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
