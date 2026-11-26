import type { InvitationLocale } from "./types";

/** Left literal in the draft. Filled for every recipient at send time. */
export const DAYS_TO_GO_PLACEHOLDER = "{days_to_go}";

const DEFAULT_EVENT_TIMEZONE = "America/New_York";
const MS_PER_DAY = 86_400_000;

function isTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Event zone, or America/New_York when the stored value is missing or not a real zone. */
export function eventTimezone(timezone: string | null | undefined): string {
  const trimmed = timezone?.trim() ?? "";
  return trimmed && isTimezone(trimmed) ? trimmed : DEFAULT_EVENT_TIMEZONE;
}

function zonedDate(date: Date, timeZone: string): { year: number; month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const year = read("year");
    const month = read("month");
    const day = read("day");
    if (!year || !month || !day) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

/**
 * Calendar days from `now` to the event date, both read in the event timezone.
 * Today is 0 even after the start time. A later calendar day is negative.
 * Null when the event has no usable start.
 */
export function calendarDaysUntilEvent(
  startsAt: string | null | undefined,
  timezone: string | null | undefined,
  now: Date,
): number | null {
  if (!startsAt || Number.isNaN(now.getTime())) return null;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const zone = eventTimezone(timezone);
  const eventDay = zonedDate(start, zone);
  const today = zonedDate(now, zone);
  if (!eventDay || !today) return null;
  const diff = Date.UTC(eventDay.year, eventDay.month - 1, eventDay.day)
    - Date.UTC(today.year, today.month - 1, today.day);
  return Math.round(diff / MS_PER_DAY);
}

/** Phrase for one countdown. Empty once the event date has passed, or when it cannot be counted. */
export function daysToGoText(days: number | null, locale: InvitationLocale): string {
  if (days == null || !Number.isInteger(days) || days < 0) return "";
  if (locale === "es") {
    if (days === 0) return "¡es hoy!";
    if (days === 1) return "falta 1 día";
    return `faltan ${days} días`;
  }
  if (days === 0) return "today's the day";
  if (days === 1) return "1 day to go";
  return `${days} days to go`;
}

/**
 * Replace `{days_to_go}`. An empty phrase is removed so the sentence still reads:
 * doubled spaces collapse, and punctuation that only introduced the phrase is dropped.
 */
export function substituteDaysToGo(template: string, phrase: string): string {
  if (!template.includes(DAYS_TO_GO_PLACEHOLDER)) return template;
  if (!phrase) return removeEmptyDaysToGo(template);
  const withSentenceEnd = template.replace(/\{days_to_go\}(\.+)/g, (_match, dots: string) => (
    /[.!?]$/.test(phrase) ? phrase : `${phrase}${dots}`
  ));
  return withSentenceEnd.replace(/\{days_to_go\}/g, () => phrase);
}

function removeEmptyDaysToGo(template: string): string {
  let next = template.replace(/[ \t]*[:;,][ \t]*\{days_to_go\}[ \t]*(?=\n|$)/g, "");
  next = next.replace(/[ \t]+-[ \t]*\{days_to_go\}[ \t]*(?=\n|$)/g, "");
  next = next.replace(/^[ \t]*\{days_to_go\}[ \t]*$/gm, "");
  next = next.replace(/[ \t]*\{days_to_go\}[ \t]*/g, " ");
  next = next.replace(/[ \t]{2,}/g, " ");
  next = next.replace(/[ \t]+([,!.?;:])/g, "$1");
  next = next.replace(/[,:;]([.!?])/g, "$1");
  next = next.replace(/\.{2,}/g, ".");
  next = next.replace(/[ \t]{2,}/g, " ");
  next = next.replace(/[ \t]+([,!.?;:])/g, "$1");
  next = next.replace(/[ \t]+\n/g, "\n");
  next = next.replace(/\n[ \t]+/g, "\n");
  next = next.replace(/[ \t]+$/gm, "");
  next = next.replace(/\n{3,}/g, "\n\n");
  if (!next.trim()) return "";
  return next;
}
