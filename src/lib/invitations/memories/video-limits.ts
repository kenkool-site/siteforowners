// How long a guest's video may be, and how many minutes of video one event
// may hold. Each guest gets one long clip; every other clip stays short. Long
// clips only open up once Cloudflare Stream is set up, since a five-minute
// original is too heavy to play on a phone without Stream's smaller copies.

export const SHORT_VIDEO_MAX_SECONDS = 60;
export const LONG_VIDEO_MAX_SECONDS = 5 * 60;
// A phone's reported length can run a little past the trim point.
export const VIDEO_DURATION_GRACE_SECONDS = 1;
export const DEFAULT_EVENT_VIDEO_MINUTES = 600;

export const SHORT_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
// About five minutes of 1080p phone video, with room to spare.
export const LONG_VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

export type VideoLimitCode = "too_long" | "long_clip_used" | "video_minutes_full";

export function longestAllowedVideoSeconds(streamConfigured: boolean): number {
  return streamConfigured ? LONG_VIDEO_MAX_SECONDS : SHORT_VIDEO_MAX_SECONDS;
}

export function isLongClip(durationSeconds: number | null | undefined): boolean {
  return typeof durationSeconds === "number" && durationSeconds > SHORT_VIDEO_MAX_SECONDS + VIDEO_DURATION_GRACE_SECONDS;
}

// The platform default comes from MEMORIES_VIDEO_MINUTES_PER_EVENT; an event's
// own memories_video_minutes_cap overrides it.
export function eventVideoMinutesCap(eventCap: number | null | undefined, platformSetting: string | undefined): number {
  if (typeof eventCap === "number" && Number.isFinite(eventCap) && eventCap > 0) return eventCap;
  const parsed = Number.parseInt(platformSetting ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EVENT_VIDEO_MINUTES;
}

// Clips whose length the phone could not read count as a full short clip.
export function countedVideoSeconds(durationSeconds: number | null | undefined): number {
  return typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : SHORT_VIDEO_MAX_SECONDS;
}

export function checkVideoLimits(input: {
  durationSeconds: number | null | undefined;
  streamConfigured: boolean;
  guestHasLongClip: boolean;
  // The guest has a session to tie the long clip to.
  guestIdentified: boolean;
  eventVideoSecondsUsed: number;
  eventVideoMinutesCap: number;
}): VideoLimitCode | null {
  const duration = input.durationSeconds;
  if (typeof duration === "number" && duration > longestAllowedVideoSeconds(input.streamConfigured) + VIDEO_DURATION_GRACE_SECONDS) {
    return "too_long";
  }
  if (isLongClip(duration)) {
    if (!input.guestIdentified) return "too_long";
    if (input.guestHasLongClip) return "long_clip_used";
  }
  if (input.eventVideoSecondsUsed + countedVideoSeconds(duration) > input.eventVideoMinutesCap * 60) {
    return "video_minutes_full";
  }
  return null;
}

export function maxVideoBytes(durationSeconds: number | null | undefined): number {
  return isLongClip(durationSeconds) ? LONG_VIDEO_MAX_BYTES : SHORT_VIDEO_MAX_BYTES;
}

// Big clips upload in pieces, so a dropped signal only resends one piece.
export const MULTIPART_PART_BYTES = 10 * 1024 * 1024;
export const MULTIPART_THRESHOLD_BYTES = 32 * 1024 * 1024;

export function multipartPartCount(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / MULTIPART_PART_BYTES));
}

export function usesMultipartUpload(mediaKind: "photo" | "video", sizeBytes: number): boolean {
  return mediaKind === "video" && sizeBytes >= MULTIPART_THRESHOLD_BYTES;
}
