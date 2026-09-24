"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";

export interface MediaLightboxProps {
  media: PublicMemoryMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

// Shared full-screen photo viewer for every guest-facing photo grid (Gallery,
// AI Highlights, and any future one) — a photo is represented by a cropped
// thumbnail in its grid, but tapping it always shows the full, uncropped
// image (object-contain) here, with keyboard and on-screen prev/next.
export function MediaLightbox({ media, index, onClose, onNavigate }: MediaLightboxProps) {
  const t = useTranslations("invitations.public.memories.lightbox");

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
        className="max-h-full max-w-full object-contain"
      />

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-medium text-white/80">
        {t("viewerLabel", { current: index + 1, total: media.length })}
      </p>
    </div>
  );
}
