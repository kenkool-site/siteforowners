"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Camera, MapPin, Play, ScanFace } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import type { GuestMemoriesContext } from "@/lib/invitations/memories/guest-presentation";
import {
  buildGallerySections,
  contributorSummary,
  countdownDays,
  eventHasStarted,
  filterGalleryMedia,
  formatInTimeZone,
  formatVideoDuration,
  knownContributorName,
  memoriesOverline,
  shotSuggestions,
  venueLine,
  type GalleryFilter,
} from "@/lib/invitations/memories/guest-presentation";
import { visibleOptimisticUploads, type GuestUploadPreview } from "@/lib/invitations/memories/guest-gallery-presentation";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import type { PublicHonorView } from "@/lib/invitations/memories/guests-of-honor";
import { HonorCreamLabel, HonorGlyph } from "./HonorMark";
import { defaultMediaSrc, gridVariant, type MediaImageSrc } from "./media-src";
import { MadeWithFooter, PlanningEndCard } from "./MemoriesChrome";
import { MediaLightbox } from "./MediaLightbox";

const IDLE_POLL_MS = 15_000;
const PUBLISHING_POLL_MS = 2_000;

export function GuestGalleryView({
  context,
  accent,
  surface,
  uploads,
  onAddPhotos,
  onFindMe,
  imageSrc = defaultMediaSrc,
  preview,
  openViewer,
  honor = null,
  viewerIsHost = false,
}: {
  context: GuestMemoriesContext;
  accent: string;
  surface: string;
  uploads: GuestUploadPreview[];
  onAddPhotos: () => void;
  onFindMe: () => void;
  imageSrc?: MediaImageSrc;
  preview?: { media: PublicMemoryMedia[]; moments: MemoryMoment[]; viewerMediaIds?: string[]; viewerKnown?: boolean; now?: number } | null;
  openViewer?: boolean;
  honor?: PublicHonorView | null;
  viewerIsHost?: boolean;
}) {
  const t = useTranslations("invitations.public.memories.gallery");
  const tr = useTranslations("invitations.public.memories.redesign");
  const th = useTranslations("invitations.public.memories.honorees");
  const [media, setMedia] = useState<PublicMemoryMedia[]>(preview?.media ?? []);
  const [moments, setMoments] = useState<MemoryMoment[]>(preview?.moments ?? []);
  const [viewerMediaIds, setViewerMediaIds] = useState<string[]>(preview?.viewerMediaIds ?? []);
  const [viewerKnown, setViewerKnown] = useState(Boolean(preview?.viewerKnown));
  const [loaded, setLoaded] = useState(Boolean(preview));
  const [error, setError] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [now, setNow] = useState(() => preview?.now ?? Date.now());
  const [filter, setFilter] = useState<GalleryFilter | "honor">("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(openViewer ? 0 : null);
  const previousIds = useRef<Set<string>>(new Set());
  const searchParams = useSearchParams();
  const appliedPhotoParam = useRef(false);
  const hasPublishing = uploads.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "done");

  useEffect(() => {
    if (!hasPublishing) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [hasPublishing]);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/memories/events/${context.eventId}/gallery`);
        if (!response.ok) throw new Error(`gallery ${response.status}`);
        const payload = (await response.json()) as { media: PublicMemoryMedia[]; moments?: MemoryMoment[]; viewerMediaIds?: string[]; viewerKnown?: boolean };
        if (cancelled) return;
        const ids = new Set(payload.media.map((item) => item.id));
        if (previousIds.current.size) {
          const arrived = Array.from(ids).filter((id) => !previousIds.current.has(id)).length;
          if (arrived) setNewCount((count) => count + arrived);
        }
        previousIds.current = ids;
        setMedia(payload.media);
        setMoments(payload.moments ?? []);
        setViewerMediaIds(payload.viewerMediaIds ?? []);
        setViewerKnown(Boolean(payload.viewerKnown));
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
  }, [context.eventId, hasPublishing, preview]);

  const publishedIds = new Set(media.map((item) => item.id));
  const optimistic = visibleOptimisticUploads(uploads, publishedIds, now);
  const localMine = new Set<string>([
    ...viewerMediaIds,
    ...uploads.map((item) => item.mediaId).filter((id): id is string => Boolean(id)),
  ]);
  const honorTitle = honor ? (honor.fixedKey ? th(honor.fixedKey) : honor.name ?? th("guestsOfHonor")) : "";
  const filtered = filter === "honor"
    ? media.filter((item) => Boolean(honor?.labels[item.id]))
    : filterGalleryMedia(media, filter, localMine);
  const timeSections = useMemo(
    () => buildGallerySections(filtered, moments, context.timeZone, context.locale),
    [filtered, moments, context.timeZone, context.locale],
  );
  const sections = filter === "honor"
    ? [{ id: "honor", title: honorTitle, whenLabel: "", items: filtered }]
    : timeSections;
  const lightboxMedia = sections.flatMap((section) => section.items);
  const videoCount = media.filter((item) => item.mediaKind === "video").length;
  const showMine = viewerKnown || localMine.size > 0;
  const contributors = contributorSummary(media.map((item) => item.uploaderDisplayName));
  const place = venueLine(context.venueName, context.address);
  const started = eventHasStarted(context.startsAt, new Date(now));
  const days = countdownDays(context.startsAt, new Date(now));
  const when = formatInTimeZone(context.startsAt, context.timeZone, context.locale, started
    ? { month: "short", day: "numeric", year: "numeric" }
    : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const shots = shotSuggestions(moments, context.schedule, context.timeZone, context.locale);
  const heroPhotos = media.slice(0, 3);

  useEffect(() => {
    if (appliedPhotoParam.current || !loaded) return;
    appliedPhotoParam.current = true;
    const photoId = searchParams?.get("photo");
    if (!photoId) return;
    const index = lightboxMedia.findIndex((item) => item.id === photoId);
    if (index !== -1) setLightboxIndex(index);
  }, [loaded, lightboxMedia, searchParams]);

  if (!loaded && optimistic.length === 0) return <p className="p-8 text-center text-sm opacity-70">{t("loading")}</p>;
  if (error && media.length === 0 && optimistic.length === 0) return <p role="alert" className="p-8 text-center text-sm text-red-700">{t("error")}</p>;

  const empty = media.length === 0 && optimistic.length === 0;

  return (
    <div className="px-4 pb-36">
      {newCount > 0 && <button type="button" onClick={() => setNewCount(0)} className="sticky top-3 z-10 mx-auto mb-3 block min-h-10 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg" style={{ backgroundColor: accent }}>{t("newPhotos", { count: newCount })}</button>}

      <section className="relative overflow-hidden rounded-3xl px-5 pb-4 pt-5 text-white shadow-lg" style={{ background: `radial-gradient(120% 90% at 100% 0%, ${accent} 0%, #163824 70%)` }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e9d6af]">{memoriesOverline(context.eventType) === "wedding" ? tr("weddingMemories") : memoriesOverline(context.eventType) === "birthday" ? tr("birthdayMemories") : tr("eventMemories")}</p>
        {days !== null && (
          <div className="absolute right-4 top-4 rounded-2xl border border-[#e9d6af]/40 bg-white/10 px-3 py-2 text-center">
            <b className="block font-serif text-2xl font-medium leading-none">{days}</b>
            <small className="text-[10px] uppercase tracking-wider text-[#e9d6af]">{tr("daysToGo", { count: days })}</small>
          </div>
        )}
        {!empty && heroPhotos.length > 0 && (
          <div className="pointer-events-none absolute right-3 top-3 flex">
            {heroPhotos.map((item, index) => (
              <span key={item.id} className="h-16 w-12 rounded-lg border-2 border-[#fbfaf6] bg-cover shadow-md" style={{ backgroundImage: `url(${imageSrc(item.id, "thumbnail")})`, transform: `rotate(${[-8, 3, 10][index] ?? 0}deg)`, marginLeft: index ? -18 : 0 }} />
            ))}
          </div>
        )}
        <h2 className="mt-14 font-serif text-4xl font-medium leading-none">{context.title}</h2>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/90">
          {when && <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" />{when}</span>}
          {place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{place}</span>}
        </div>
        {!empty && (
          <div className="mt-3 flex items-center gap-2 border-t border-white/20 pt-3 text-xs">
            <span className="font-semibold">{tr("photoCount", { count: media.length })}</span>
            {contributors.named.length > 0 && (
              <span>
                {contributors.more > 0
                  ? tr("fromNamedMore", { names: contributors.named.join(", "), more: contributors.more })
                  : tr("fromNamed", { names: contributors.named.join(", ") })}
              </span>
            )}
          </div>
        )}
      </section>

      {!empty && (
        <div className="mt-3.5 flex gap-2.5">
          <button type="button" onClick={onAddPhotos} className="inline-flex h-[3.1rem] flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white shadow-md" style={{ backgroundColor: accent }}>
            <Camera className="size-4" />{tr("addPhotos")}
          </button>
          {context.findMeEnabled && (
            <button type="button" onClick={onFindMe} className="inline-flex h-[3.1rem] items-center justify-center gap-2 rounded-full border px-4 text-[15px] font-semibold" style={{ color: accent, backgroundColor: surface, borderColor: `${accent}22` }}>
              <ScanFace className="size-4" />{tr("findYourself")}
            </button>
          )}
        </div>
      )}

      {!empty && (
        <div className="mt-3.5 flex gap-2 overflow-x-auto">
          <FilterChip label={tr("filterAll")} count={media.length} active={filter === "all"} onClick={() => setFilter("all")} accent={accent} surface={surface} />
          {honor && honor.count > 0 && <FilterChip label={honorTitle} count={honor.count} active={filter === "honor"} onClick={() => setFilter("honor")} accent={accent} surface={surface} />}
          {videoCount > 0 && <FilterChip label={tr("filterVideos")} count={videoCount} active={filter === "videos"} onClick={() => setFilter("videos")} accent={accent} surface={surface} />}
          {showMine && <FilterChip label={tr("filterMine")} count={filterGalleryMedia(media, "mine", localMine).length} active={filter === "mine"} onClick={() => setFilter("mine")} accent={accent} surface={surface} />}
        </div>
      )}

      {optimistic.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto" aria-label={t("recentLabel")}>
          {optimistic.map((item) => (
            <figure key={item.id} className="relative aspect-[4/5] w-32 shrink-0 overflow-hidden rounded-2xl" style={{ backgroundColor: surface }}>
              {item.previewUrl && <img src={item.previewUrl} alt="" className="size-full object-cover" />}
              <div className="absolute inset-0 grid place-items-center bg-black/45 px-2 text-center text-xs font-semibold text-white">
                {item.status === "done" ? t("processing") : t("publishing", { percent: item.progress })}
              </div>
            </figure>
          ))}
        </div>
      )}

      {empty ? (
        <>
          {viewerIsHost && honor && !started && (
            <div className="mt-4 flex gap-3 rounded-[20px] border border-[#e4d6b0] bg-gradient-to-b from-[#f7f1e3] to-[#f0e6d0] p-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/70 text-[#8a6d32]"><HonorGlyph icon={honor.icon} className="size-5" /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a6d32]">{th("visibleOnly")}</p>
                <p className="text-sm font-semibold">{honor.names.length === 1 ? th("bannerOne", { name: honor.names[0] ?? "" }) : honor.names.length === 2 ? th("bannerTwo", { first: honor.names[0] ?? "", second: honor.names[1] ?? "" }) : th("bannerMany", { names: honor.names.join(", ") })}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#6d5c3a]">{th("bannerBody")}</p>
              </div>
            </div>
          )}
          <div className="mt-4 rounded-3xl border px-5 py-6 text-center" style={{ backgroundColor: surface, borderColor: `${accent}22` }}>
            <h3 className="font-serif text-xl font-semibold" style={{ color: accent }}>{tr("emptyTitle")}</h3>
            <p className="mt-1 text-sm opacity-70">{tr("emptyBody")}</p>
            <button type="button" onClick={onAddPhotos} className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>
              <Camera className="size-4" />{tr("addYourPhotos")}
            </button>
          </div>
          {shots.length > 0 && (
            <div className="mt-3 rounded-3xl border p-4" style={{ backgroundColor: surface, borderColor: `${accent}22` }}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider opacity-60">{tr("shotListTitle")}</h3>
              <ul className="mt-3 grid gap-3">
                {shots.map((shot) => (
                  <li key={shot.id} className="flex items-center gap-3">
                    <span className="size-9 shrink-0 rounded-xl" style={{ backgroundColor: `${accent}18` }} />
                    <span>
                      <span className="block text-sm font-semibold">{shot.title}</span>
                      {shot.hint && <span className="block text-xs opacity-60">{tr("shotHint", { time: shot.hint })}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {context.findMeEnabled && <p className="mt-3 flex gap-2 rounded-2xl px-3 py-3 text-xs leading-5" style={{ backgroundColor: `${accent}12` }}><ScanFace className="mt-0.5 size-4 shrink-0" style={{ color: accent }} />{tr("findLater")}</p>}
        </>
      ) : (
        sections.map((section) => (
          <section key={section.id} className="mt-5">
            <div className="mb-2.5 flex items-baseline gap-2">
              <h3 className="font-serif text-lg font-semibold" style={{ color: accent }}>{filter === "honor" ? honorTitle : section.title}</h3>
              <span className="text-xs opacity-60">{[filter === "honor" ? null : section.whenLabel, String(section.items.length)].filter(Boolean).join(" · ")}</span>
              <span className="h-px flex-1" style={{ backgroundColor: `${accent}22` }} />
            </div>
            <div className="columns-2 gap-2.5">
              {section.items.map((item) => {
                const name = knownContributorName(item.uploaderDisplayName);
                const length = item.mediaKind === "video" ? formatVideoDuration(item.durationSeconds) : null;
                const index = lightboxMedia.findIndex((candidate) => candidate.id === item.id);
                return (
                  <figure key={item.id} className="relative mb-2.5 break-inside-avoid overflow-hidden rounded-2xl" style={{ backgroundColor: surface }}>
                    <button type="button" onClick={() => setLightboxIndex(index)} className="relative block w-full">
                      <img src={imageSrc(item.id, gridVariant(item.mediaKind))} alt={name ? t("photoBy", { name }) : ""} className="h-auto w-full" loading="lazy" />
                      {honor?.labels[item.id] && <HonorCreamLabel label={honor.labels[item.id] ?? ""} icon={honor.icon} className="absolute left-2 top-2 z-[1]" />}
                      {item.mediaKind === "video" && (
                        <span aria-hidden="true" data-play-badge="true" className={`pointer-events-none absolute top-2 inline-flex h-6 items-center gap-1 rounded-full bg-black/50 px-2 text-[11px] font-semibold text-white ${honor?.labels[item.id] ? "right-2" : "left-2"}`}>
                          <Play className="size-2.5 fill-current" />{length}
                        </span>
                      )}
                      {name && (
                        <span className="pointer-events-none absolute bottom-2 left-2 inline-flex h-6 max-w-[90%] items-center gap-1 rounded-full bg-black/50 pl-0.5 pr-2 text-[11px] font-semibold text-white">
                          <i className="grid size-5 place-items-center rounded-full bg-[#e9d6af] text-[10px] not-italic text-[#1c2a20]">{Array.from(name)[0]?.toUpperCase()}</i>
                          <span className="truncate">{name}</span>
                        </span>
                      )}
                    </button>
                  </figure>
                );
              })}
            </div>
          </section>
        ))
      )}

      {!empty && <p className="mt-6 text-center text-xs opacity-60">{tr("caughtUp", { count: media.length })}</p>}
      {!empty && context.brandingEnabled && <PlanningEndCard slug={context.slug} accent={accent} surface={surface} text={accent} />}
      {context.brandingEnabled && <MadeWithFooter slug={context.slug} accent={accent} />}

      {lightboxIndex !== null && lightboxMedia[lightboxIndex] && (
        <MediaLightbox
          media={lightboxMedia}
          index={lightboxIndex}
          moments={moments}
          imageSrc={imageSrc}
          onFindMe={context.findMeEnabled ? onFindMe : undefined}
          honorLabels={honor?.labels}
          honorIcon={honor?.icon}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick, accent, surface }: { label: string; count: number; active: boolean; onClick: () => void; accent: string; surface: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold" style={{ backgroundColor: active ? "#1c2a20" : surface, color: active ? "#fff" : accent, boxShadow: active ? undefined : `inset 0 0 0 1px ${accent}22` }}>
      {label} <small className="font-medium opacity-70">{count}</small>
    </button>
  );
}
