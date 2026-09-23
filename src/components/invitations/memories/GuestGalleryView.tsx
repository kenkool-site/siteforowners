"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { groupMediaByTime } from "@/lib/invitations/memories/gallery-view";

const POLL_MS = 15_000;

export function GuestGalleryView({ eventId, accent, surface }: { eventId: string; accent: string; surface: string }) {
  const t = useTranslations("invitations.public.memories.gallery");
  const [media, setMedia] = useState<PublicMemoryMedia[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const previousIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/memories/events/${eventId}/gallery`);
        if (!response.ok) throw new Error(`gallery ${response.status}`);
        const payload = (await response.json()) as { media: PublicMemoryMedia[] };
        if (cancelled) return;
        const ids = new Set(payload.media.map((item) => item.id));
        if (previousIds.current.size) {
          const arrived = Array.from(ids).filter((id) => !previousIds.current.has(id)).length;
          if (arrived) setNewCount((count) => count + arrived);
        }
        previousIds.current = ids;
        setMedia(payload.media);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void poll();
    const interval = window.setInterval(poll, POLL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [eventId]);

  if (!loaded) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;
  if (error && media.length === 0) return <p role="alert" className="p-8 text-center text-sm text-red-700">{t("error")}</p>;
  if (media.length === 0) return <p className="p-8 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;

  const groups = groupMediaByTime(media, new Date());
  const recent = media.filter((item) => Date.now() - Date.parse(item.uploadedAt) < 20 * 60 * 1000);

  return <div className="space-y-7 px-4 py-5">
    {recent.length > 0 && <div className="flex gap-3 overflow-x-auto pb-1" aria-label={t("recentLabel")}>
      {recent.slice(0, 10).map((item) => <div key={item.id} className="size-16 shrink-0 rounded-full border-2 p-0.5" style={{ borderColor: accent }}>
        <img src={`/api/memories/media/${item.id}/thumbnail`} alt="" className="size-full rounded-full object-cover" />
      </div>)}
    </div>}
    {newCount > 0 && <button type="button" onClick={() => setNewCount(0)} className="sticky top-3 z-10 mx-auto block min-h-11 rounded-full px-5 py-2 text-sm font-semibold text-white shadow-lg" style={{ backgroundColor: accent }}>{t("newPhotos", { count: newCount })}</button>}
    {(["tonight", "thisAfternoon", "earlier"] as const).map((section) => groups[section].length > 0 && <section key={section}>
      <h2 className="mb-3 text-base font-semibold" style={{ color: accent }}>{t(section)}</h2>
      <div className="columns-2 gap-2 sm:columns-3">
        {groups[section].map((item) => <figure key={item.id} className="mb-2 break-inside-avoid overflow-hidden rounded-xl" style={{ backgroundColor: surface }}>
          <img src={`/api/memories/media/${item.id}/display`} alt={item.uploaderDisplayName ? t("photoBy", { name: item.uploaderDisplayName }) : t("photoAlt")} className="h-auto w-full" loading="lazy" />
        </figure>)}
      </div>
    </section>)}
  </div>;
}
