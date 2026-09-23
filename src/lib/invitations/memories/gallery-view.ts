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

function distanceToWindow(captured: number, startsAt: number, endsAt: number): number {
  if (captured < startsAt) return startsAt - captured;
  if (captured >= endsAt) return captured - endsAt;
  return 0;
}

export function momentForMedia(media: PublicMemoryMedia, moments: MemoryMoment[]): MemoryMoment | null {
  // Deliberately time-window only, even though media.momentId (an AI
  // classification override) is available — the "Moments" tab is the host's
  // own schedule-based view and must never silently disagree with it. AI's
  // content-based grouping lives in its own separate "AI Highlight" tab
  // (aiHighlightGroups, below) instead of overriding this one.
  if (moments.length === 0 || !media.capturedAt) return null;
  const captured = Date.parse(media.capturedAt);
  if (!Number.isFinite(captured)) return null;

  const sorted = [...moments].sort((a, b) => a.sortOrder - b.sortOrder);
  const strictMatch = sorted.find(
    (moment) => captured >= Date.parse(moment.startsAt) && captured < Date.parse(moment.endsAt),
  );
  if (strictMatch) return strictMatch;

  // Real events rarely run exactly on the schedule a host typed in — a photo
  // taken before the first Moment starts, after the last one ends, or in a gap
  // between two (the ceremony ran long, say) would otherwise never sort into
  // any Moment at all. Falling back to whichever Moment's boundary is
  // temporally closest keeps every timestamped photo grouped somewhere,
  // trading a small amount of precision at the edges for guests never seeing
  // an unexplained "unsorted" photo. Ties keep the earlier sortOrder (`<`, not
  // `<=`), matching the strict-match branch's own first-match-wins rule.
  let closest = sorted[0];
  let closestDistance = distanceToWindow(captured, Date.parse(closest.startsAt), Date.parse(closest.endsAt));
  for (const moment of sorted.slice(1)) {
    const distance = distanceToWindow(captured, Date.parse(moment.startsAt), Date.parse(moment.endsAt));
    if (distance < closestDistance) {
      closest = moment;
      closestDistance = distance;
    }
  }
  return closest;
}

/**
 * Groups only the photos AI actually classified by content (media.momentId,
 * written by moment-classification.ts) into their matched Moment — a photo
 * with no AI classification is simply absent here, never falling back to a
 * time-window guess the way momentForMedia does. This is the "AI Highlight"
 * tab's data source: a second, independent lens on the same photos, kept
 * deliberately separate from the host's own schedule-based Moments tab.
 */
export function aiHighlightGroups(media: PublicMemoryMedia[], moments: MemoryMoment[]): Map<MemoryMoment, PublicMemoryMedia[]> {
  const momentsById = new Map(moments.map((moment) => [moment.id, moment]));
  const groups = new Map<MemoryMoment, PublicMemoryMedia[]>();
  for (const item of media) {
    if (!item.momentId) continue;
    const moment = momentsById.get(item.momentId);
    if (!moment) continue; // dangling override — the moment was deleted since classification ran
    const existing = groups.get(moment);
    if (existing) existing.push(item);
    else groups.set(moment, [item]);
  }
  return groups;
}
