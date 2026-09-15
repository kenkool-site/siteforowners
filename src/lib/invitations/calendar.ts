export type EventCalendarInput = {
  uid?: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone?: string;
  location: string;
  description: string;
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1_000;

function calendarDates(input: Pick<EventCalendarInput, "startsAt" | "endsAt">): [Date, Date] {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new Error("Calendar events require a valid start instant");
  const end = input.endsAt ? new Date(input.endsAt) : new Date(start.getTime() + FOUR_HOURS_MS);
  if (Number.isNaN(end.getTime())) throw new Error("Calendar events require a valid end instant");
  if (end.getTime() <= start.getTime()) throw new Error("Calendar event end must follow its start");
  return [start, end];
}

function utcCalendarValue(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function safeUid(value: string): string {
  const localPart = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${localPart || "invitation"}@siteforowners.com`;
}

export function googleEventCalendarUrl(input: EventCalendarInput): string {
  const [start, end] = calendarDates(input);
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", input.title);
  url.searchParams.set("dates", `${utcCalendarValue(start)}/${utcCalendarValue(end)}`);
  url.searchParams.set("details", input.description);
  url.searchParams.set("location", input.location);
  if (input.timezone) url.searchParams.set("ctz", input.timezone);
  return url.toString();
}

export function eventIcsContents(input: EventCalendarInput): string {
  const [start, end] = calendarDates(input);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SiteForOwners//Invitation Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${safeUid(input.uid ?? `${input.title}-${input.startsAt}`)}`,
    `DTSTAMP:${utcCalendarValue(new Date(0))}`,
    `DTSTART:${utcCalendarValue(start)}`,
    `DTEND:${utcCalendarValue(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function eventIcsDataUrl(input: EventCalendarInput): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(eventIcsContents(input))}`;
}
