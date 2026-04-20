/**
 * Generate an .ics calendar file content for a booking.
 */

interface IcsEvent {
  title: string;
  description: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  organizerName: string;
  organizerEmail?: string;
  attendeeName: string;
  attendeeEmail?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatIcsDate(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}${m}${d}T${h}${min}00`;
}

function generateUid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@siteforowners.com`;
}

export function generateIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SiteForOwners//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${generateUid()}`,
    `DTSTART:${formatIcsDate(event.startDate)}`,
    `DTEND:${formatIcsDate(event.endDate)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
    ...(event.location ? [`LOCATION:${event.location}`] : []),
    ...(event.organizerEmail
      ? [`ORGANIZER;CN=${event.organizerName}:mailto:${event.organizerEmail}`]
      : []),
    ...(event.attendeeEmail
      ? [`ATTENDEE;CN=${event.attendeeName};RSVP=TRUE:mailto:${event.attendeeEmail}`]
      : []),
    "STATUS:CONFIRMED",
    `DTSTAMP:${formatIcsDate(new Date())}`,
    // Reminder 1 hour before
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${event.title}`,
    "END:VALARM",
    // Reminder 15 minutes before
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:Starting soon: ${event.title}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/**
 * Parse a time string like "2:30 PM" into hours and minutes (24h format)
 */
export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return { hours: 10, minutes: 0 };

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return { hours, minutes };
}
