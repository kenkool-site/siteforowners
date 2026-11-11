"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronRight, Images, Plus, Shield, Sparkles, Upload, User, Video, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GuestUploadPreview } from "@/lib/invitations/memories/guest-gallery-presentation";
import { guestNameSkippedKey, suggestMomentId } from "@/lib/invitations/memories/guest-presentation";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import { createUploadQueue, type QueueItem, type UploadQueue } from "@/lib/invitations/memories/upload-queue";
import { PlanningSoftLink } from "./MemoriesChrome";

const videoDurations = new WeakMap<File, number>();

const UNSUPPORTED_TYPES = new Set(["image/heic", "image/heif"]);
const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_DURATION_SECONDS = 60;
const ERROR_QUOTA = "quota";
const ERROR_WINDOW_CLOSED = "window_closed";
const ERROR_TOO_LARGE = "too_large";
const ERROR_UNSUPPORTED_TYPE = "unsupported_type";
const ERROR_GENERIC = "generic";
// Retrying the same file can't help any of these — they're a property of the
// file itself (or the event), not a transient network hiccup — so the retry
// button is hidden for all of them, not just quota/window-closed.
const TERMINAL_UPLOAD_ERRORS = new Set([ERROR_QUOTA, ERROR_WINDOW_CLOSED, ERROR_TOO_LARGE, ERROR_UNSUPPORTED_TYPE]);
const PREVIEW_LIFETIME_MS = 30_000;

function isVideoFile(file: File): boolean {
  return VIDEO_CONTENT_TYPES.has(file.type);
}

// Pure and unit-testable in isolation from the real (unmockable-in-jsdom)
// video-duration-reading step below.
function exceedsMaxVideoDuration(durationSeconds: number): boolean {
  return durationSeconds > MAX_VIDEO_DURATION_SECONDS;
}

// WebKit-family browsers (Safari, and iOS browsers like Chrome that Apple
// requires to run on WebKit's engine) have been observed to never fire any
// load event at all on a <video> element that's never attached to the
// document — leaving a guest's video upload hanging forever with no error,
// no queued item, and no network request ever made. Hidden off-screen
// (never display:none, which some engines skip loading for entirely)
// rather than fully detached.
function createHiddenVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);
  return video;
}

// Belt-and-suspenders alongside the DOM-attachment fix above: if a browser
// still never fires any event on the video element, this guarantees the
// guest sees the existing generic upload error within a bounded time
// instead of the file silently never enqueuing at all.
const VIDEO_LOAD_TIMEOUT_MS = 15_000;

// Reads a video File's duration by loading it into a hidden <video> element.
// Not unit-testable under jsdom (no real media decoding) — verified manually
// per the video-support design spec's Testing section.
function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = createHiddenVideoElement();
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("timed out reading video duration"));
    }, VIDEO_LOAD_TIMEOUT_MS);
    function cleanup() {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(video.src);
      video.remove();
    }
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
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

// A short, fixed wait after playback starts, for browsers without
// requestVideoFrameCallback below — long enough for a real frame to decode
// (video renders at 24fps+, so a frame is ready within tens of ms) without
// adding noticeable delay to the guest's upload.
const POSTER_FRAME_FALLBACK_DELAY_MS = 100;

type VideoWithFrameCallback = HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };

// Captures a frame from a video File as a JPEG File, for use as the poster.
// Same jsdom limitation as above — canvas drawImage/toBlob needs a real
// browser. Verified manually.
//
// iPhone's default camera format is HEVC, and WebKit has a known limitation
// where drawImage/toBlob can't reliably grab a frame from an HEVC <video>
// that has only loaded metadata/data — it needs a real decode, which only
// happens once playback actually starts (confirmed live: the guest's exact
// HEVC clip hung on this step in both iOS Safari and iOS Chrome — both
// WebKit — until this played the video briefly before capturing). So this
// starts real (muted, inline, invisible) playback first, waits for an
// actually-decoded frame via requestVideoFrameCallback where available
// (Safari 15.4+ and Chrome-on-iOS, which shares the same WebKit engine) or a
// short fallback delay otherwise, then captures and immediately pauses.
function capturePosterFrame(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = createHiddenVideoElement();
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("timed out capturing poster frame"));
    }, VIDEO_LOAD_TIMEOUT_MS);
    let settled = false;
    function cleanup() {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(video.src);
      video.pause();
      video.remove();
    }
    function captureFrame() {
      if (settled) return;
      settled = true;
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
        cleanup();
        reject(new Error("could not get canvas context"));
        return;
      }
      try {
        // The 5-argument overload draws (and resamples) into the scaled
        // destination size — using the native-size overload here would still
        // write full-resolution pixel data into a canvas whose *declared*
        // dimensions merely look smaller.
        ctx.drawImage(video, 0, 0, scaledWidth, scaledHeight);
      } catch (drawError) {
        cleanup();
        reject(drawError instanceof Error ? drawError : new Error("could not draw video frame"));
        return;
      }
      canvas.toBlob((blob) => {
        cleanup();
        if (!blob) {
          reject(new Error("could not capture poster frame"));
          return;
        }
        resolve(new File([blob], "poster.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.85);
    }
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.onloadedmetadata = () => {
      video
        .play()
        .then(() => {
          const withFrameCallback = (video as VideoWithFrameCallback).requestVideoFrameCallback;
          if (withFrameCallback) withFrameCallback.call(video, captureFrame);
          else setTimeout(captureFrame, POSTER_FRAME_FALLBACK_DELAY_MS);
        })
        // Autoplay blocked or playback failed outright — fall back to
        // capturing whatever frame is already available rather than failing
        // immediately; drawImage above still throws/produces a blank result
        // if nothing was ever decoded, caught the same as any other failure.
        .catch(() => captureFrame());
    };
    video.onerror = () => {
      cleanup();
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
    body: JSON.stringify({ mediaKind, contentType: file.type, sizeBytes: file.size, ...(videoDurations.has(file) ? { durationSeconds: videoDurations.get(file) } : {}) }),
  });
  if (!initRes.ok) {
    if (initRes.status === 429) throw new Error(ERROR_QUOTA);
    if (initRes.status === 404) throw new Error(ERROR_WINDOW_CLOSED);
    // The server names the specific rejection reason (too_large/unsupported_type)
    // in the response body — surface that instead of a generic failure so the
    // guest knows why (e.g. their video's too big) rather than just "try again"
    // forever on a file that will never succeed.
    const errorBody: { code?: string } | null = await initRes.json().catch(() => null);
    if (errorBody?.code === "too_large") throw new Error(ERROR_TOO_LARGE);
    if (errorBody?.code === "unsupported_type") throw new Error(ERROR_UNSUPPORTED_TYPE);
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

function failureMessageKey(
  error: string | undefined,
): "quotaError" | "windowClosedError" | "fileTooLargeError" | "unsupportedTypeError" | "genericError" | "failed" {
  if (error === ERROR_QUOTA) return "quotaError";
  if (error === ERROR_WINDOW_CLOSED) return "windowClosedError";
  if (error === ERROR_TOO_LARGE) return "fileTooLargeError";
  if (error === ERROR_UNSUPPORTED_TYPE) return "unsupportedTypeError";
  if (error === ERROR_GENERIC) return "genericError";
  return "failed";
}

type UploadStep = "closed" | "name" | "source" | "review" | "uploading" | "browsing" | "success";
type StagedUpload = { key: string; file: File; poster?: File; previewUrl: string; durationSeconds?: number };

export function GuestUploadView({
  eventId,
  accent,
  onItemsChange,
  eventTitle = "",
  guestName = "",
  onGuestName,
  moments = [],
  branding = false,
  slug = "",
  onSeeGallery,
  onBind,
  demo = null,
}: {
  eventId: string;
  accent: string;
  onItemsChange: (items: GuestUploadPreview[]) => void;
  eventTitle?: string;
  guestName?: string;
  onGuestName?: (name: string) => void;
  moments?: MemoryMoment[];
  branding?: boolean;
  slug?: string;
  onSeeGallery?: () => void;
  onBind?: (api: { open: (momentId?: string) => void }) => void;
  demo?: { step: UploadStep; name?: string; previews?: string[] } | null;
}) {
  const t = useTranslations("invitations.public.memories.upload");
  const tr = useTranslations("invitations.public.memories.redesign");
  const [items, setItems] = useState<GuestUploadPreview[]>([]);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [step, setStep] = useState<UploadStep>(demo?.step ?? "closed");
  const [staged, setStaged] = useState<StagedUpload[]>([]);
  const [nameDraft, setNameDraft] = useState(guestName);
  const [momentId, setMomentId] = useState<string | null>(null);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const queueRef = useRef<UploadQueue | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
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

  const demoApplied = useRef(false);
  useEffect(() => {
    if (!demo?.previews?.length || demoApplied.current) return;
    demoApplied.current = true;
    const file = new File([new Uint8Array([1])], "photo.jpg", { type: "image/jpeg" });
    setNameDraft(demo.name ?? "");
    setStaged(demo.previews.map((previewUrl, index) => ({ key: `demo-${index}`, file, previewUrl, durationSeconds: index === 2 ? 24 : undefined })));
    setBatchTotal(demo.previews.length);
    setBatchIds(demo.previews.map((_, index) => `demo-${index}`));
    if (demo.step === "uploading" || demo.step === "browsing" || demo.step === "success") {
      const statuses = ["done", "done", "uploading", "queued"] as const;
      setItems(demo.previews.map((previewUrl, index) => ({
        id: `demo-${index}`,
        fileName: index === 2 ? "Video · 0:24" : `Photo ${index + 1}`,
        contentType: "image/jpeg",
        sizeBytes: 1,
        status: demo.step === "success" ? "done" : statuses[index] ?? "queued",
        progress: demo.step === "success" ? 100 : index === 2 ? 62 : index < 2 ? 100 : 0,
        previewUrl,
      })));
    }
  }, [demo]);

  useEffect(() => {
    onBind?.({
      open: () => {
        let skipped = false;
        try { skipped = window.localStorage.getItem(guestNameSkippedKey(eventId)) === "1"; } catch { skipped = false; }
        setStep(!guestName.trim() && !skipped ? "name" : "source");
      },
    });
  }, [eventId, guestName, onBind]);

  useEffect(() => {
    if (batchIds.length === 0) return;
    const batch = items.filter((item) => batchIds.includes(item.id));
    if (batch.length < batchIds.length) return;
    const pending = batch.some((item) => item.status === "queued" || item.status === "uploading");
    if (!pending && (step === "uploading" || step === "browsing") && batch.some((item) => item.status === "done")) setStep("success");
  }, [items, batchIds, step]);

  async function stageFiles(fileList: FileList | null) {
    if (!fileList) return;
    setRejectionError(null);
    const next: StagedUpload[] = [];
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
          videoDurations.set(file, duration);
          next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${next.length}`, file, poster, previewUrl: URL.createObjectURL(file), durationSeconds: duration });
        } catch {
          setRejectionError(t("genericError"));
        }
        continue;
      }
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${next.length}`, file, previewUrl: URL.createObjectURL(file) });
    }
    if (next.length > 0) {
      setStaged((current) => [...current, ...next]);
      setMomentId(suggestMomentId(next.map((item) => item.file.lastModified), moments));
      setStep("review");
    }
    if (inputRef.current) inputRef.current.value = "";
    if (photoRef.current) photoRef.current.value = "";
    if (videoRef.current) videoRef.current.value = "";
  }

  async function confirmUpload() {
    if (!queueRef.current || staged.length === 0) return;
    const ids: string[] = [];
    for (const item of staged) {
      if (item.durationSeconds != null) videoDurations.set(item.file, item.durationSeconds);
      const id = await queueRef.current.enqueue(item.file, item.poster);
      previewsRef.current.set(id, item.previewUrl);
      ids.push(id);
    }
    setBatchIds(ids);
    setBatchTotal(ids.length);
    setStaged([]);
    setStep("uploading");
    if (nameDraft.trim()) onGuestName?.(nameDraft.trim());
    publishItems(queueRef.current.getItems());
  }

  const active = items.filter((item) => item.status === "queued" || item.status === "uploading");
  const failed = items.filter((item) => item.status === "failed");

  const batchItems = items.filter((item) => batchIds.includes(item.id));
  const doneCount = batchItems.filter((item) => item.status === "done").length;
  const momentName = moments.find((moment) => moment.id === momentId)?.name;
  const accept = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime";

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} multiple className="hidden" onChange={(event) => void stageFiles(event.target.files)} />
      <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="hidden" onChange={(event) => void stageFiles(event.target.files)} />
      <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" className="hidden" onChange={(event) => void stageFiles(event.target.files)} />

      {(rejectionError || failed[0]) && (
        <div className="fixed inset-x-4 bottom-28 z-50 mx-auto max-w-xl">
          {rejectionError && <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm text-red-700 shadow-lg"><span>{rejectionError}</span><button type="button" aria-label={t("dismiss")} onClick={() => setRejectionError(null)}><X className="size-4" /></button></div>}
          {failed.slice(0, 1).map((item) => <div key={item.id} role="alert" className="mt-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg">
            <p className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium">{item.fileName}</span><span className="text-red-700">{t(failureMessageKey(item.error))}</span></p>
            {!TERMINAL_UPLOAD_ERRORS.has(item.error ?? "") && <button type="button" onClick={() => queueRef.current?.retry(item.id)} className="text-sm font-semibold" style={{ color: accent }}>{t("retry")}</button>}
            <button type="button" aria-label={t("dismiss")} onClick={() => queueRef.current?.dismiss(item.id)}><X className="size-4" /></button>
          </div>)}
        </div>
      )}

      {step === "browsing" && active.length > 0 && (
        <button type="button" onClick={() => setStep("uploading")} className="fixed inset-x-4 bottom-24 z-40 mx-auto flex h-12 max-w-xl items-center gap-2 rounded-full bg-[#1c2a20] px-3 text-sm font-semibold text-white shadow-lg">
          <span className="grid size-7 place-items-center rounded-full border-2 border-[#9fd0ab] text-[10px]">{doneCount}</span>
          {tr("addingPill")} <small className="font-medium text-[#b9cdbf]">{tr("pillCount", { done: doneCount, total: batchTotal || active.length })}</small>
          <span className="ml-auto rounded-full bg-white/15 px-3 py-1 text-xs">{tr("viewProgress")}</span>
        </button>
      )}

      {step !== "closed" && step !== "browsing" && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/55" role="presentation" onClick={() => step !== "uploading" && setStep("closed")}>
          <div role="dialog" aria-modal="true" className="mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#fbfaf6] px-5 pb-8 pt-3 text-[#1c2a20]" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/10" />
            {step === "name" && (
              <div className="text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-full" style={{ backgroundColor: `${accent}14`, color: accent }}><User className="size-7" /></div>
                <h2 className="mt-3 font-serif text-2xl font-semibold" style={{ color: accent }}>{tr("nameTitle")}</h2>
                <p className="mt-1 text-sm opacity-70">{tr("nameBody", { event: eventTitle })}</p>
                <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder={tr("namePlaceholder")} className="mt-4 h-12 w-full rounded-2xl border px-4" style={{ borderColor: accent }} />
                <button type="button" className="mt-4 h-14 w-full rounded-full text-base font-semibold text-white" style={{ backgroundColor: accent }} onClick={() => { if (nameDraft.trim()) onGuestName?.(nameDraft.trim()); setStep("source"); }}>{tr("continue")}</button>
                <button type="button" className="mt-3 text-sm font-semibold opacity-60" onClick={() => { try { window.localStorage.setItem(guestNameSkippedKey(eventId), "1"); } catch { /* private mode */ } setStep("source"); }}>{tr("skip")}</button>
              </div>
            )}
            {step === "source" && (
              <div>
                <div className="flex items-start justify-between"><div><h2 className="font-serif text-2xl font-semibold" style={{ color: accent }}>{tr("sourceTitle")}</h2><p className="text-xs opacity-60">{tr("sourceMeta", { event: eventTitle })}</p></div><button type="button" aria-label={tr("cancel")} onClick={() => setStep("closed")} className="grid size-9 place-items-center rounded-full bg-black/5"><X className="size-4" /></button></div>
                <div className="mt-4 grid gap-2.5">
                  <button type="button" onClick={() => photoRef.current?.click()} className="flex items-center gap-3 rounded-2xl border bg-white p-3 text-left"><span className="grid size-11 place-items-center rounded-xl" style={{ backgroundColor: `${accent}14`, color: accent }}><Camera className="size-5" /></span><span><b className="block">{tr("takePhoto")}</b><small className="opacity-60">{tr("takePhotoHint")}</small></span><ChevronRight className="ml-auto size-4 opacity-40" /></button>
                  <button type="button" onClick={() => videoRef.current?.click()} className="flex items-center gap-3 rounded-2xl border bg-white p-3 text-left"><span className="grid size-11 place-items-center rounded-xl" style={{ backgroundColor: `${accent}14`, color: accent }}><Video className="size-5" /></span><span><b className="block">{tr("recordVideo")}</b><small className="opacity-60">{tr("recordVideoHint")}</small></span><ChevronRight className="ml-auto size-4 opacity-40" /></button>
                  <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-3 rounded-2xl border bg-white p-3 text-left"><span className="grid size-11 place-items-center rounded-xl" style={{ backgroundColor: `${accent}14`, color: accent }}><Images className="size-5" /></span><span><b className="block">{tr("library")}</b><small className="opacity-60">{tr("libraryHint")}</small></span><ChevronRight className="ml-auto size-4 opacity-40" /></button>
                </div>
                <button type="button" onClick={() => setStep("closed")} className="mt-3 h-12 w-full rounded-2xl bg-[#f1ede3] font-semibold">{tr("cancel")}</button>
              </div>
            )}
            {step === "review" && (
              <div>
                <h2 className="font-serif text-2xl font-semibold" style={{ color: accent }}>{tr("reviewTitle", { count: staged.length })}</h2>
                <p className="text-sm opacity-60">{tr("reviewMeta", { event: eventTitle })}</p>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {staged.map((item) => (
                    <div key={item.key} className="relative aspect-square overflow-hidden rounded-xl">
                      <img src={item.previewUrl} alt="" className="size-full object-cover" />
                      <button type="button" aria-label={t("dismiss")} className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-[#1c2a20] text-white" onClick={() => setStaged((current) => current.filter((entry) => entry.key !== item.key))}><X className="size-3" /></button>
                      {item.durationSeconds != null && <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[10px] text-white">{Math.floor(item.durationSeconds / 60)}:{String(Math.round(item.durationSeconds % 60)).padStart(2, "0")}</span>}
                    </div>
                  ))}
                </div>
                <button type="button" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: accent }} onClick={() => inputRef.current?.click()}><Plus className="size-4" />{tr("addMore")}</button>
                {moments.length > 0 && (
                  <>
                    <p className="mt-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide opacity-60">{tr("momentLabel")}<span className="inline-flex items-center gap-1 normal-case tracking-normal text-[#b8955a]"><Sparkles className="size-3" />{tr("suggested")}</span></p>
                    <div className="mt-2 flex flex-wrap gap-2">{moments.map((moment) => <button key={moment.id} type="button" onClick={() => setMomentId(moment.id)} className="h-8 rounded-full px-3 text-xs font-semibold" style={{ backgroundColor: momentId === moment.id ? "#1c2a20" : "#fff", color: momentId === moment.id ? "#fff" : "#1c2a20" }}>{moment.name}</button>)}</div>
                  </>
                )}
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide opacity-60">{tr("yourName")} <span className="normal-case tracking-normal">{tr("optional")}</span>
                  <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border bg-white px-3 text-base font-medium normal-case" style={{ borderColor: accent }} />
                </label>
                <p className="mt-1 text-xs opacity-60">{tr("nameHint")}</p>
                <p className="mt-3 rounded-2xl px-3 py-2 text-xs leading-5" style={{ backgroundColor: `${accent}12` }}><b>{tr("whoSees")}</b> {tr("whoSeesBody", { event: eventTitle })}</p>
                <button type="button" onClick={() => void confirmUpload()} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-semibold text-white" style={{ backgroundColor: accent }}><Upload className="size-4" />{tr("addCount", { count: staged.length })}</button>
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] opacity-60"><Shield className="size-3.5" />{tr("finePrint")}</p>
              </div>
            )}
            {step === "uploading" && (
              <div>
                <h2 className="font-serif text-2xl font-semibold" style={{ color: accent }}>{tr("uploadingTitle", { count: batchTotal })}</h2>
                <p className="text-xs opacity-60">{momentName ? tr("uploadingMeta", { done: doneCount, total: batchTotal, moment: momentName }) : tr("uploadingMetaPlain", { done: doneCount, total: batchTotal })}</p>
                <ul className="mt-4 grid gap-2.5">
                  {batchItems.map((item, index) => (
                    <li key={item.id} className="flex items-center gap-3">
                      <span className="size-11 overflow-hidden rounded-xl bg-black/5">{item.previewUrl && <img src={item.previewUrl} alt="" className="size-full object-cover" />}</span>
                      <span className="min-w-0 flex-1 text-sm font-semibold">{item.fileName}<small className="block font-medium opacity-60">{item.status === "done" ? tr("addedStatus") : item.status === "uploading" ? tr("uploadingStatus", { percent: item.progress }) : tr("waiting")}</small>
                        {item.status === "uploading" && <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/10"><i className="block h-full rounded-full" style={{ width: `${item.progress}%`, backgroundColor: accent }} /></span>}
                      </span>
                      {item.status === "done" && <span className="grid size-6 place-items-center rounded-full text-white" style={{ backgroundColor: accent }}><Check className="size-3.5" /></span>}
                      {item.status !== "done" && <span className="text-xs opacity-50">{index + 1}</span>}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setStep("browsing")} className="mt-4 h-14 w-full rounded-full border text-base font-semibold" style={{ color: accent, borderColor: `${accent}33` }}>{tr("keepBrowsing")}</button>
                <p className="mt-2 text-center text-[11px] opacity-60">{tr("keepBrowsingNote")}</p>
              </div>
            )}
            {step === "success" && (
              <div className="text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-full text-white" style={{ backgroundColor: accent }}><Check className="size-8" /></div>
                <h2 className="mt-4 font-serif text-3xl font-semibold" style={{ color: accent }}>{nameDraft.trim() ? tr("thanks", { name: nameDraft.trim() }) : tr("thanksAnon")}</h2>
                <p className="text-sm opacity-70">{tr("thanksMeta", { count: successCount || doneCount || batchTotal, event: eventTitle })}</p>
                <p className="mt-4 flex gap-2 rounded-2xl px-3 py-3 text-left text-xs leading-5" style={{ backgroundColor: `${accent}12` }}><Shield className="size-4 shrink-0" style={{ color: accent }} />{tr("moderationNote")}</p>
                <button type="button" onClick={() => { setStep("closed"); onSeeGallery?.(); }} className="mt-4 h-14 w-full rounded-full text-base font-semibold text-white" style={{ backgroundColor: accent }}>{tr("seeGallery")}</button>
                <button type="button" onClick={() => setStep("source")} className="mt-2 h-12 w-full rounded-full border text-sm font-semibold" style={{ color: accent, borderColor: `${accent}33` }}><Plus className="mr-1 inline size-4" />{tr("addMore")}</button>
                {branding && <PlanningSoftLink slug={slug} accent={accent} surface="#fff" text="#1c2a20" content="success" />}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
