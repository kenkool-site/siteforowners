"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";

export interface MediaLightboxProps {
  media: PublicMemoryMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const SWIPE_THRESHOLD_PX = 50;
// SSR-safe fallback only — real usage always computes this from the live
// viewport (see exitDistance below), since this component never renders
// during SSR (it's only ever mounted in response to a real click/tap).
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

function exitDistance(): number {
  return (typeof window !== "undefined" ? window.innerWidth : FALLBACK_EXIT_DISTANCE_PX) + 100;
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
export function MediaLightbox({ media, index, onClose, onNavigate }: MediaLightboxProps) {
  const t = useTranslations("invitations.public.memories.lightbox");
  const [dragX, setDragX] = useState(0);
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
  const dragStartX = useRef<number | null>(null);
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

  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
      pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    };
  }, []);

  const activeMedia = detour ? detour.media : media;
  const activeIndex = detour ? detour.index : index;
  const item = activeMedia[activeIndex];

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
      else if (event.key === "ArrowLeft" && activeIndex > 0) navigateWithSlide(stepTarget(activeIndex - 1), 1);
      else if (event.key === "ArrowRight" && activeIndex < activeMedia.length - 1) navigateWithSlide(stepTarget(activeIndex + 1), -1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // navigateWithSlide/stepTarget are intentionally omitted — they close
    // over state that changes every render, and re-subscribing this listener
    // each render is cheap and already how this effect behaved before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeMedia.length, onClose, detour]);

  if (!item) return null;

  // Drives every non-drag transition: the current photo exits fully
  // off-screen in `exitSign`'s direction (continuing whatever motion — a
  // swipe's own direction, or a button/keyboard tap's implied direction),
  // then swaps content and jumps instantly to the opposite edge, then slides
  // that in to center. One <img>/<video> element, three chained visual
  // states, rather than a two-panel carousel. `target` decides what the swap
  // actually does: advance within the current list (calling the parent's
  // onNavigate), advance within an already-active detour (local state only),
  // or start a brand-new detour.
  function navigateWithSlide(target: NavigationTarget, exitSign: -1 | 1) {
    pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
    pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    pendingTimeouts.current = [];
    pendingFrames.current = [];

    const distance = exitDistance();
    setIsDragging(false);
    setSuppressTransition(false);
    setDragX(exitSign * distance);

    const swapTimeout = window.setTimeout(() => {
      if (target.kind === "detour") {
        setDetour({ media: target.media, index: target.index });
      } else if (detour) {
        setDetour({ media: detour.media, index: target.index });
      } else {
        onNavigate(target.index);
      }
      setSuppressTransition(true);
      setDragX(-exitSign * distance);

      // Two nested frames: the first can still land in the same paint as the
      // style change above, so a single one isn't reliably enough to force
      // the browser to commit "no transition, at the opposite edge" before
      // re-enabling the transition and animating back to center.
      const frame1 = window.requestAnimationFrame(() => {
        const frame2 = window.requestAnimationFrame(() => {
          setSuppressTransition(false);
          setDragX(0);
        });
        pendingFrames.current.push(frame2);
      });
      pendingFrames.current.push(frame1);
    }, SETTLE_DURATION_MS);
    pendingTimeouts.current.push(swapTimeout);
  }

  function handleNearbyTap(tappedId: string) {
    const cluster = [item, ...nearby];
    const result = resolveNearbyTap(activeMedia, tappedId, cluster);
    if (!result) return;
    if (result.mode === "list") navigateWithSlide({ kind: "list", index: result.index }, result.index > activeIndex ? -1 : 1);
    else navigateWithSlide({ kind: "detour", media: result.media, index: result.index }, -1);
  }

  // HTMLImageElement | HTMLVideoElement, not just HTMLImageElement — these
  // three handlers are now shared verbatim between the <img> and <video>
  // branches below, and TS's PointerEvent<T> is invariant enough in T that a
  // handler typed for one element only isn't assignable to the other's prop.
  function handlePointerDown(event: ReactPointerEvent<HTMLImageElement | HTMLVideoElement>) {
    // A new gesture starting mid-settle (fast repeated swipes) must not let
    // the previous swipe's deferred steps land in the middle of this one.
    pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
    pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    pendingTimeouts.current = [];
    pendingFrames.current = [];
    setSuppressTransition(false);

    dragStartX.current = event.clientX;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLImageElement | HTMLVideoElement>) {
    if (dragStartX.current === null) return;
    setDragX(event.clientX - dragStartX.current);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLImageElement | HTMLVideoElement>) {
    if (dragStartX.current === null) return;
    const releasedAt = dragX;
    const nextIndex = resolveSwipeNavigation(releasedAt, activeIndex, activeMedia.length);
    dragStartX.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (nextIndex === null) {
      // Below the threshold, or already at the end being swiped past — ease
      // back to center instead of snapping the drag away instantly.
      setIsDragging(false);
      setDragX(0);
      return;
    }

    navigateWithSlide(stepTarget(nextIndex), releasedAt < 0 ? -1 : 1);
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-white"
      >
        <X className="size-6" />
      </button>

      {activeIndex > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigateWithSlide(stepTarget(activeIndex - 1), 1);
          }}
          aria-label={t("previous")}
          className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {activeIndex < activeMedia.length - 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigateWithSlide(stepTarget(activeIndex + 1), -1);
          }}
          aria-label={t("next")}
          className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      {item.mediaKind === "video" ? (
        <video
          src={`/api/memories/media/${item.id}/display`}
          poster={`/api/memories/media/${item.id}/thumbnail`}
          controls
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ transform: `translateX(${dragX}px)`, transition: isDragging || suppressTransition ? "none" : SETTLE_TRANSITION }}
          className="max-h-full max-w-full touch-pan-y object-contain"
        />
      ) : (
        <img
          src={`/api/memories/media/${item.id}/display`}
          alt=""
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ transform: `translateX(${dragX}px)`, transition: isDragging || suppressTransition ? "none" : SETTLE_TRANSITION }}
          className="max-h-full max-w-full touch-pan-y select-none object-contain"
        />
      )}

      <div className="absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-8">
        {!isDragging && !suppressTransition && nearby.length > 0 && (
          <div className="mb-2.5" onClick={(event) => event.stopPropagation()}>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/90">{t("nearbyCount", { count: nearby.length })}</p>
            <div className="flex gap-2 overflow-x-auto">
              {nearby.map((match) => (
                <button key={match.id} type="button" onClick={() => handleNearbyTap(match.id)} className="flex-none text-center">
                  <span className="relative block">
                    <img
                      src={`/api/memories/media/${match.id}/thumbnail`}
                      alt=""
                      className="size-[52px] rounded-xl border border-white/40 object-cover"
                      loading="lazy"
                    />
                    {match.mediaKind === "video" && (
                      <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                        <span className="grid size-[22px] place-items-center rounded-full bg-black/55 text-white">
                          <Play className="size-2.5 fill-current" />
                        </span>
                      </span>
                    )}
                  </span>
                  {match.uploaderDisplayName && (
                    <span className="mt-0.5 block max-w-[52px] truncate text-[9px] text-white/75">{match.uploaderDisplayName}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-center text-xs font-medium text-white/80">
          {detour
            ? t("nearbyDetourLabel", { current: activeIndex + 1, total: activeMedia.length })
            : t("viewerLabel", { current: activeIndex + 1, total: activeMedia.length })}
        </p>
      </div>
    </div>
  );
}
