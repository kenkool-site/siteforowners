"use client";

import { useEffect, useState } from "react";
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

export function GuestAiHighlightView({ eventId, accent, surface }: GuestAiHighlightViewProps) {
  const t = useTranslations("invitations.public.memories.aiHighlight");
  const [groups, setGroups] = useState<GuestHighlightGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  if (!loaded) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;

  const selectedGroup = selected ? groups.find((group) => group.id === selected) : undefined;

  if (selectedGroup) {
    return (
      <div className="space-y-4 p-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="min-h-11 text-sm font-semibold underline underline-offset-4"
          style={{ color: accent }}
        >
          {t("back")}
        </button>
        <h2 className="text-2xl font-semibold">{selectedGroup.name}</h2>
        {selectedGroup.description && (
          <p className="text-sm" style={{ color: accent }}>
            {selectedGroup.description}
          </p>
        )}
        <div className="columns-2 gap-2 sm:columns-3">
          {selectedGroup.media.map((item) => (
            <img
              key={item.id}
              src={`/api/memories/media/${item.id}/display`}
              alt=""
              className="mb-2 h-auto w-full break-inside-avoid rounded-xl"
              loading="lazy"
            />
          ))}
        </div>
      </div>
    );
  }

  if (groups.length === 0) return <p className="p-8 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;

  return (
    <div className="p-4">
      <p className="mb-5 text-sm" style={{ color: accent }}>
        {t("description")}
      </p>
      <div className="columns-1 gap-4 sm:columns-2">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => setSelected(group.id)}
            className="mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl text-left shadow-md ring-1 ring-black/5 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: surface }}
          >
            {group.media[0] && (
              // h-auto (no forced height/object-cover) so the full photo shows,
              // matching this module's own uncropped masonry convention
              // (GuestGalleryView.tsx's "earlier" section) rather than the
              // fixed-height crop this replaced.
              <img
                src={`/api/memories/media/${group.media[0].id}/thumbnail`}
                alt=""
                className="h-auto w-full"
                loading="lazy"
              />
            )}
            <div className="p-4">
              <p className="text-lg font-semibold leading-snug">{group.name}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide opacity-70" style={{ color: accent }}>
                {t("photoCount", { count: group.media.length })}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
