import type { PublicMemoryMedia } from "./gallery";
import type { MemoryMoment } from "./repository";

export function groupMediaByTime(media: PublicMemoryMedia[], now: Date): Record<"tonight" | "thisAfternoon" | "earlier", PublicMemoryMedia[]> {
  const groups = { tonight: [] as PublicMemoryMedia[], thisAfternoon: [] as PublicMemoryMedia[], earlier: [] as PublicMemoryMedia[] };
  for (const item of media) {
    const timestamp = item.capturedAt ? Date.parse(item.capturedAt) : Number.NaN;
    const hoursAgo = Number.isFinite(timestamp) ? (now.getTime() - timestamp) / 3_600_000 : Number.POSITIVE_INFINITY;
    if (hoursAgo >= 0 && hoursAgo < 6) groups.tonight.push(item);
    else if (hoursAgo >= 0 && hoursAgo < 18) groups.thisAfternoon.push(item);
    else groups.earlier.push(item);
  }
  return groups;
}

export function momentForMedia(media: PublicMemoryMedia, moments: MemoryMoment[]): MemoryMoment | null {
  if (!media.capturedAt) return null;
  const captured = Date.parse(media.capturedAt);
  if (!Number.isFinite(captured)) return null;
  return [...moments]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((moment) => captured >= Date.parse(moment.startsAt) && captured < Date.parse(moment.endsAt)) ?? null;
}
