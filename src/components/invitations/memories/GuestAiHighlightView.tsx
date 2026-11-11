"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { MemoryHighlightGroup } from "@/lib/invitations/memories/highlight-types";
import type { PublicHonorView } from "@/lib/invitations/memories/guests-of-honor";
import { HonorCreamLabel, HonorGlyph } from "./HonorMark";
import { MediaLightbox } from "./MediaLightbox";
import { defaultMediaSrc, gridVariant, type MediaImageSrc } from "./media-src";

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
  previewGroups?: GuestHighlightGroup[];
  forceLoading?: boolean;
  imageSrc?: MediaImageSrc;
  honor?: PublicHonorView | null;
}

export function GuestAiHighlightView({ eventId, accent, surface, previewGroups, forceLoading = false, imageSrc = defaultMediaSrc, honor = null }: GuestAiHighlightViewProps) {
  const t = useTranslations("invitations.public.memories.aiHighlight");
  const [groups, setGroups] = useState<GuestHighlightGroup[]>(previewGroups ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(Boolean(previewGroups) && !forceLoading);
  // Where the grid was scrolled to before entering a category — a plain
  // state swap loses this (the browser clamps scroll to whatever the new,
  // usually shorter, content allows), so it's restored explicitly on Back
  // instead of guests always landing back at the top of the page.
  const gridScrollY = useRef(0);

  useEffect(() => {
    if (previewGroups || forceLoading) return;
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
  }, [eventId, previewGroups, forceLoading]);

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

  const tr = useTranslations("invitations.public.memories.redesign");
  const th = useTranslations("invitations.public.memories.honorees");
  const [chip, setChip] = useState<string>("all");
  const honorTitle = honor ? (honor.fixedKey ? th(honor.fixedKey) : honor.name ?? th("guestsOfHonor")) : "";
  const honorSubtitle = !honor ? "" : honor.subtitleKind === "birthdayStar"
    ? th("photosOfBirthdayStar", { count: honor.count })
    : honor.subtitleKind === "graduate"
      ? th("photosOfGraduate", { count: honor.count })
      : honor.subtitleKind === "honorees"
        ? th("photosOfHonorees", { count: honor.count })
        : th("photosOfNames", { count: honor.count, subject: honor.subtitleSubject ?? honorTitle });
  const badge = honor?.badgeKey === "birthdayStar" ? th("birthdayStar") : honor?.badgeKey === "graduate" ? th("graduateBadge") : honor?.badgeKey === "honorees" ? th("honoreesBadge") : th("autoGrouped");

  if (!loaded) return (
    <div className="px-4 pb-36">
      <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((slot) => <div key={slot} className="overflow-hidden rounded-2xl" style={{ backgroundColor: surface }}><div className="h-32 animate-pulse bg-black/5" /><div className="h-4 w-2/3 m-3 animate-pulse rounded bg-black/5" /></div>)}
      </div>
    </div>
  );

  const selectedGroup = selected ? groups.find((group) => group.id === selected) : undefined;

  if (selectedGroup) {
    return (
      <div className="space-y-4 p-4">
        <button
          type="button"
          onClick={closeGroup}
          className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full py-1 pl-1 pr-3 text-sm font-semibold"
          style={{ color: accent }}
        >
          <ChevronLeft className="size-5" />
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
              className="relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl"
            >
              <img src={imageSrc(item.id, gridVariant(item.mediaKind))} alt="" className="h-auto w-full" loading="lazy" />
              {item.mediaKind === "video" && (
                <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="grid size-9 place-items-center rounded-full bg-black/45 text-white">
                    <Play className="size-4 fill-current" />
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
        {lightboxIndex !== null && (
          <MediaLightbox media={selectedGroup.media} index={lightboxIndex} imageSrc={imageSrc} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
        )}
      </div>
    );
  }

  if (selected === "guests-of-honor" && honor) {
    return (
      <div className="space-y-4 p-4">
        <button type="button" onClick={closeGroup} className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full py-1 pl-1 pr-3 text-sm font-semibold" style={{ color: accent }}>
          <ChevronLeft className="size-5" />
          {t("back")}
        </button>
        <h2 className="text-2xl font-semibold">{honorTitle}</h2>
        <div className="columns-2 gap-2 sm:columns-3">
          {honor.media.map((item, index) => (
            <button key={item.id} type="button" onClick={() => setLightboxIndex(index)} className="relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl">
              <img src={imageSrc(item.id, gridVariant(item.mediaKind))} alt="" className="h-auto w-full" loading="lazy" />
              {honor.labels[item.id] && <HonorCreamLabel label={honor.labels[item.id] ?? ""} icon={honor.icon} className="absolute left-2 top-2" />}
            </button>
          ))}
        </div>
        {lightboxIndex !== null && (
          <MediaLightbox media={honor.media} index={lightboxIndex} imageSrc={imageSrc} honorLabels={honor.labels} honorIcon={honor.icon} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
        )}
      </div>
    );
  }

  if (groups.length === 0 && !(honor && honor.count > 0)) return (
    <div className="px-4 pb-36">
      <h2 className="font-serif text-3xl font-semibold" style={{ color: accent }}>{tr("navHighlights")}</h2>
      <p className="mt-4 text-sm" style={{ color: accent }}>{t("empty")}</p>
      <p className="mt-2 text-sm opacity-70">{tr("highlightsEmpty")}</p>
    </div>
  );

  const visible = chip === "all" ? groups : groups.filter((group) => group.id === chip);
  const featured = visible[0] ?? groups[0];
  const totalPhotos = groups.reduce((sum, group) => sum + group.media.length, 0);

  return (
    <div className="px-4 pb-36">
      <h2 className="font-serif text-3xl font-semibold" style={{ color: accent }}>{tr("navHighlights")}</h2>
      <p className="mt-1 flex items-center gap-2 text-sm opacity-70">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${accent}18`, color: accent }}>{tr("aiCurated")}</span>
        {tr("highlightsFrom", { count: totalPhotos })}
      </p>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        <button type="button" onClick={() => setChip("all")} className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold" style={{ backgroundColor: chip === "all" ? "#1c2a20" : surface, color: chip === "all" ? "#fff" : accent }}>{tr("filterAll")}</button>
        {honor && honor.count > 0 && (
          <button type="button" onClick={() => setChip("honor")} className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold" style={{ backgroundColor: chip === "honor" ? "#1c2a20" : surface, color: chip === "honor" ? "#fff" : accent }}>
            {honorTitle} <small className="opacity-70">{honor.count}</small>
          </button>
        )}
        {groups.map((group) => (
          <button key={group.id} type="button" onClick={() => setChip(group.id)} className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold" style={{ backgroundColor: chip === group.id ? "#1c2a20" : surface, color: chip === group.id ? "#fff" : accent }}>
            {group.name} <small className="opacity-70">{group.media.length}</small>
          </button>
        ))}
      </div>
      {honor && honor.count > 0 && (chip === "all" || chip === "honor") && (
        <button type="button" onClick={() => openGroup("guests-of-honor")} className="relative mt-4 block h-56 w-full overflow-hidden rounded-3xl text-left text-white shadow-lg">
          {honor.media[0] && <span aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${imageSrc(honor.media[0].id, "thumbnail")})` }} />}
          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold" style={{ color: accent }}><HonorGlyph icon={honor.icon} className="size-3" />{badge}</span>
          <span className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
            <span>
              <span className="block font-serif text-2xl">{honorTitle}</span>
              <span className="text-xs text-white/85">{honorSubtitle}</span>
            </span>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/95 text-[#1c2a20]">›</span>
          </span>
        </button>
      )}
      {featured && chip !== "honor" && !(honor && honor.count > 0 && chip === "all") && (
        <button type="button" onClick={() => openGroup(featured.id)} className="relative mt-4 block h-56 w-full overflow-hidden rounded-3xl text-left text-white shadow-lg">
          {featured.media[0] && <span aria-hidden="true" className="absolute inset-0 bg-cover" style={{ backgroundImage: `url(${imageSrc(featured.media[0].id, "thumbnail")})` }} />}
          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold" style={{ color: accent }}>{tr("aiCurated")}</span>
          <span className="absolute bottom-4 left-4 right-4">
            <span className="block font-serif text-2xl">{tr("photoCount", { count: featured.media.length })}</span>
            <span className="text-xs text-white/80">{featured.name}</span>
          </span>
        </button>
      )}
      <p className="mb-5 mt-4 text-sm" style={{ color: accent }}>
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
              <div className="relative">
                <img src={imageSrc(group.media[0].id, "thumbnail")} alt="" className="aspect-[4/5] w-full object-cover" loading="lazy" />
                {group.media[0].mediaKind === "video" && (
                  <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                    <span className="grid size-9 place-items-center rounded-full bg-black/45 text-white">
                      <Play className="size-4 fill-current" />
                    </span>
                  </span>
                )}
              </div>
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
