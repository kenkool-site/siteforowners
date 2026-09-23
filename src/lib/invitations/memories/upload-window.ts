// src/lib/invitations/memories/upload-window.ts
const UPLOAD_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeUploadWindowClosesAt(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return null;
  return new Date(start + UPLOAD_WINDOW_DAYS * MS_PER_DAY).toISOString();
}

export function isUploadWindowOpen(startsAt: string | null, now: Date = new Date()): boolean {
  const closesAt = computeUploadWindowClosesAt(startsAt);
  if (!closesAt) return true; // undated draft: never auto-closes, matches state.ts's expireAt null handling
  return Date.parse(closesAt) > now.getTime();
}
