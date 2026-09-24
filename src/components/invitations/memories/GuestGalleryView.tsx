"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { visibleOptimisticUploads, type GuestUploadPreview } from "@/lib/invitations/memories/guest-gallery-presentation";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { groupMediaByTime } from "@/lib/invitations/memories/gallery-view";
import { MediaLightbox } from "./MediaLightbox";

const IDLE_POLL_MS = 15_000;
const PUBLISHING_POLL_MS = 2_000;

export function GuestGalleryView({ eventId, accent, surface, uploads }: { eventId: string; accent: string; surface: string; uploads: GuestUploadPreview[] }) {
  const t = useTranslations("invitations.public.memories.gallery");
  const [media, setMedia] = useState<PublicMemoryMedia[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const previousIds = useRef<Set<string>>(new Set());
  const hasPublishing = uploads.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "done");

  useEffect(() => {
    if (!hasPublishing) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [hasPublishing]);

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
    const interval = window.setInterval(poll, hasPublishing ? PUBLISHING_POLL_MS : IDLE_POLL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [eventId, hasPublishing]);

  const publishedIds = new Set(media.map((item) => item.id));
  const optimistic = visibleOptimisticUploads(uploads, publishedIds, now);
  const recent = media.filter((item) => now - Date.parse(item.uploadedAt) < 20 * 60 * 1000);
  const recentIds = new Set(recent.map((item) => item.id));
  const olderMedia = media.filter((item) => !recentIds.has(item.id));
  const olderGroups = groupMediaByTime(olderMedia, new Date(now));
  const hasJustAdded = optimistic.length > 0 || recent.length > 0;
  // Flat, on-screen-order list of every real (non-optimistic) photo, for the
  // lightbox's prev/next — optimistic uploads are excluded since they have
  // no server media id yet, only a local preview blob.
  const olderFlat = (["tonight", "thisAfternoon", "earlier"] as const).flatMap((section) => olderGroups[section]);
  const recentVisible = recent.slice(0, 8);
  const lightboxMedia = [...recentVisible, ...olderFlat];

  if (!loaded && optimistic.length === 0) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;
  if (error && media.length === 0 && optimistic.length === 0) return <p role="alert" className="p-8 text-center text-sm text-red-700">{t("error")}</p>;
  if (media.length === 0 && optimistic.length === 0) return <p className="px-6 py-16 text-center font-serif text-xl" style={{ color: accent }}>{t("empty")}</p>;

  return <div className="space-y-8 px-3 pb-48 pt-2 sm:px-5">
    {newCount > 0 && <button type="button" onClick={() => setNewCount(0)} className="sticky top-3 z-10 mx-auto block min-h-10 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg" style={{ backgroundColor: accent }}>{t("newPhotos", { count: newCount })}</button>}

    {hasJustAdded && <section aria-labelledby="just-added-heading">
      <div className="mb-3 flex items-center gap-3">
        <h2 id="just-added-heading" className="shrink-0 text-lg font-semibold" style={{ color: accent }}>{t("justAdded")}</h2>
        <span className="h-px flex-1 opacity-15" style={{ backgroundColor: accent }} />
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: accent }}>{t("live")}<span className="size-2 rounded-full opacity-70" style={{ backgroundColor: accent }} /></span>
      </div>
      <div className="flex snap-x gap-2.5 overflow-x-auto pb-1" aria-label={t("recentLabel")}>
        {optimistic.map((item) => <figure key={item.id} className="relative aspect-[4/5] w-[38%] min-w-[8.5rem] max-w-[11rem] shrink-0 snap-start overflow-hidden rounded-2xl" style={{ backgroundColor: surface }}>
          <img src={item.previewUrl} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 grid place-items-center bg-black/45 px-3 text-center text-white">
            <div><span className="mx-auto mb-3 block size-9 animate-spin rounded-full border-[3px] border-white/40 border-t-white motion-reduce:animate-none" /><span className="text-sm font-semibold">{item.status === "done" ? t("processing") : t("publishing", { percent: item.progress })}</span></div>
          </div>
        </figure>)}
        {recentVisible.map((item, index) => <figure key={item.id} className="aspect-[4/5] w-[38%] min-w-[8.5rem] max-w-[11rem] shrink-0 snap-start overflow-hidden rounded-2xl" style={{ backgroundColor: surface }}>
          <button type="button" onClick={() => setLightboxIndex(index)} className="block size-full">
            <img src={`/api/memories/media/${item.id}/thumbnail`} alt={item.uploaderDisplayName ? t("photoBy", { name: item.uploaderDisplayName }) : t("photoAlt")} className="size-full object-cover" />
          </button>
        </figure>)}
      </div>
    </section>}

    {olderMedia.length > 0 && <section aria-labelledby="earlier-heading">
      <div className="mb-3 flex items-center gap-3"><h2 id="earlier-heading" className="shrink-0 text-lg font-semibold" style={{ color: accent }}>{t("earlierToday")}</h2><span className="h-px flex-1 opacity-15" style={{ backgroundColor: accent }} /></div>
      <div className="columns-2 gap-2 sm:columns-3">
        {olderFlat.map((item, index) => <figure key={item.id} className="mb-2 break-inside-avoid overflow-hidden rounded-2xl" style={{ backgroundColor: surface }}>
          <button type="button" onClick={() => setLightboxIndex(recentVisible.length + index)} className="block w-full">
            <img src={`/api/memories/media/${item.id}/display`} alt={item.uploaderDisplayName ? t("photoBy", { name: item.uploaderDisplayName }) : t("photoAlt")} className="h-auto w-full" loading="lazy" />
          </button>
        </figure>)}
      </div>
    </section>}

    {lightboxIndex !== null && (
      <MediaLightbox media={lightboxMedia} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
    )}
  </div>;
}
