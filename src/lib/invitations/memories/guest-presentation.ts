// Pure presentation helpers for the guest Memories redesign. Counts, names,
// dates, and section titles all come from event data passed in — nothing
// here knows about the sample wedding used in the design review.
import type { EventScheduleItem } from "@/lib/invitations/event-schedule";

export interface GuestMemoriesContext {
  eventId: string;
  slug: string;
  title: string;
  eventType: string;
  startsAt: string | null;
  timeZone: string;
  venueName: string | null;
  address: string | null;
  locale: string;
  findMeEnabled: boolean;
  brandingEnabled: boolean;
  schedule: EventScheduleItem[];
}

export function guestNameStorageKey(eventId: string): string {
  return `invitespot.memories.guestName.${eventId}`;
}

export function guestNameSkippedKey(eventId: string): string {
  return `invitespot.memories.namePromptSkipped.${eventId}`;
}
import type { PublicMemoryMedia } from "./gallery";
import { momentForMedia } from "./gallery-view";
import type { MemoryMoment } from "./repository";
import type { MemoriesGuestSession } from "./types";
import type { MemoryMedia } from "./types";

export const INVITESPOT_GUEST_ORIGIN = "https://www.invitespot.app/";

export type GalleryFilter = "all" | "videos" | "mine";

export type GuestMemoryItem = PublicMemoryMedia & { durationSeconds?: number | null };

export interface GallerySection<T> {
  id: string;
  title: string;
  whenLabel: string;
  items: T[];
}

export interface ShotSuggestion {
  id: string;
  title: string;
  hint: string;
}

export function invitespotGuestUrl(slug: string, content: string): string {
  const url = new URL(INVITESPOT_GUEST_ORIGIN);
  url.searchParams.set("utm_source", "memories");
  url.searchParams.set("utm_medium", "guest_page");
  url.searchParams.set("utm_campaign", slug.trim() || "event");
  url.searchParams.set("utm_content", content);
  return url.toString();
}

export function countdownDays(startsAt: string | null, now: Date): number | null {
  if (!startsAt) return null;
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start) || start <= now.getTime()) return null;
  return Math.max(1, Math.ceil((start - now.getTime()) / 86_400_000));
}

export function eventHasStarted(startsAt: string | null, now: Date): boolean {
  if (!startsAt) return true;
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return true;
  return start <= now.getTime();
}

export function initialOf(name: string): string {
  const char = Array.from(name.trim())[0];
  return char ? char.toLocaleUpperCase() : "";
}

export function contributorSummary(names: Array<string | null | undefined>): { named: string[]; more: number } {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return { named: unique.slice(0, 2), more: Math.max(0, unique.length - 2) };
}

export function knownContributorName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

export function formatVideoDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

/** Event timezone when the host hasn't set one, or set one Intl cannot use. */
export const DEFAULT_EVENT_TIME_ZONE = "America/New_York";

export function resolveTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone?.trim() ?? "";
  if (!candidate) return DEFAULT_EVENT_TIME_ZONE;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_EVENT_TIME_ZONE;
  }
}

export function formatInTimeZone(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const zone = resolveTimeZone(timeZone);
  const loc = locale.trim() || "en";
  try {
    return new Intl.DateTimeFormat(loc, { ...options, timeZone: zone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone }).format(date);
  }
}

// "Sep 24, 6:15 PM". Gallery day headings and this label must share
// resolveTimeZone — a guest's browser zone used to shift the lightbox onto
// a different calendar day than the section the same photo was filed under.
export function formatCapturedAt(capturedAt: string, timeZone?: string | null, locale = "en"): string {
  const day = formatInTimeZone(capturedAt, timeZone, locale, { month: "short", day: "numeric" }) ?? "";
  const time = formatInTimeZone(capturedAt, timeZone, locale, { hour: "numeric", minute: "2-digit" }) ?? "";
  return [day, time].filter(Boolean).join(", ");
}

// "Sat, Dec 19, 4:12 PM" — the video player's contributor line.
export function formatCapturedAtDetail(capturedAt: string, timeZone?: string | null, locale = "en"): string {
  const day = formatInTimeZone(capturedAt, timeZone, locale, { weekday: "short", month: "short", day: "numeric" }) ?? "";
  const time = formatInTimeZone(capturedAt, timeZone, locale, { hour: "numeric", minute: "2-digit" }) ?? "";
  return [day, time].filter(Boolean).join(", ");
}

export function formatApproxFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function photoVideoCounts(media: Array<{ mediaKind: string }>): { photos: number; videos: number } {
  const videos = media.filter((item) => item.mediaKind === "video").length;
  return { photos: media.length - videos, videos };
}

/** Ready videos in gallery order. The Watch row and the player share this list. */
export function watchableVideos<T extends { mediaKind: string }>(media: T[]): T[] {
  return media.filter((item) => item.mediaKind === "video");
}

/**
 * On All, videos live in the Watch row instead of the masonry so a clip
 * isn't shown twice. Every other filter keeps the items it already selected.
 */
export function galleryGridMedia<T extends { mediaKind: string }>(media: T[], filter: GalleryFilter | "honor"): T[] {
  if (filter === "all") return media.filter((item) => item.mediaKind !== "video");
  return media;
}

export function venueLine(venueName: string | null | undefined, address: string | null | undefined): string | null {
  const venue = venueName?.trim() ?? "";
  const place = address?.trim() ?? "";
  if (venue && place && !place.toLocaleLowerCase().includes(venue.toLocaleLowerCase()) && !venue.toLocaleLowerCase().includes(place.toLocaleLowerCase())) {
    return `${venue}, ${place}`;
  }
  return venue || place || null;
}

function itemTime(item: { capturedAt: string | null; uploadedAt: string }): number {
  const captured = item.capturedAt ? Date.parse(item.capturedAt) : Number.NaN;
  if (Number.isFinite(captured)) return captured;
  const uploaded = Date.parse(item.uploadedAt);
  return Number.isFinite(uploaded) ? uploaded : 0;
}

export function buildGallerySections<T extends PublicMemoryMedia>(
  media: T[],
  moments: MemoryMoment[],
  timeZone: string,
  locale: string,
): GallerySection<T>[] {
  const buckets = new Map<string, { title: string; whenLabel: string; items: T[]; latest: number }>();

  function ensure(id: string, title: string, whenLabel: string) {
    const existing = buckets.get(id);
    if (existing) return existing;
    const created = { title, whenLabel, items: [] as T[], latest: 0 };
    buckets.set(id, created);
    return created;
  }

  for (const item of media) {
    const moment = momentForMedia(item, moments);
    const stamp = itemTime(item);
    if (moment) {
      const when = formatInTimeZone(moment.startsAt, timeZone, locale, { weekday: "short", month: "short", day: "numeric" }) ?? "";
      const bucket = ensure(`moment:${moment.id}`, moment.name, when);
      bucket.items.push(item);
      bucket.latest = Math.max(bucket.latest, stamp);
      continue;
    }
    const dayKey = formatInTimeZone(item.capturedAt ?? item.uploadedAt, timeZone, locale, { year: "numeric", month: "2-digit", day: "2-digit" }) ?? "undated";
    const when = formatInTimeZone(item.capturedAt ?? item.uploadedAt, timeZone, locale, { weekday: "short", month: "short", day: "numeric" }) ?? "";
    const bucket = ensure(`day:${dayKey}`, when || dayKey, "");
    bucket.items.push(item);
    bucket.latest = Math.max(bucket.latest, stamp);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1].latest - a[1].latest)
    .map(([id, bucket]) => ({
      id,
      title: bucket.title,
      whenLabel: bucket.whenLabel,
      items: [...bucket.items].sort((a, b) => itemTime(b) - itemTime(a)),
    }));
}

export function filterGalleryMedia<T extends { id: string; mediaKind: string }>(
  media: T[],
  filter: GalleryFilter,
  mineIds: ReadonlySet<string>,
): T[] {
  if (filter === "videos") return media.filter((item) => item.mediaKind === "video");
  if (filter === "mine") return media.filter((item) => mineIds.has(item.id));
  return media;
}

export function shotSuggestions(
  moments: MemoryMoment[],
  schedule: EventScheduleItem[],
  timeZone: string,
  locale: string,
): ShotSuggestion[] {
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (moments.length > 0) {
    return [...moments]
      .sort((a, b) => a.sortOrder - b.sortOrder || Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 6)
      .map((moment) => ({
        id: moment.id,
        title: moment.name,
        hint: formatInTimeZone(moment.startsAt, timeZone, locale, timeOptions) ?? "",
      }));
  }
  return schedule.slice(0, 6).map((item, index) => ({
    id: `schedule-${index}`,
    title: item.name,
    hint: formatInTimeZone(item.startsAt, timeZone, locale, timeOptions) ?? "",
  }));
}

export type MomentPhase = "upcoming" | "open" | "past";

export function momentPhase(moment: MemoryMoment, now: Date): MomentPhase {
  const start = Date.parse(moment.startsAt);
  const end = Date.parse(moment.endsAt);
  if (Number.isFinite(start) && now.getTime() < start) return "upcoming";
  if (Number.isFinite(end) && now.getTime() >= end) return "past";
  return "open";
}

export function minutesUntil(startsAt: string, now: Date): number | null {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start) || start <= now.getTime()) return null;
  return Math.max(1, Math.round((start - now.getTime()) / 60_000));
}

export function suggestMomentId(timestamps: number[], moments: MemoryMoment[]): string | null {
  const finite = timestamps.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0 || moments.length === 0) return null;
  const median = finite[Math.floor(finite.length / 2)];
  const probe: PublicMemoryMedia = {
    id: "probe",
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: null,
    objectKeyThumbnail: null,
    capturedAt: new Date(median).toISOString(),
    uploadedAt: new Date(median).toISOString(),
  };
  return momentForMedia(probe, moments)?.id ?? null;
}

export function viewerMediaIdsForSession(
  media: MemoryMedia[],
  session: Pick<MemoriesGuestSession, "sessionId" | "rsvpId"> | null,
): string[] {
  if (!session) return [];
  return media
    .filter((item) =>
      (session.sessionId && item.uploaderSessionId === session.sessionId)
      || (session.rsvpId && item.uploaderRsvpId === session.rsvpId),
    )
    .map((item) => item.id);
}

export function memoriesOverline(eventType: string | null | undefined): "wedding" | "birthday" | "event" {
  const kind = (eventType ?? "").trim().toLowerCase();
  if (kind === "wedding" || kind === "boda") return "wedding";
  if (kind === "birthday" || kind === "cumpleaños" || kind === "cumpleanos" || kind === "cumple") return "birthday";
  return "event";
}
