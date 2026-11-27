"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, Play, Share2, X } from "lucide-react";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { Download, ScanFace } from "lucide-react";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { formatApproxFileSize, formatCapturedAt, formatVideoDuration, knownContributorName, resolveTimeZone } from "@/lib/invitations/memories/guest-presentation";
import { momentForMedia } from "@/lib/invitations/memories/gallery-view";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import type { HonorIcon } from "@/lib/invitations/memories/guests-of-honor";
import { HonorCreamLabel } from "./HonorMark";
import { defaultMediaSrc, type MediaImageSrc } from "./media-src";
import { VideoPlaybackFallback } from "./VideoPlaybackFallback";
import { downloadMemoryFile, nextVideoSourceAttempt, prefersReducedMotion, shareMemoryItem, videoSourceUrl } from "./video-playback";

export { formatCapturedAt };

export interface MediaLightboxProps {
  media: PublicMemoryMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  moments?: MemoryMoment[];
  imageSrc?: MediaImageSrc;
  onFindMe?: () => void;
  honorLabels?: Record<string, string>;
  honorIcon?: HonorIcon;
  timeZone?: string | null;
  locale?: string;
}

const SWIPE_THRESHOLD_PX = 50;
// SSR-safe fallback only — real usage always measures the stage (see
// navigateWithSlide), since this component never renders during SSR (it's
// only ever mounted in response to a real click/tap).
const FALLBACK_EXIT_DISTANCE_PX = 600;
// Shared duration/easing for every post-release motion: the confirmed-swipe
// exit-then-reenter, and the cancelled-swipe bounce-back. 200ms with a flat
// ease-out read as an abrupt snap; this is closer to what photo-viewer apps
// use for a settle that still feels immediate rather than sluggish.
const SETTLE_DURATION_MS = 260;
const SETTLE_TRANSITION = `transform ${SETTLE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;

// Pure swipe-gesture decision: given how far a horizontal drag traveled and
// where we are in the list, decide whether it clears the threshold to
// navigate, and which way. Exported and unit-tested directly rather than via
// simulated touch/pointer events — jsdom has no Touch or PointerEvent
// constructors, so a DOM-level test would only prove jsdom's own event
// plumbing, not this decision. Scoped automatically to whatever `media` list
// the caller passes in: a lightbox opened from inside an AI Highlight
// category only ever slides within that category's photos, never into a
// different category or the whole gallery.
export function resolveSwipeNavigation(deltaX: number, index: number, total: number): number | null {
  if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return null;
  if (deltaX < 0) return index < total - 1 ? index + 1 : null; // swiped left -> next
  return index > 0 ? index - 1 : null; // swiped right -> previous
}

// Pure decision for tapping a thumbnail in the "Every Perspective" nearby
// strip: is the tapped item already part of the list the lightbox is
// currently paging through (the common case — Gallery and AI Highlights
// almost always already loaded the tapped item's own list), or does it live
// outside that list (only possible from inside an AI Highlights category,
// whose list is scoped to that category's members)? In the second case the
// caller starts a "detour" — nearbyCluster must already include the anchor
// item the guest detoured from, so the detour is browsable back to where it
// started; assembling that cluster is the caller's job, not this function's.
export function resolveNearbyTap(
  currentMedia: PublicMemoryMedia[],
  tappedId: string,
  nearbyCluster: PublicMemoryMedia[],
): { mode: "list"; index: number } | { mode: "detour"; media: PublicMemoryMedia[]; index: number } | null {
  const listIndex = currentMedia.findIndex((item) => item.id === tappedId);
  if (listIndex !== -1) return { mode: "list", index: listIndex };

  const detourIndex = nearbyCluster.findIndex((item) => item.id === tappedId);
  if (detourIndex !== -1) return { mode: "detour", media: nearbyCluster, index: detourIndex };

  return null;
}

// The neighbouring photo (or a video's poster), parked just above or below
// the current one so it follows the finger in, the way a vertical feed does.
function NeighborSlide({ src, className }: { src: string; className: string }) {
  return (
    <div aria-hidden="true" className={`absolute inset-x-0 h-full overflow-hidden ${className}`}>
      <div className="absolute inset-0 scale-110 bg-cover opacity-80 blur-md" style={{ backgroundImage: `url(${src})` }} />
      <div className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${src})` }} />
    </div>
  );
}

// Where navigateWithSlide is headed: either the next index within whatever
// list currently governs the lightbox (the original `media` prop, or an
// active detour's own cluster), or a brand-new detour cluster to switch into.
type NavigationTarget = { kind: "list"; index: number } | { kind: "detour"; media: PublicMemoryMedia[]; index: number };

// Shared full-screen photo/video viewer for every guest-facing photo grid (Gallery,
// AI Highlights, and any future one) — a photo is represented by a cropped
// thumbnail in its grid, but tapping it always shows the full, uncropped
// image (object-contain) here, with keyboard, on-screen prev/next, and
// touch/pointer swipe support. Also shows "Every Perspective": other
// gallery-visible media captured around the same instant as the item being
// viewed.
export function MediaLightbox({ media, index, onClose, onNavigate, moments = [], imageSrc = defaultMediaSrc, onFindMe, honorLabels, honorIcon = "rings", timeZone, locale }: MediaLightboxProps) {
  const t = useTranslations("invitations.public.memories.lightbox");
  const tr = useTranslations("invitations.public.memories.redesign");
  const intlLocale = useLocale();
  const intlTimeZone = useTimeZone();
  const zone = resolveTimeZone(timeZone ?? intlTimeZone);
  const activeLocale = locale || intlLocale || "en";
  // Reuses the gallery namespace's existing "Photo shared by {name}" copy —
  // today only rendered as alt text on gallery thumbnails — rather than
  // duplicating an equivalent string under the lightbox namespace.
  const tGallery = useTranslations("invitations.public.memories.gallery");
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // True only for the single instant "jump to the opposite edge" reposition
  // between a photo exiting one side and the next one sliding in from the
  // other — never a real drag, but it needs the same "no transition" style.
  const [suppressTransition, setSuppressTransition] = useState(false);
  // Non-null while the guest has tapped a nearby-strip thumbnail that lives
  // outside the original `media` prop (only possible from inside an AI
  // Highlights category). While set, this — not the media/index props —
  // governs what's displayed and how prev/next/swipe behave. There is no
  // "return to the original list" interaction; closing the lightbox always
  // exits entirely, from either mode, matching how far a guest can already
  // wander via ordinary swipe/prev-next.
  const [detour, setDetour] = useState<{ media: PublicMemoryMedia[]; index: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // number, not NodeJS.Timeout — this is always window.setTimeout (browser),
  // but bare ReturnType<typeof window.setTimeout> resolves ambiguously in a
  // mixed Node+DOM tsconfig, so the type is spelled out explicitly.
  const pendingTimeouts = useRef<number[]>([]);
  const pendingFrames = useRef<number[]>([]);
  // "Every Perspective": the other gallery-visible media captured within
  // NEARBY_WINDOW_MS of the currently-displayed item, keyed by that item's
  // id so navigating back and forth doesn't refetch what's already known.
  const nearbyCache = useRef<Map<string, PublicMemoryMedia[]>>(new Map());
  const [nearby, setNearby] = useState<PublicMemoryMedia[]>([]);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoNonce, setVideoNonce] = useState(0);
  const videoRetried = useRef(false);
  const handlingVideoError = useRef(false);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
      pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    };
  }, []);

  // Locks background scroll while the lightbox is open — this component is
  // only ever mounted while it's showing (the caller conditionally renders
  // it), so lock on mount and restore on unmount, unconditionally. Matches
  // InvitationRsvpDialog's own scroll-lock: overflow:hidden alone doesn't
  // reliably stop background scroll on iOS Safari, which still lets a touch
  // gesture on this fixed overlay scroll the page underneath — pinning the
  // body itself via position:fixed (with top offset by scrollY, corrected
  // for on restore) is what actually prevents that everywhere.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const activeMedia = detour ? detour.media : media;
  const activeIndex = detour ? detour.index : index;
  const item = activeMedia[activeIndex];

  useEffect(() => {
    videoRetried.current = false;
    handlingVideoError.current = false;
    setVideoNonce(0);
    setVideoFailed(false);
  }, [item?.id]);

  useEffect(() => {
    const video = videoElRef.current;
    if (!video || videoFailed || item?.mediaKind !== "video") return;
    if (video.error) onVideoError();
    // onVideoError closes over the latest retry flag; item id / nonce are the
    // only reasons to look again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.mediaKind, videoNonce, videoFailed]);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const cached = nearbyCache.current.get(item.id);
    if (cached) {
      setNearby(cached);
      return;
    }
    setNearby([]);
    void fetch(`/api/memories/media/${item.id}/nearby`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`nearby ${response.status}`);
        return response.json() as Promise<{ media: PublicMemoryMedia[] }>;
      })
      .then((payload) => {
        // The route (Task 2) always resolves this shape, but a resolved
        // response isn't proof of it at runtime — nothing upstream validates
        // the parsed JSON against the type assertion above. Guard rather than
        // trust it, so a malformed/unexpected body degrades to "no nearby
        // matches" instead of leaving `nearby` non-array and crashing the
        // `nearby.length` read below.
        const nearbyMedia = Array.isArray(payload?.media) ? payload.media : [];
        nearbyCache.current.set(item.id, nearbyMedia);
        if (!cancelled) setNearby(nearbyMedia);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // item.id is the only input that should trigger a refetch — item itself
    // is a fresh object identity every render even when unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  function stepTarget(nextIndex: number): NavigationTarget {
    return detour ? { kind: "detour", media: detour.media, index: nextIndex } : { kind: "list", index: nextIndex };
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if ((event.key === "ArrowLeft" || event.key === "ArrowUp") && activeIndex > 0) navigateWithSlide(stepTarget(activeIndex - 1), 1);
      else if ((event.key === "ArrowRight" || event.key === "ArrowDown") && activeIndex < activeMedia.length - 1) navigateWithSlide(stepTarget(activeIndex + 1), -1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // navigateWithSlide/stepTarget are intentionally omitted — they close
    // over state that changes every render, and re-subscribing this listener
    // each render is cheap and already how this effect behaved before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeMedia.length, onClose, detour]);

  if (!item) return null;
  const fullLoaded = loadedId === item.id;
  const prevItem = activeIndex > 0 ? activeMedia[activeIndex - 1] : undefined;
  const nextItem = activeMedia[activeIndex + 1];
  const neighborSrc = (neighbor: PublicMemoryMedia) => imageSrc(neighbor.id, neighbor.mediaKind === "video" ? "thumbnail" : "display");

  const capturedLabel = item.capturedAt ? formatCapturedAt(item.capturedAt, zone, activeLocale) : null;
  const contributor = knownContributorName(item.uploaderDisplayName);
  const momentName = momentForMedia(item, moments)?.name ?? null;
  async function downloadCurrent() {
    try {
      await downloadMemoryFile(imageSrc(item.id, "display"), `memory-${item.id}`);
    } catch {
      // A fresh tap asks the media route for a new signed URL.
    }
  }
  const itemMetaLabel = capturedLabel
    ? item.uploaderDisplayName
      ? `${tGallery("photoBy", { name: item.uploaderDisplayName })} · ${capturedLabel}`
      : capturedLabel
    : null;

  // Drives every non-drag transition, vertically like the video feed: the
  // current photo slides up (next) or down (previous) by a full screen. For a
  // step to the photo right before or after, its neighbour is already parked
  // there and slides in with it, so the swap lands with no jump. Anything
  // further away (a nearby-strip tap) slides out, jumps to the opposite edge,
  // then slides in. `target` decides what the swap actually does: advance
  // within the current list (calling the parent's onNavigate), advance within
  // an already-active detour (local state only), or start a brand-new detour.
  function navigateWithSlide(target: NavigationTarget, exitSign: -1 | 1) {
    if (prefersReducedMotion()) {
      if (target.kind === "detour") setDetour({ media: target.media, index: target.index });
      else if (detour) setDetour({ media: detour.media, index: target.index });
      else onNavigate(target.index);
      setIsDragging(false);
      setDragY(0);
      return;
    }
    pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
    pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    pendingTimeouts.current = [];
    pendingFrames.current = [];

    const distance = stageRef.current?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : FALLBACK_EXIT_DISTANCE_PX);
    const neighbourStep = (target.kind === "list" || target.media === activeMedia) && Math.abs(target.index - activeIndex) === 1;
    setIsDragging(false);
    setSuppressTransition(false);
    setDragY(exitSign * distance);

    const swapTimeout = window.setTimeout(() => {
      if (target.kind === "detour") {
        setDetour({ media: target.media, index: target.index });
      } else if (detour) {
        setDetour({ media: detour.media, index: target.index });
      } else {
        onNavigate(target.index);
      }
      setSuppressTransition(true);
      // The neighbour is already on screen: snap the track home under it.
      // Otherwise start the new photo from the opposite edge.
      setDragY(neighbourStep ? 0 : -exitSign * distance);

      // Two nested frames: the first can still land in the same paint as the
      // style change above, so a single one isn't reliably enough to force
      // the browser to commit "no transition, at the opposite edge" before
      // re-enabling the transition and animating back to center.
      const frame1 = window.requestAnimationFrame(() => {
        const frame2 = window.requestAnimationFrame(() => {
          setSuppressTransition(false);
          setDragY(0);
        });
        pendingFrames.current.push(frame2);
      });
      pendingFrames.current.push(frame1);
    }, SETTLE_DURATION_MS);
    pendingTimeouts.current.push(swapTimeout);
  }

  // Deep-links to this exact item on the page the guest is already viewing —
  // built from the live location rather than a prop, so this component never
  // needs to know the invitation's slug or base URL. Query param, not a hash
  // fragment: unlike a hash, a query param survives the server-side passcode
  // redirect a protected event's memories page issues (see
  // src/app/invite/[slug]/memories/page.tsx and PasscodeGate.tsx), so a
  // shared link still lands on this photo after the guest enters the code.
  async function handleShare() {
    const result = await shareMemoryItem(item.id);
    if (result === "copied") {
      setShowCopiedToast(true);
      window.setTimeout(() => setShowCopiedToast(false), 2000);
    }
  }

  function onVideoError() {
    if (handlingVideoError.current) return;
    handlingVideoError.current = true;
    if (nextVideoSourceAttempt(videoRetried.current) === "refresh") {
      videoRetried.current = true;
      setVideoNonce(Date.now());
    } else {
      setVideoFailed(true);
    }
    queueMicrotask(() => {
      handlingVideoError.current = false;
    });
  }

  function handleNearbyTap(tappedId: string) {
    const cluster = [item, ...nearby];
    const result = resolveNearbyTap(activeMedia, tappedId, cluster);
    if (!result) return;
    if (result.mode === "list") navigateWithSlide({ kind: "list", index: result.index }, result.index > activeIndex ? -1 : 1);
    else navigateWithSlide({ kind: "detour", media: result.media, index: result.index }, -1);
  }

  // The handlers sit on the stage, so a drag anywhere on it (photo, video or
  // the blurred margins) moves the feed. Up/down follows the finger; a
  // sideways swipe still pages too, for guests used to the old viewer.
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // A new gesture starting mid-settle (fast repeated swipes) must not let
    // the previous swipe's deferred steps land in the middle of this one.
    pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
    pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    pendingTimeouts.current = [];
    pendingFrames.current = [];
    setSuppressTransition(false);

    dragStart.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
    // No pointer capture: it would retarget the tap that follows onto the
    // stage, so a video's own play and scrub controls would stop working.
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const offsetY = (event.clientY ?? 0) - (dragStart.current.y ?? 0);
    const offsetX = (event.clientX ?? 0) - (dragStart.current.x ?? 0);
    if (Math.abs(offsetY) < Math.abs(offsetX)) {
      setDragY(0);
      return;
    }
    // Resist past the first and last photo so the edge feels like an edge.
    const atEdge = (offsetY < 0 && !nextItem) || (offsetY > 0 && !prevItem);
    setDragY(atEdge ? offsetY / 3 : offsetY);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const deltaY = (event.clientY ?? 0) - (dragStart.current.y ?? 0);
    const deltaX = (event.clientX ?? 0) - (dragStart.current.x ?? 0);
    dragStart.current = null;
    const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
    // Sideways on a video is the guest scrubbing its timeline, not paging.
    const nextIndex = vertical || item.mediaKind !== "video" ? resolveSwipeNavigation(vertical ? deltaY : deltaX, activeIndex, activeMedia.length) : null;

    if (nextIndex === null) {
      // Below the threshold, or already at the end being swiped past — ease
      // back to center instead of snapping the drag away instantly.
      setIsDragging(false);
      setDragY(0);
      return;
    }

    navigateWithSlide(stepTarget(nextIndex), nextIndex > activeIndex ? -1 : 1);
  }

  function handlePointerCancel() {
    // The browser took the gesture over; settle back without navigating.
    dragStart.current = null;
    setIsDragging(false);
    setDragY(0);
  }

  const stopDrag = (event: ReactPointerEvent) => event.stopPropagation();
  const trackStyle = { transform: `translateY(${dragY}px)`, transition: isDragging || suppressTransition ? "none" : SETTLE_TRANSITION };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex flex-col bg-[#0b0d0c] text-white" onClick={onClose}>
      <div data-lightbox-header className="relative z-30 flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-10 place-items-center rounded-full bg-white/15"><X className="size-5" /></button>
        <p className="text-sm font-semibold">
          {detour
            ? t("nearbyDetourLabel", { current: activeIndex + 1, total: activeMedia.length })
            : t("viewerLabel", { current: activeIndex + 1, total: activeMedia.length })}
        </p>
        <span className="size-10" />
      </div>
      {showCopiedToast && (
        <p role="status" className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black shadow-lg">
          {t("linkCopied")}
        </p>
      )}

      <div
        ref={stageRef}
        data-lightbox-stage
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[#151917]"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {activeIndex > 0 && (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={(event) => {
              event.stopPropagation();
              navigateWithSlide(stepTarget(activeIndex - 1), 1);
            }}
            aria-label={t("previous")}
            className="absolute left-3 top-[42%] z-10 hidden size-11 -translate-y-8 place-items-center rounded-full bg-white text-[#1c2a20] shadow md:grid"
          >
            <ChevronUp className="size-6" />
          </button>
        )}
        {activeIndex < activeMedia.length - 1 && (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={(event) => {
              event.stopPropagation();
              navigateWithSlide(stepTarget(activeIndex + 1), -1);
            }}
            aria-label={t("next")}
            className="absolute right-3 top-[58%] z-10 hidden size-11 -translate-y-8 place-items-center rounded-full bg-white text-[#1c2a20] shadow md:grid"
          >
            <ChevronDown className="size-6" />
          </button>
        )}
        <div data-lightbox-track className="absolute inset-0" style={trackStyle}>
        {prevItem && <NeighborSlide src={neighborSrc(prevItem)} className="bottom-full" />}
        {nextItem && <NeighborSlide src={neighborSrc(nextItem)} className="top-full" />}
        <div aria-hidden="true" className="absolute inset-0 scale-110 bg-cover opacity-80 blur-md" style={{ backgroundImage: `url(${imageSrc(item.id, "thumbnail")})` }} />
        {!fullLoaded && !videoFailed && (
          <div className="absolute left-1/2 top-1/2 z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-2xl bg-black/40 px-4 py-3 text-xs font-medium">
            <span className="size-7 animate-spin rounded-full border-[3px] border-white/30 border-t-white motion-reduce:animate-none" />
            {tr("loadingFull")}
          </div>
        )}
        {item.mediaKind === "video" && videoFailed ? (
          <div className="relative z-10 flex h-full items-center justify-center overflow-y-auto p-3" onPointerDown={stopDrag}>
            <VideoPlaybackFallback
              durationLabel={formatVideoDuration(item.durationSeconds)}
              sizeLabel={formatApproxFileSize(item.byteSize)}
              onDownload={() => void downloadCurrent()}
              onNext={activeIndex < activeMedia.length - 1 ? () => navigateWithSlide(stepTarget(activeIndex + 1), -1) : undefined}
            />
          </div>
        ) : item.mediaKind === "video" ? (
          <video
            ref={videoElRef}
            src={videoSourceUrl(imageSrc(item.id, "display"), videoNonce)}
            poster={imageSrc(item.id, "thumbnail")}
            controls
            playsInline
            preload="metadata"
            onLoadedData={() => setLoadedId(item.id)}
            onError={onVideoError}
            onClick={(event) => event.stopPropagation()}
            className="relative z-[1] size-full object-contain"
          />
        ) : (
          <img
            src={imageSrc(item.id, "display")}
            alt=""
            draggable={false}
            ref={(node) => { if (node?.complete) setLoadedId(item.id); }}
            onLoad={() => setLoadedId(item.id)}
            onClick={(event) => event.stopPropagation()}
            className="relative z-[1] size-full select-none object-contain"
          />
        )}
        {honorLabels?.[item.id] && <HonorCreamLabel label={honorLabels[item.id] ?? ""} icon={honorIcon} className="absolute bottom-16 left-3.5 z-[6] h-7 px-2.5 text-[12.5px]" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-8">
          {!isDragging && !suppressTransition && item.mediaKind !== "video" && nearby.length > 0 && (
            <div className="pointer-events-auto mb-2.5" onClick={(event) => event.stopPropagation()} onPointerDown={stopDrag}>
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/90">{t("nearbyCount", { count: nearby.length })}</p>
              <div className="flex gap-2 overflow-x-auto">
                {nearby.map((match) => (
                  <button key={match.id} type="button" onClick={() => handleNearbyTap(match.id)} aria-label={match.uploaderDisplayName ?? t("nearbyThumbnailLabel")} className="flex-none text-center">
                    <span className="relative block">
                      <img src={imageSrc(match.id, "thumbnail")} alt="" className="size-[52px] rounded-xl border border-white/40 object-cover" loading="lazy" />
                      {match.mediaKind === "video" && (
                        <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                          <span className="grid size-[22px] place-items-center rounded-full bg-black/55 text-white"><Play className="size-2.5 fill-current" /></span>
                        </span>
                      )}
                    </span>
                    {match.uploaderDisplayName && <span className="mt-0.5 block max-w-[52px] truncate text-[9px] text-white/75">{match.uploaderDisplayName}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {itemMetaLabel && <p className="mb-1 text-center text-xs text-white/70">{itemMetaLabel}</p>}
          <p className="text-center text-xs font-medium text-white/80">
            {detour
              ? t("nearbyDetourLabel", { current: activeIndex + 1, total: activeMedia.length })
              : t("viewerLabel", { current: activeIndex + 1, total: activeMedia.length })}
          </p>
        </div>
        </div>
      </div>
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" onClick={(event) => event.stopPropagation()}>
        {contributor && (
          <div className="flex items-center gap-2.5 text-sm">
            <span className="grid size-8 place-items-center rounded-full bg-[#e9d6af] text-sm font-bold text-[#1c2a20]">{Array.from(contributor)[0]?.toUpperCase()}</span>
            <span>
              <span className="block font-semibold">{tr("sharedThis", { name: contributor })}</span>
              <span className="block text-xs text-white/65">{[capturedLabel, momentName].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
        )}
        <div className={`mt-3 grid text-center text-[11px] ${onFindMe ? "grid-cols-3" : "grid-cols-2"}`}>
          <button type="button" className="flex flex-col items-center gap-1 text-[#9fd0ab]" onClick={() => void downloadCurrent()}><Download className="size-5" />{tr("download")}</button>
          <button type="button" aria-label={t("share")} className="flex flex-col items-center gap-1" onClick={() => void handleShare()}><Share2 className="size-5" />{t("share")}</button>
          {onFindMe && <button type="button" className="flex flex-col items-center gap-1" onClick={onFindMe}><ScanFace className="size-5" />{tr("findMeAction")}</button>}
        </div>
      </div>
    </div>
  );
}
