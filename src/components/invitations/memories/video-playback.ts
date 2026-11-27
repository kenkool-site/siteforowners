const SWIPE_THRESHOLD_PX = 50;

// Finger moving up (negative deltaY) advances, matching "Swipe up for next".
export function resolveVerticalSwipe(deltaY: number, index: number, total: number): number | null {
  if (Math.abs(deltaY) < SWIPE_THRESHOLD_PX) return null;
  if (deltaY < 0) return index < total - 1 ? index + 1 : null;
  return index > 0 ? index - 1 : null;
}

// Cache-bust the same-origin media route so a failed play fetches a new
// signed R2 URL. The route ignores the query string.
export function videoSourceUrl(base: string, refreshNonce: number): string {
  if (!refreshNonce) return base;
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}r=${refreshNonce}`;
}

export function nextVideoSourceAttempt(alreadyRetried: boolean): "refresh" | "fallback" {
  return alreadyRetried ? "fallback" : "refresh";
}

type Playable = { muted: boolean; play?: () => Promise<void> | void };

async function attemptPlay(video: Playable, muted: boolean): Promise<void> {
  video.muted = muted;
  if (typeof video.play !== "function") throw new Error("play unavailable");
  const result = video.play();
  if (result && typeof (result as Promise<void>).then === "function") await result;
}

// Unmuted autoplay is often blocked. Fall back to muted, and report when
// even that is refused so the player can show a tap-to-play button.
export async function playWithSoundFallback(video: Playable): Promise<"sound" | "muted" | "blocked"> {
  try {
    await attemptPlay(video, false);
    return "sound";
  } catch {
    try {
      await attemptPlay(video, true);
      return "muted";
    } catch {
      return "blocked";
    }
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export async function shareMemoryItem(mediaId: string): Promise<"shared" | "copied" | "unavailable"> {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("photo", mediaId);
  const shareUrl = url.toString();
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ url: shareUrl });
      return "shared";
    } catch {
      return "unavailable";
    }
  }
  try {
    await navigator.clipboard.writeText(shareUrl);
    return "copied";
  } catch {
    return "unavailable";
  }
}

export async function downloadMemoryFile(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
