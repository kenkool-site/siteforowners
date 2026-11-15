// Presentation math for the guest event site. Countdown length is the real
// gap between two instants. The event timezone formats the clock guests read
// and the calendar day in "Until {date}" — it does not change the instant.

export const INVITESPOT_EVENT_ORIGIN = "https://www.invitespot.app/";

export type EventPhase = "upcoming" | "thanks" | "undated";

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function eventKind(eventType: string | null | undefined): "wedding" | "birthday" | "event" {
  const kind = (eventType ?? "").trim().toLowerCase();
  if (kind === "wedding" || kind === "boda") return "wedding";
  if (kind === "birthday" || kind === "cumpleaños" || kind === "cumpleanos" || kind === "cumple") return "birthday";
  return "event";
}

export function eventPhase(startsAt: string | null | undefined, now: Date): EventPhase {
  if (!startsAt) return "undated";
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return "undated";
  return start <= now.getTime() ? "thanks" : "upcoming";
}

/** Remaining time until the start. Null once the event has begun — never a stuck 00:00:00:00. */
export function countdownParts(startsAt: string | null | undefined, now: Date): CountdownParts | null {
  if (eventPhase(startsAt, now) !== "upcoming" || !startsAt) return null;
  const totalSeconds = Math.floor((Date.parse(startsAt) - now.getTime()) / 1000);
  if (totalSeconds <= 0) return null;
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatInEventZone(
  iso: string | null | undefined,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

export function formatEventWhen(iso: string | null | undefined, timeZone: string, locale: string): string | null {
  const date = formatInEventZone(iso, timeZone, locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = formatInEventZone(iso, timeZone, locale, { hour: "numeric", minute: "2-digit" });
  if (!date || !time) return null;
  return `${date} · ${time}`;
}

export function formatEventDay(iso: string | null | undefined, timeZone: string, locale: string): string | null {
  return formatInEventZone(iso, timeZone, locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatEventTime(iso: string | null | undefined, timeZone: string, locale: string): string | null {
  return formatInEventZone(iso, timeZone, locale, { hour: "numeric", minute: "2-digit" });
}

export function untilDateLabel(iso: string | null | undefined, timeZone: string, locale: string): string | null {
  return formatInEventZone(iso, timeZone, locale, { month: "long", day: "numeric" });
}

/** Host-saved map link wins; otherwise search maps for the street address. */
export function directionsHref(address: string | null | undefined, mapUrl: string | null | undefined): string | null {
  const map = mapUrl?.trim();
  if (map) return map;
  const place = address?.trim();
  if (!place) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}

export function eventSiteGuestUrl(slug: string, content: string): string {
  const url = new URL(INVITESPOT_EVENT_ORIGIN);
  const campaign = slug.trim() || "event";
  url.searchParams.set("from", campaign);
  url.searchParams.set("utm_source", "event_site");
  url.searchParams.set("utm_medium", "guest_page");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", content);
  return url.toString();
}

export function memoriesPath(slug: string): string {
  return `/invite/${encodeURIComponent(slug)}/memories`;
}
