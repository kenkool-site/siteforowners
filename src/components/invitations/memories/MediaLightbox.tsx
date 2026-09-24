"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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

function exitDistance(): number {
  return (typeof window !== "undefined" ? window.innerWidth : FALLBACK_EXIT_DISTANCE_PX) + 100;
}

// Shared full-screen photo viewer for every guest-facing photo grid (Gallery,
// AI Highlights, and any future one) — a photo is represented by a cropped
// thumbnail in its grid, but tapping it always shows the full, uncropped
// image (object-contain) here, with keyboard, on-screen prev/next, and
// touch/pointer swipe support.
export function MediaLightbox({ media, index, onClose, onNavigate }: MediaLightboxProps) {
  const t = useTranslations("invitations.public.memories.lightbox");
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // True only for the single instant "jump to the opposite edge" reposition
  // between a photo exiting one side and the next one sliding in from the
  // other — never a real drag, but it needs the same "no transition" style.
  const [suppressTransition, setSuppressTransition] = useState(false);
  const dragStartX = useRef<number | null>(null);
  // number, not NodeJS.Timeout — this is always window.setTimeout (browser),
  // but bare ReturnType<typeof window.setTimeout> resolves ambiguously in a
  // mixed Node+DOM tsconfig, so the type is spelled out explicitly.
  const pendingTimeouts = useRef<number[]>([]);
  const pendingFrames = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
      pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && index > 0) navigateWithSlide(index - 1, 1);
      else if (event.key === "ArrowRight" && index < media.length - 1) navigateWithSlide(index + 1, -1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // navigateWithSlide is intentionally omitted — it closes over state that
    // changes every render, and re-subscribing this listener each render is
    // cheap and already how this effect behaved before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, media.length, onClose]);

  const item = media[index];
  if (!item) return null;

  // Drives every non-drag transition: the current photo exits fully
  // off-screen in `exitSign`'s direction (continuing whatever motion — a
  // swipe's own direction, or a button/keyboard tap's implied direction),
  // then swaps content and jumps instantly to the opposite edge, then slides
  // that in to center. One <img> element, three chained visual states,
  // rather than a two-panel carousel.
  function navigateWithSlide(nextIndex: number, exitSign: -1 | 1) {
    pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
    pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    pendingTimeouts.current = [];
    pendingFrames.current = [];

    const distance = exitDistance();
    setIsDragging(false);
    setSuppressTransition(false);
    setDragX(exitSign * distance);

    const swapTimeout = window.setTimeout(() => {
      onNavigate(nextIndex);
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

  function handlePointerDown(event: ReactPointerEvent<HTMLImageElement>) {
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

  function handlePointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragStartX.current === null) return;
    setDragX(event.clientX - dragStartX.current);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragStartX.current === null) return;
    const releasedAt = dragX;
    const nextIndex = resolveSwipeNavigation(releasedAt, index, media.length);
    dragStartX.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (nextIndex === null) {
      // Below the threshold, or already at the end being swiped past — ease
      // back to center instead of snapping the drag away instantly.
      setIsDragging(false);
      setDragX(0);
      return;
    }

    navigateWithSlide(nextIndex, releasedAt < 0 ? -1 : 1);
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

      {index > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigateWithSlide(index - 1, 1);
          }}
          aria-label={t("previous")}
          className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {index < media.length - 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigateWithSlide(index + 1, -1);
          }}
          aria-label={t("next")}
          className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

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

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-medium text-white/80">
        {t("viewerLabel", { current: index + 1, total: media.length })}
      </p>
    </div>
  );
}
