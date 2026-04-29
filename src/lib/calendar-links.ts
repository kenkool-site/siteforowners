/**
 * Build "Add to Calendar" links for the customer email body. Replacing the
 * .ics attachment with click-to-add links sidesteps Gmail's first-contact
 * "auto-add invites from this sender?" banner — that prompt is only shown
 * when an unfamiliar From address sends a calendar attachment.
 */

interface CalendarEvent {
  title: string;
  description: string;
  location?: string;
  startDate: Date;
  endDate: Date;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Floating local time (no Z, no TZID) — same convention as the .ics so a
 * customer in any timezone reads the appointment at the wall-clock time the
 * business posted. */
function formatFloating(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}${m}${d}T${h}${min}00`;
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatFloating(event.startDate)}/${formatFloating(event.endDate)}`,
    details: event.description,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Public URL the customer can click to download a fresh .ics for this
 * booking. Used in the email body in place of the attachment. */
export function hostedIcsUrl(appUrl: string, bookingId: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/booking/${bookingId}/ics`;
}
