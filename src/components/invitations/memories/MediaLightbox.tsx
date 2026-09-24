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

// Shared full-screen photo viewer for every guest-facing photo grid (Gallery,
// AI Highlights, and any future one) — a photo is represented by a cropped
// thumbnail in its grid, but tapping it always shows the full, uncropped
// image (object-contain) here, with keyboard, on-screen prev/next, and
// touch/pointer swipe support.
export function MediaLightbox({ media, index, onClose, onNavigate }: MediaLightboxProps) {
  const t = useTranslations("invitations.public.memories.lightbox");
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (event.key === "ArrowRight" && index < media.length - 1) onNavigate(index + 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, media.length, onClose, onNavigate]);

  const item = media[index];
  if (!item) return null;

  function handlePointerDown(event: ReactPointerEvent<HTMLImageElement>) {
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
    const nextIndex = resolveSwipeNavigation(dragX, index, media.length);
    if (nextIndex !== null) onNavigate(nextIndex);
    dragStartX.current = null;
    setIsDragging(false);
    setDragX(0);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
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
            onNavigate(index - 1);
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
            onNavigate(index + 1);
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
        style={{ transform: `translateX(${dragX}px)`, transition: isDragging ? "none" : "transform 200ms ease-out" }}
        className="max-h-full max-w-full touch-pan-y select-none object-contain"
      />

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-medium text-white/80">
        {t("viewerLabel", { current: index + 1, total: media.length })}
      </p>
    </div>
  );
}
