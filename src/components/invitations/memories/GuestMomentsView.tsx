"use client";

import { useEffect, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Clock3, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { formatInTimeZone, minutesUntil, momentPhase } from "@/lib/invitations/memories/guest-presentation";
import { momentForMedia } from "@/lib/invitations/memories/gallery-view";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import { defaultMediaSrc, gridVariant, type MediaImageSrc } from "./media-src";
import { MediaLightbox } from "./MediaLightbox";

export function GuestMomentsView({
  eventId,
  accent,
  surface,
  onAddPhotos,
  onShowGallery,
  timeZone = "UTC",
  locale = "en",
  preview,
  imageSrc = defaultMediaSrc,
}: {
  eventId: string;
  accent: string;
  surface: string;
  onAddPhotos?: (momentId: string) => void;
  onShowGallery?: () => void;
  timeZone?: string;
  locale?: string;
  preview?: { media: PublicMemoryMedia[]; moments: MemoryMoment[]; now?: number } | null;
  imageSrc?: MediaImageSrc;
}) {
  const t = useTranslations("invitations.public.memories.moments");
  const tr = useTranslations("invitations.public.memories.redesign");
  const [moments, setMoments] = useState<MemoryMoment[]>(preview?.moments ?? []);
  const [media, setMedia] = useState<PublicMemoryMedia[]>(preview?.media ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(Boolean(preview));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const now = preview?.now ?? Date.now();

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void fetch(`/api/memories/events/${eventId}/gallery`).then(async (response) => {
      if (!response.ok) throw new Error(`moments ${response.status}`);
      return response.json() as Promise<{ media: PublicMemoryMedia[]; moments: MemoryMoment[] }>;
    }).then((payload) => {
      if (!cancelled) { setMedia(payload.media); setMoments(payload.moments); }
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [eventId, preview]);

  if (!loaded) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;

  const selectedMoment = moments.find((moment) => moment.id === selected);
  if (selectedMoment) {
    const selectedMedia = media.filter((item) => momentForMedia(item, moments)?.id === selectedMoment.id);
    return <div className="space-y-4 p-4 pb-36">
      <button type="button" onClick={() => { setSelected(null); setLightboxIndex(null); }} className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full py-1 pl-1 pr-3 text-sm font-semibold" style={{ color: accent }}>
        <ChevronLeft className="size-5" />
        {t("back")}
      </button>
      <h2 className="font-serif text-2xl font-semibold">{selectedMoment.name}</h2>
      <div className="columns-2 gap-2 sm:columns-3">{selectedMedia.map((item, index) => <button key={item.id} type="button" onClick={() => setLightboxIndex(index)} className="relative mb-2 block w-full break-inside-avoid">
        <img src={imageSrc(item.id, gridVariant(item.mediaKind))} alt="" className="h-auto w-full rounded-xl" loading="lazy" />
        {item.mediaKind === "video" && <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-9 place-items-center rounded-full bg-black/45 text-white"><Play className="size-4 fill-current" /></span>
        </span>}
      </button>)}</div>
      {lightboxIndex !== null && (
        <MediaLightbox media={selectedMedia} index={lightboxIndex} moments={moments} imageSrc={imageSrc} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
    </div>;
  }

  if (moments.length === 0) return <p className="p-8 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;

  const day = formatInTimeZone(moments[0]?.startsAt, timeZone, locale, { weekday: "long", month: "short", day: "numeric" });

  return <div className="px-4 pb-36">
    <h2 className="font-serif text-3xl font-semibold" style={{ color: accent }}>{tr("navMoments")}</h2>
    {day && <p className="mt-1 text-sm opacity-70">{day} · {tr("momentsFollows")}</p>}
    <div className="mt-4 flex items-center gap-3 rounded-2xl px-3.5 py-3 text-white" style={{ backgroundColor: "#163824" }}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e9d6af]/20 text-[#e9d6af]"><Camera className="size-4" /></span>
      <span><b className="block text-sm">{tr("momentsLiveTitle")}</b><span className="text-xs text-[#c9d8ce]">{tr("momentsLiveBody")}</span></span>
    </div>
    <ol className="relative mt-4 grid gap-2">
      {moments.map((moment) => {
        const items = media.filter((item) => momentForMedia(item, moments)?.id === moment.id);
        const phase = momentPhase(moment, new Date(now));
        const soon = minutesUntil(moment.startsAt, new Date(now));
        const time = formatInTimeZone(moment.startsAt, timeZone, locale, { hour: "numeric", minute: "2-digit" });
        const thumbs = items.slice(0, 4);
        return (
          <li key={moment.id} className="flex gap-3">
            <span className="z-[1] mt-3 grid size-8 shrink-0 place-items-center rounded-full border text-white" style={{ backgroundColor: items.length ? accent : surface, borderColor: `${accent}55`, color: items.length ? "#fff" : accent }}><Clock3 className="size-4" /></span>
            <div className="min-w-0 flex-1 rounded-2xl border p-3" style={{ backgroundColor: surface, borderColor: `${accent}22` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#b8955a]">{time}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: items.length ? `${accent}18` : "#efe8da", color: items.length ? accent : "#7a6a4c" }}>
                  {items.length > 0 ? tr("photoCount", { count: items.length }) : phase === "upcoming" ? (soon !== null && soon <= 180 ? tr("startsIn", { count: soon }) : tr("startsAt", { time: time ?? "" })) : tr("noPhotosYet")}
                </span>
              </div>
              <h3 className="font-serif text-lg">{moment.name}</h3>
              {items.length > 0 ? (
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {thumbs.map((item) => (
                    <button key={item.id} type="button" onClick={() => setSelected(moment.id)} className="relative aspect-square overflow-hidden rounded-lg">
                      <img src={imageSrc(item.id, "thumbnail")} alt="" className="size-full object-cover" />
                      {item.mediaKind === "video" && <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center"><span className="grid size-6 place-items-center rounded-full bg-black/45 text-white"><Play className="size-3 fill-current" /></span></span>}
                    </button>
                  ))}
                  {items.length > thumbs.length && <button type="button" onClick={() => setSelected(moment.id)} className="grid aspect-square place-items-center rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: accent }}>{tr("morePhotos", { count: items.length - thumbs.length })}</button>}
                </div>
              ) : phase === "upcoming" ? (
                <p className="mt-2 flex items-center gap-2 rounded-xl bg-[#f3efe5] px-3 py-2 text-xs opacity-80"><Clock3 className="size-4 shrink-0" />{tr("upcomingBody", { name: moment.name })}</p>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2 text-xs opacity-80" style={{ borderColor: `${accent}44` }}>
                  <span>{tr("beFirst")}</span>
                  <button type="button" onClick={() => onAddPhotos?.(moment.id)} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-white" style={{ backgroundColor: accent }}><Camera className="size-3.5" />{tr("addYours")}</button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
    <button type="button" onClick={onShowGallery} className="mt-3 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "#e9e4d7", color: accent }}>
      {tr("seeAll", { count: media.length })}<ChevronRight className="size-4" />
    </button>
  </div>;
}
