"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { momentForMedia } from "@/lib/invitations/memories/gallery-view";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";

export function GuestMomentsView({ eventId, accent, surface }: { eventId: string; accent: string; surface: string }) {
  const t = useTranslations("invitations.public.memories.moments");
  const [moments, setMoments] = useState<MemoryMoment[]>([]);
  const [media, setMedia] = useState<PublicMemoryMedia[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/memories/events/${eventId}/gallery`).then(async (response) => {
      if (!response.ok) throw new Error(`moments ${response.status}`);
      return response.json() as Promise<{ media: PublicMemoryMedia[]; moments: MemoryMoment[] }>;
    }).then((payload) => {
      if (!cancelled) { setMedia(payload.media); setMoments(payload.moments); }
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (!loaded) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;
  const selectedMoment = moments.find((moment) => moment.id === selected);
  if (selectedMoment) {
    const selectedMedia = media.filter((item) => momentForMedia(item, moments)?.id === selectedMoment.id);
    return <div className="space-y-4 p-4">
      <button type="button" onClick={() => setSelected(null)} className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full py-1 pl-1 pr-3 text-sm font-semibold" style={{ color: accent }}>
        <ChevronLeft className="size-5" />
        {t("back")}
      </button>
      <h2 className="text-2xl font-semibold">{selectedMoment.name}</h2>
      <div className="columns-2 gap-2 sm:columns-3">{selectedMedia.map((item) => <div key={item.id} className="relative mb-2 break-inside-avoid">
        <img src={`/api/memories/media/${item.id}/${item.mediaKind === "video" ? "thumbnail" : "display"}`} alt="" className="h-auto w-full rounded-xl" loading="lazy" />
        {item.mediaKind === "video" && <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-9 place-items-center rounded-full bg-black/45 text-white"><Play className="size-4 fill-current" /></span>
        </span>}
      </div>)}</div>
    </div>;
  }
  if (moments.length === 0) return <p className="p-8 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;
  return <div className="p-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{moments.map((moment) => {
      const items = media.filter((item) => momentForMedia(item, moments)?.id === moment.id);
      return <button key={moment.id} type="button" onClick={() => setSelected(moment.id)} className="overflow-hidden rounded-2xl text-left shadow-md ring-1 ring-black/5 transition-transform active:scale-[0.98]" style={{ backgroundColor: surface }}>
        {items[0] && <div className="relative">
          <img src={`/api/memories/media/${items[0].id}/thumbnail`} alt="" className="aspect-[4/5] w-full object-cover" loading="lazy" />
          {items[0].mediaKind === "video" && <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid size-9 place-items-center rounded-full bg-black/45 text-white"><Play className="size-4 fill-current" /></span>
          </span>}
        </div>}
        <div className="p-2.5">
          <p className="text-sm font-semibold leading-snug">{moment.name}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide opacity-70" style={{ color: accent }}>{t("photoCount", { count: items.length })}</p>
        </div>
      </button>;
    })}</div>
  </div>;
}
