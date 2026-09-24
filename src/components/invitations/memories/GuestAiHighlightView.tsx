"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { MemoryHighlightGroup } from "@/lib/invitations/memories/highlight-types";

// The guest-facing shape returned by GET /api/memories/events/[eventId]/highlights
// — Task 4's independent, multi-group AI Highlight system. A photo can appear
// in more than one group (unlike the old Moments-based single-group-per-photo
// system this replaces), so `media` is duplicated per group rather than
// referenced by a shared id.
export type GuestHighlightGroup = MemoryHighlightGroup & { media: PublicMemoryMedia[] };

export interface GuestAiHighlightViewProps {
  eventId: string;
  accent: string;
  surface: string;
}

type HighlightTranslate = ReturnType<typeof useTranslations>;

function HighlightLightbox({
  media,
  index,
  onClose,
  onNavigate,
  t,
}: {
  media: PublicMemoryMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  t: HighlightTranslate;
}) {
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

export function GuestAiHighlightView({ eventId, accent, surface }: GuestAiHighlightViewProps) {
  const t = useTranslations("invitations.public.memories.aiHighlight");
  const [groups, setGroups] = useState<GuestHighlightGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Where the grid was scrolled to before entering a category — a plain
  // state swap loses this (the browser clamps scroll to whatever the new,
  // usually shorter, content allows), so it's restored explicitly on Back
  // instead of guests always landing back at the top of the page.
  const gridScrollY = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/memories/events/${eventId}/highlights`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`ai-highlight ${response.status}`);
        return response.json() as Promise<{ groups: GuestHighlightGroup[] }>;
      })
      .then((payload) => {
        if (!cancelled) setGroups(payload.groups);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (selected === null) window.scrollTo(0, gridScrollY.current);
    else window.scrollTo(0, 0);
  }, [selected]);

  function openGroup(groupId: string) {
    gridScrollY.current = window.scrollY;
    setSelected(groupId);
  }

  function closeGroup() {
    setSelected(null);
    setLightboxIndex(null);
  }

  if (!loaded) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;

  const selectedGroup = selected ? groups.find((group) => group.id === selected) : undefined;

  if (selectedGroup) {
    return (
      <div className="space-y-4 p-4">
        <button type="button" onClick={closeGroup} className="min-h-11 text-sm font-semibold underline underline-offset-4" style={{ color: accent }}>
          {t("back")}
        </button>
        <h2 className="text-2xl font-semibold">{selectedGroup.name}</h2>
        {selectedGroup.description && (
          <p className="text-sm" style={{ color: accent }}>
            {selectedGroup.description}
          </p>
        )}
        <div className="columns-2 gap-2 sm:columns-3">
          {selectedGroup.media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl"
            >
              <img src={`/api/memories/media/${item.id}/display`} alt="" className="h-auto w-full" loading="lazy" />
            </button>
          ))}
        </div>
        {lightboxIndex !== null && (
          <HighlightLightbox media={selectedGroup.media} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} t={t} />
        )}
      </div>
    );
  }

  if (groups.length === 0) return <p className="p-8 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;

  return (
    <div className="p-4">
      <p className="mb-5 text-sm" style={{ color: accent }}>
        {t("description")}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => openGroup(group.id)}
            className="overflow-hidden rounded-2xl text-left shadow-md ring-1 ring-black/5 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: surface }}
          >
            {group.media[0] && (
              // A bounded aspect ratio (this module's own GuestGalleryView.tsx
              // story-strip convention) rather than the photo's natural height:
              // full-width uncropped tiles made a single category fill the
              // whole screen. The full, uncropped photo is always one tap away
              // inside the group's own detail view (and now the lightbox).
              <img src={`/api/memories/media/${group.media[0].id}/thumbnail`} alt="" className="aspect-[4/5] w-full object-cover" loading="lazy" />
            )}
            <div className="p-2.5">
              <p className="text-sm font-semibold leading-snug">{group.name}</p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide opacity-70" style={{ color: accent }}>
                {t("photoCount", { count: group.media.length })}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
