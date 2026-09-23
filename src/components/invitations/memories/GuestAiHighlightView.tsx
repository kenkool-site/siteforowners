"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { aiHighlightGroups } from "@/lib/invitations/memories/gallery-view";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";

export function GuestAiHighlightView({ eventId, accent, surface }: { eventId: string; accent: string; surface: string }) {
  const t = useTranslations("invitations.public.memories.aiHighlight");
  const [moments, setMoments] = useState<MemoryMoment[]>([]);
  const [media, setMedia] = useState<PublicMemoryMedia[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/memories/events/${eventId}/gallery`).then(async (response) => {
      if (!response.ok) throw new Error(`ai-highlight ${response.status}`);
      return response.json() as Promise<{ media: PublicMemoryMedia[]; moments: MemoryMoment[] }>;
    }).then((payload) => {
      if (!cancelled) { setMedia(payload.media); setMoments(payload.moments); }
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (!loaded) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;

  const groups = aiHighlightGroups(media, moments);
  const selectedGroup = selected ? Array.from(groups).find(([moment]) => moment.id === selected) : undefined;

  if (selectedGroup) {
    const [moment, items] = selectedGroup;
    return <div className="space-y-4 p-4">
      <button type="button" onClick={() => setSelected(null)} className="min-h-11 text-sm font-semibold underline underline-offset-4" style={{ color: accent }}>{t("back")}</button>
      <h2 className="text-2xl font-semibold">{moment.name}</h2>
      <div className="columns-2 gap-2 sm:columns-3">{items.map((item) => <img key={item.id} src={`/api/memories/media/${item.id}/display`} alt="" className="mb-2 h-auto w-full break-inside-avoid rounded-xl" loading="lazy" />)}</div>
    </div>;
  }

  if (groups.size === 0) return <p className="p-8 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;

  return <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
    <p className="col-span-full text-sm" style={{ color: accent }}>{t("description")}</p>
    {Array.from(groups).map(([moment, items]) => (
      <button key={moment.id} type="button" onClick={() => setSelected(moment.id)} className="overflow-hidden rounded-2xl text-left shadow-sm" style={{ backgroundColor: surface }}>
        {items[0] && <img src={`/api/memories/media/${items[0].id}/thumbnail`} alt="" className="h-40 w-full object-cover" />}
        <div className="p-4"><p className="text-lg font-semibold">{moment.name}</p><p className="mt-1 text-sm" style={{ color: accent }}>{t("photoCount", { count: items.length })}</p></div>
      </button>
    ))}
  </div>;
}
