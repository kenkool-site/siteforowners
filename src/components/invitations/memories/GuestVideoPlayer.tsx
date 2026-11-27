"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, Download, Play, ScanFace, Share2, Volume2, VolumeX, X } from "lucide-react";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { formatApproxFileSize, formatCapturedAtDetail, formatVideoDuration, initialOf, knownContributorName, resolveTimeZone } from "@/lib/invitations/memories/guest-presentation";
import { momentForMedia } from "@/lib/invitations/memories/gallery-view";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import { defaultMediaSrc, type MediaImageSrc } from "./media-src";
import { VideoPlaybackFallback } from "./VideoPlaybackFallback";
import { downloadMemoryFile, nextVideoSourceAttempt, playWithSoundFallback, prefersReducedMotion, resolveVerticalSwipe, shareMemoryItem, videoSourceUrl } from "./video-playback";

const SLIDE_MS = 260;

// The neighbouring clip's poster, parked just above or below the current one
// so it follows the finger in and fills the screen when the slide lands.
function SlidePoster({ src, className }: { src: string; className: string }) {
  return (
    <div aria-hidden="true" className={`absolute inset-x-0 h-full overflow-hidden ${className}`}>
      <div className="absolute inset-0 scale-110 bg-cover opacity-70 blur-2xl" style={{ backgroundImage: `url(${src})` }} />
      <div className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${src})` }} />
    </div>
  );
}

export function GuestVideoPlayer({
  videos,
  index,
  onClose,
  onNavigate,
  moments = [],
  imageSrc = defaultMediaSrc,
  onFindMe,
  timeZone,
  locale,
  accent = "#1f4a2c",
}: {
  videos: PublicMemoryMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  moments?: MemoryMoment[];
  imageSrc?: MediaImageSrc;
  onFindMe?: () => void;
  timeZone?: string | null;
  locale?: string;
  accent?: string;
}) {
  const t = useTranslations("invitations.public.memories.player");
  const tLightbox = useTranslations("invitations.public.memories.lightbox");
  const tr = useTranslations("invitations.public.memories.redesign");
  const intlLocale = useLocale();
  const intlTimeZone = useTimeZone();
  const zone = resolveTimeZone(timeZone ?? intlTimeZone);
  const activeLocale = locale || intlLocale || "en";
  const item = videos[index];
  const next = videos[index + 1];
  const prev = index > 0 ? videos[index - 1] : undefined;
  const videoRef = useRef<HTMLVideoElement>(null);
  const retried = useRef(false);
  const handlingError = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const slideTimer = useRef<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(item?.durationSeconds ?? 0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const reduceMotion = prefersReducedMotion();

  useEffect(() => {
    const timer = slideTimer;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    retried.current = false;
    handlingError.current = false;
    setNonce(0);
    setFailed(false);
    setNeedsTap(false);
    setUserPaused(false);
    setCurrent(0);
    setDuration(item?.durationSeconds ?? 0);
    setDragY(0);
  }, [item?.id, item?.durationSeconds]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if ((event.key === "ArrowDown" || event.key === "ArrowRight") && index < videos.length - 1) onNavigate(index + 1);
      else if ((event.key === "ArrowUp" || event.key === "ArrowLeft") && index > 0) onNavigate(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, videos.length, onClose, onNavigate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed || !item) return;
    let cancelled = false;
    // Some browsers set video.error while parsing the src and never emit
    // another error event, so a handler attached only via onError misses it.
    function fail() {
      if (cancelled || handlingError.current) return;
      handlingError.current = true;
      if (nextVideoSourceAttempt(retried.current) === "refresh") {
        retried.current = true;
        setNonce(Date.now());
      } else {
        setFailed(true);
      }
      queueMicrotask(() => {
        handlingError.current = false;
      });
    }
    video.addEventListener("error", fail);
    if (video.error) fail();
    else {
      void playWithSoundFallback(video).then((result) => {
        if (cancelled || video.error) return;
        setMuted(result !== "sound");
        setNeedsTap(result === "blocked");
      });
    }
    return () => {
      cancelled = true;
      video.removeEventListener("error", fail);
    };
  }, [item, nonce, failed]);

  if (!item) return null;

  const contributor = knownContributorName(item.uploaderDisplayName);
  const captured = item.capturedAt ? formatCapturedAtDetail(item.capturedAt, zone, activeLocale) : null;
  const momentName = momentForMedia(item, moments)?.name ?? null;
  const storedDuration = formatVideoDuration(item.durationSeconds);
  const elapsedLabel = formatVideoDuration(current) ?? "0:00";
  const totalLabel = formatVideoDuration(Number.isFinite(duration) && duration > 0 ? duration : item.durationSeconds) ?? storedDuration ?? "0:00";
  const sizeLabel = formatApproxFileSize(item.byteSize);
  const displaySrc = videoSourceUrl(imageSrc(item.id, "display"), nonce);
  const poster = imageSrc(item.id, "thumbnail");
  const nextPoster = next ? imageSrc(next.id, "thumbnail") : null;
  const prevPoster = prev ? imageSrc(prev.id, "thumbnail") : null;
  const progressMax = Number.isFinite(duration) && duration > 0 ? duration : item.durationSeconds ?? 0;

  function go(nextIndex: number) {
    dragStart.current = null;
    const stageHeight = stageRef.current?.clientHeight ?? 0;
    if (reduceMotion || !stageHeight || Math.abs(nextIndex - index) !== 1) {
      setDragY(0);
      setDragging(false);
      onNavigate(nextIndex);
      return;
    }
    if (slideTimer.current !== null) return;
    // Slide the current clip off screen so the neighbour's poster slides in,
    // then swap clips with the transition off so the swap isn't visible.
    setDragging(false);
    setDragY(nextIndex > index ? -stageHeight : stageHeight);
    slideTimer.current = window.setTimeout(() => {
      slideTimer.current = null;
      setDragging(true);
      setDragY(0);
      onNavigate(nextIndex);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!dragStart.current) setDragging(false);
      }));
    }, SLIDE_MS);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (failed || slideTimer.current !== null) return;
    dragStart.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current || reduceMotion) return;
    const offset = event.clientY - dragStart.current.y;
    // Resist past the first and last clip so the edge feels like an edge.
    const atEdge = (offset < 0 && !next) || (offset > 0 && !prev);
    setDragY(atEdge ? offset / 3 : offset);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const deltaY = event.clientY - dragStart.current.y;
    const deltaX = event.clientX - dragStart.current.x;
    dragStart.current = null;
    const nextIndex = resolveVerticalSwipe(deltaY, index, videos.length);
    if (nextIndex !== null && Math.abs(deltaY) >= Math.abs(deltaX)) {
      go(nextIndex);
      return;
    }
    setDragging(false);
    setDragY(0);
    if (Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10) togglePlay();
  }

  function handlePointerCancel() {
    // The browser took the gesture over; reset without treating it as a tap or a swipe.
    dragStart.current = null;
    setDragging(false);
    setDragY(0);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) {
      setNeedsTap(false);
      return;
    }
    if (video.paused) {
      setUserPaused(false);
      setNeedsTap(false);
      void playWithSoundFallback(video).then((result) => setMuted(result !== "sound"));
    } else {
      video.pause();
      setUserPaused(true);
    }
  }

  async function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) {
      try {
        await video.play();
        setNeedsTap(false);
        setUserPaused(false);
      } catch {
        video.muted = true;
        setMuted(true);
      }
    }
  }

  async function downloadCurrent() {
    try {
      await downloadMemoryFile(imageSrc(item.id, "display"), `memory-${item.id}`);
    } catch {
      // The signed URL can expire or the network can drop. The guest can tap again.
    }
  }

  async function handleShare() {
    const result = await shareMemoryItem(item.id);
    if (result === "copied") {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t("label", { current: index + 1, total: videos.length })} className="fixed inset-0 z-[60] flex flex-col bg-[#0b0d0c] text-white">
      <div data-video-header className="relative z-30 flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label={tLightbox("close")} className="grid size-10 place-items-center rounded-full bg-white/15">
          <X className="size-5" />
        </button>
        <p className="text-sm font-semibold">{t("label", { current: index + 1, total: videos.length })}</p>
        <button type="button" onClick={() => void toggleSound()} aria-label={muted ? t("soundOn") : t("soundOff")} className="grid size-10 place-items-center rounded-full bg-white/15">
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </div>
      {copied && (
        <p role="status" className="absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black shadow-lg">
          {tLightbox("linkCopied")}
        </p>
      )}

      <div
        ref={stageRef}
        data-video-stage
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          data-video-track
          className="absolute inset-0"
          style={reduceMotion ? undefined : { transform: `translateY(${dragY}px)`, transition: dragging ? "none" : `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
        >
        {prevPoster && <SlidePoster src={prevPoster} className="bottom-full" />}
        {nextPoster && <SlidePoster src={nextPoster} className="top-full" />}
        <div aria-hidden="true" className="absolute inset-0 scale-110 bg-cover opacity-70 blur-2xl" style={{ backgroundImage: `url(${poster})` }} />
        {index > 0 && (
          <button type="button" aria-label={t("previous")} onPointerDown={(event) => event.stopPropagation()} onClick={() => go(index - 1)} className="absolute left-3 top-[42%] z-10 hidden size-11 -translate-y-8 place-items-center rounded-full bg-white text-[#1c2a20] shadow md:grid">
            <ChevronUp className="size-6" />
          </button>
        )}
        {next && (
          <button type="button" aria-label={t("next")} onPointerDown={(event) => event.stopPropagation()} onClick={() => go(index + 1)} className="absolute right-3 top-[58%] z-10 hidden size-11 -translate-y-8 place-items-center rounded-full bg-white text-[#1c2a20] shadow md:grid">
            <ChevronDown className="size-6" />
          </button>
        )}
        {failed ? (
          <div className="relative z-10 flex h-full items-center justify-center p-4">
            <VideoPlaybackFallback
              accent={accent}
              durationLabel={storedDuration}
              sizeLabel={sizeLabel}
              onDownload={() => void downloadCurrent()}
              onNext={next ? () => go(index + 1) : undefined}
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            key={`${item.id}-${nonce}`}
            src={displaySrc}
            poster={poster}
            playsInline
            preload="metadata"
            muted={muted}
            onLoadedMetadata={(event) => {
              const nextDuration = event.currentTarget.duration;
              if (Number.isFinite(nextDuration)) setDuration(nextDuration);
            }}
            onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
            onPlay={() => setUserPaused(false)}
            className="relative z-[1] size-full object-contain"
          />
        )}
        {!failed && (needsTap || userPaused) && (
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={togglePlay} aria-label={t("play")} className="absolute left-1/2 top-1/2 z-10 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#1c2a20] shadow-lg">
            <Play className="ml-1 size-7 fill-current" />
          </button>
        )}
        </div>
      </div>

      <div className="relative z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" onPointerDown={(event) => event.stopPropagation()}>
        {(contributor || captured || momentName) && (
          <div className="flex items-center gap-2.5 text-sm">
            <span className="grid size-9 place-items-center rounded-full bg-[#e9d6af] text-sm font-bold text-[#1c2a20]">{initialOf(contributor ?? "?")}</span>
            <span className="min-w-0">
              {contributor && <span className="block truncate font-semibold">{contributor}</span>}
              <span className="block truncate text-xs text-white/70">{[captured, momentName].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
        )}
        {!failed && (
          <label className="mt-3 block">
            <span className="sr-only">{t("progress")}</span>
            <span className="flex items-center gap-2 text-[11px] tabular-nums text-white/80">
              <span>{elapsedLabel}</span>
              <span className="relative h-1 flex-1 rounded-full bg-white/25">
                <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: progressMax > 0 ? `${Math.min(100, (current / progressMax) * 100)}%` : "0%" }} />
                <input
                  type="range"
                  min={0}
                  max={progressMax || 0}
                  step={0.1}
                  value={Math.min(current, progressMax || 0)}
                  aria-label={t("progress")}
                  onChange={(event) => {
                    const nextTime = Number(event.target.value);
                    if (videoRef.current) videoRef.current.currentTime = nextTime;
                    setCurrent(nextTime);
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </span>
              <span>{totalLabel}</span>
            </span>
          </label>
        )}
        <div className={`mt-3 grid text-center text-[11px] ${onFindMe ? "grid-cols-3" : "grid-cols-2"}`}>
          <button type="button" className="flex flex-col items-center gap-1 text-[#9fd0ab]" onClick={() => void downloadCurrent()}>
            <Download className="size-5" />
            {tr("download")}
          </button>
          <button type="button" aria-label={tLightbox("share")} className="flex flex-col items-center gap-1" onClick={() => void handleShare()}>
            <Share2 className="size-5" />
            {tLightbox("share")}
          </button>
          {onFindMe && (
            <button type="button" className="flex flex-col items-center gap-1" onClick={onFindMe}>
              <ScanFace className="size-5" />
              {tr("findMeAction")}
            </button>
          )}
        </div>
        {!failed && next && (
          <>
            <p className="mt-3 flex items-center justify-center gap-1 text-xs text-white/70">
              <ChevronUp className="size-4" />
              {t("swipeNext")}
            </p>
            <button type="button" onClick={() => go(index + 1)} className="mt-2 w-full overflow-hidden rounded-t-2xl bg-white/10 text-left">
              <span className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e9d6af] text-xs font-bold text-[#1c2a20]">
                  {initialOf(knownContributorName(next.uploaderDisplayName) ?? "?")}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {knownContributorName(next.uploaderDisplayName) ? t("upNext", { name: knownContributorName(next.uploaderDisplayName) ?? "" }) : t("upNextAnon")}
                </span>
                {formatVideoDuration(next.durationSeconds) && (
                  <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold">{formatVideoDuration(next.durationSeconds)}</span>
                )}
              </span>
              {nextPoster && <img src={nextPoster} alt="" className="h-16 w-full object-cover" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
