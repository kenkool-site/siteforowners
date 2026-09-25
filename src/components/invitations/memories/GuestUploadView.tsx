"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GuestUploadPreview } from "@/lib/invitations/memories/guest-gallery-presentation";
import { createUploadQueue, type QueueItem, type UploadQueue } from "@/lib/invitations/memories/upload-queue";

const UNSUPPORTED_TYPES = new Set(["image/heic", "image/heif"]);
const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_DURATION_SECONDS = 60;
const ERROR_QUOTA = "quota";
const ERROR_WINDOW_CLOSED = "window_closed";
const ERROR_GENERIC = "generic";
const TERMINAL_UPLOAD_ERRORS = new Set([ERROR_QUOTA, ERROR_WINDOW_CLOSED]);
const PREVIEW_LIFETIME_MS = 30_000;

function isVideoFile(file: File): boolean {
  return VIDEO_CONTENT_TYPES.has(file.type);
}

// Pure and unit-testable in isolation from the real (unmockable-in-jsdom)
// video-duration-reading step below.
function exceedsMaxVideoDuration(durationSeconds: number): boolean {
  return durationSeconds > MAX_VIDEO_DURATION_SECONDS;
}

// Reads a video File's duration by loading it into a detached <video> element.
// Not unit-testable under jsdom (no real media decoding) — verified manually
// per the video-support design spec's Testing section.
function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("could not read video duration"));
    };
    video.src = URL.createObjectURL(file);
  });
}

// Longest-side cap for a captured poster frame. Without this, a 4K phone
// video produces a multi-megabyte JPEG — needlessly large for every guest to
// download as a grid thumbnail, and risky as the Rekognition moderation
// input: a high-entropy full-resolution frame can exceed Rekognition's 5MB
// Image.Bytes hard limit, which throws and leaves the row stuck moderating
// forever. 1600px is generous headroom for a crisp thumbnail/lightbox poster
// while keeping the JPEG comfortably small.
const MAX_POSTER_DIMENSION_PX = 1600;

// Captures a frame from a video File as a JPEG File, for use as the poster.
// Same jsdom limitation as above — canvas drawImage/toBlob needs a real
// browser. Verified manually.
function capturePosterFrame(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadeddata = () => {
      // Scale down to MAX_POSTER_DIMENSION_PX on the longest side, preserving
      // aspect ratio — never upscale a video already smaller than the cap.
      const scale = Math.min(1, MAX_POSTER_DIMENSION_PX / Math.max(video.videoWidth, video.videoHeight));
      const scaledWidth = Math.round(video.videoWidth * scale);
      const scaledHeight = Math.round(video.videoHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(video.src);
        reject(new Error("could not get canvas context"));
        return;
      }
      // The 5-argument overload draws (and resamples) into the scaled
      // destination size — using the native-size overload here would still
      // write full-resolution pixel data into a canvas whose *declared*
      // dimensions merely look smaller.
      ctx.drawImage(video, 0, 0, scaledWidth, scaledHeight);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(video.src);
        if (!blob) {
          reject(new Error("could not capture poster frame"));
          return;
        }
        resolve(new File([blob], "poster.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.85);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("could not load video for poster capture"));
    };
    video.src = URL.createObjectURL(file);
  });
}

async function uploadOne(eventId: string, file: File, posterFile: File | undefined, onProgress: (percent: number) => void): Promise<{ mediaId: string }> {
  const mediaKind = isVideoFile(file) ? "video" : "photo";
  const initRes = await fetch(`/api/memories/events/${eventId}/upload/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaKind, contentType: file.type, sizeBytes: file.size }),
  });
  if (!initRes.ok) {
    if (initRes.status === 429) throw new Error(ERROR_QUOTA);
    if (initRes.status === 404) throw new Error(ERROR_WINDOW_CLOSED);
    throw new Error(ERROR_GENERIC);
  }
  const { mediaId, ticket, uploadUrl, posterUploadUrl } = await initRes.json();

  async function putFile(url: string, body: File, trackProgress: boolean): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("content-type", body.type);
      if (trackProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100));
        });
      }
      xhr.addEventListener("error", () => reject(new Error("upload failed")));
      xhr.addEventListener("load", () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload failed")));
      xhr.send(body);
    });
  }

  await putFile(uploadUrl, file, true);
  if (mediaKind === "video" && posterFile && posterUploadUrl) {
    await putFile(posterUploadUrl, posterFile, false);
  }

  const completeRes = await fetch(`/api/memories/events/${eventId}/upload/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaId, ticket }),
  });
  if (!completeRes.ok) throw new Error("upload completion failed");
  return { mediaId };
}

function failureMessageKey(error: string | undefined): "quotaError" | "windowClosedError" | "genericError" | "failed" {
  if (error === ERROR_QUOTA) return "quotaError";
  if (error === ERROR_WINDOW_CLOSED) return "windowClosedError";
  if (error === ERROR_GENERIC) return "genericError";
  return "failed";
}

export function GuestUploadView({ eventId, accent, onItemsChange }: { eventId: string; accent: string; onItemsChange: (items: GuestUploadPreview[]) => void }) {
  const t = useTranslations("invitations.public.memories.upload");
  const tLanding = useTranslations("invitations.public.memories.landing");
  const [items, setItems] = useState<GuestUploadPreview[]>([]);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const queueRef = useRef<UploadQueue | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef(new Map<string, string>());
  const completedAtRef = useRef(new Map<string, number>());
  const statusRef = useRef(new Map<string, QueueItem["status"]>());
  const dismissTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishItems = useCallback((queueItems: QueueItem[]) => {
    const next = queueItems.map((item) => ({ ...item, previewUrl: previewsRef.current.get(item.id), completedAt: completedAtRef.current.get(item.id) }));
    setItems(next);
    onItemsChange(next);
  }, [onItemsChange]);

  useEffect(() => {
    const dismissTimers = dismissTimersRef.current;
    const previews = previewsRef.current;
    const queue = createUploadQueue(eventId, (file, posterFile, onProgress) => uploadOne(eventId, file, posterFile, onProgress));
    queueRef.current = queue;
    const unsubscribe = queue.subscribe((queueItems) => {
      const liveIds = new Set(queueItems.map((item) => item.id));
      for (const [id, url] of Array.from(previewsRef.current.entries())) {
        if (!liveIds.has(id)) {
          URL.revokeObjectURL(url);
          previewsRef.current.delete(id);
        }
      }
      for (const item of queueItems) {
        const previous = statusRef.current.get(item.id);
        if (item.status === "done" && !completedAtRef.current.has(item.id)) {
          completedAtRef.current.set(item.id, Date.now());
          if (previous && previous !== "done") {
            setSuccessCount((count) => count + 1);
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
            successTimerRef.current = setTimeout(() => setSuccessCount(0), 3_500);
          }
          dismissTimersRef.current.set(item.id, setTimeout(() => queue.dismiss(item.id), PREVIEW_LIFETIME_MS));
        }
        statusRef.current.set(item.id, item.status);
      }
      publishItems(queueItems);
    });
    return () => {
      unsubscribe();
      queueRef.current = null;
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      dismissTimers.forEach(clearTimeout);
      dismissTimers.clear();
      previews.forEach((url) => URL.revokeObjectURL(url));
      previews.clear();
    };
  }, [eventId, publishItems]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !queueRef.current) return;
    setRejectionError(null);
    for (const file of Array.from(fileList)) {
      if (UNSUPPORTED_TYPES.has(file.type)) {
        setRejectionError(t("heicError"));
        continue;
      }
      if (isVideoFile(file)) {
        try {
          const duration = await readVideoDurationSeconds(file);
          if (exceedsMaxVideoDuration(duration)) {
            setRejectionError(t("videoTooLongError"));
            continue;
          }
          const poster = await capturePosterFrame(file);
          const id = await queueRef.current.enqueue(file, poster);
          previewsRef.current.set(id, URL.createObjectURL(file));
          publishItems(queueRef.current.getItems());
        } catch {
          setRejectionError(t("genericError"));
        }
        continue;
      }
      const id = await queueRef.current.enqueue(file);
      previewsRef.current.set(id, URL.createObjectURL(file));
      publishItems(queueRef.current.getItems());
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const active = items.filter((item) => item.status === "queued" || item.status === "uploading");
  const failed = items.filter((item) => item.status === "failed");
  const overallProgress = active.length ? Math.round(active.reduce((total, item) => total + item.progress, 0) / active.length) : 0;

  return (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} />

      <div className="pointer-events-none fixed inset-x-4 bottom-[9.25rem] z-40 mx-auto flex max-w-xl flex-col items-center gap-2">
        {rejectionError && <div role="alert" className="pointer-events-auto flex w-full items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm text-red-700 shadow-lg ring-1 ring-black/5"><span>{rejectionError}</span><button type="button" aria-label={t("dismiss")} onClick={() => setRejectionError(null)}><X className="size-4" /></button></div>}
        {failed.slice(0, 1).map((item) => <div key={item.id} role="alert" className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-black/5">
          <p className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium">{item.fileName}</span><span className="text-red-700">{t(failureMessageKey(item.error))}</span></p>
          {!TERMINAL_UPLOAD_ERRORS.has(item.error ?? "") && <button type="button" onClick={() => queueRef.current?.retry(item.id)} className="text-sm font-semibold" style={{ color: accent }}>{t("retry")}</button>}
          <button type="button" aria-label={t("dismiss")} onClick={() => queueRef.current?.dismiss(item.id)}><X className="size-4" /></button>
        </div>)}
        {active.length > 0 && <div className="w-full rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-4 text-sm font-medium"><span>{t("uploadingCount", { count: active.length })}</span><span>{overallProgress}%</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full transition-[width]" style={{ width: `${overallProgress}%`, backgroundColor: accent }} /></div>
        </div>}
        {successCount > 0 && active.length === 0 && <div role="status" className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold shadow-lg ring-1 ring-black/5"><span className="grid size-6 place-items-center rounded-full text-white" style={{ backgroundColor: accent }}><Check className="size-4" /></span>{t("added", { count: successCount })}</div>}
      </div>

      <div className="fixed inset-x-4 bottom-[4.75rem] z-30 mx-auto max-w-xl">
        <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full px-6 py-3 text-base font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ backgroundColor: accent, outlineColor: accent }}>
          <Camera className="size-5" />{tLanding("addPhotos")}
        </button>
      </div>
    </>
  );
}
