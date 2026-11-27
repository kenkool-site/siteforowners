// When the Stream archive job is on, events that started more than this many
// days ago lose their Stream copies (see the memories-stream-archive cron).
// Unset, blank, or not a positive whole number means the job is off.
export function archiveCutoffIso(afterDaysSetting: string | undefined, nowMs: number = Date.now()): string | null {
  if (!afterDaysSetting || !/^\d+$/.test(afterDaysSetting.trim())) return null;
  const days = Number.parseInt(afterDaysSetting.trim(), 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
}
