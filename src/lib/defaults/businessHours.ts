import type { BusinessHours } from "@/lib/ai/types";

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Day = (typeof DAY_ORDER)[number];

export const DEFAULT_HOURS: BusinessHours = {
  Monday: { open: "10:00 AM", close: "7:00 PM" },
  Tuesday: { open: "10:00 AM", close: "7:00 PM" },
  Wednesday: { open: "10:00 AM", close: "7:00 PM" },
  Thursday: { open: "10:00 AM", close: "7:00 PM" },
  Friday: { open: "10:00 AM", close: "7:00 PM" },
  Saturday: { open: "10:00 AM", close: "5:00 PM" },
  Sunday: { open: "", close: "", closed: true },
};

// booking_settings.working_hours stores closed days as `null` (not `{closed:true}`).
// Normalize to BusinessHours shape used by display layer.
type BookingHoursShape = Record<string, { open: string; close: string } | null> | null | undefined;

function normalizeBookingHours(booking: BookingHoursShape): BusinessHours | null {
  if (!booking || Object.keys(booking).length === 0) return null;
  const out: BusinessHours = {};
  for (const day of DAY_ORDER) {
    const v = booking[day];
    if (v === null) {
      out[day] = { open: "", close: "", closed: true };
    } else if (v) {
      out[day] = { open: v.open, close: v.close };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function isHoursEmpty(hours: BusinessHours | null | undefined): boolean {
  if (!hours) return true;
  return Object.keys(hours).length === 0;
}

/**
 * Precedence: booking_settings.working_hours → previews.hours → DEFAULT_HOURS.
 * Returns the hours map to render in the footer.
 */
export function resolveDisplayHours(
  bookingHours: BookingHoursShape,
  previewHours: BusinessHours | null | undefined
): BusinessHours {
  const normalizedBooking = normalizeBookingHours(bookingHours);
  if (normalizedBooking) return normalizedBooking;
  if (!isHoursEmpty(previewHours)) return previewHours as BusinessHours;
  return DEFAULT_HOURS;
}

export type HoursSource = "booking" | "google" | "custom" | "default";

/**
 * Identifies which source the displayed hours come from. Used by the
 * SiteEditor to render a "Source: ..." badge next to the editor.
 */
export function getHoursSource(
  bookingHours: BookingHoursShape,
  previewHours: BusinessHours | null | undefined,
  importedHours: BusinessHours | null | undefined
): HoursSource {
  if (normalizeBookingHours(bookingHours)) return "booking";
  if (isHoursEmpty(previewHours)) return "default";
  if (importedHours && JSON.stringify(previewHours) === JSON.stringify(importedHours)) {
    return "google";
  }
  return "custom";
}

/**
 * Parse the semicolon-separated weekday descriptions returned by the
 * Google Places API into the BusinessHours shape stored in previews.hours.
 *
 * Input example:
 *   "Monday: 10:00 AM – 7:00 PM; Tuesday: 10:00 AM – 7:00 PM; Sunday: Closed"
 */
export function parseGoogleHoursString(input: string | null | undefined): BusinessHours {
  if (!input) return {};
  const out: BusinessHours = {};
  const segments = input.split(";").map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const colonIdx = seg.indexOf(":");
    if (colonIdx === -1) continue;
    const day = seg.slice(0, colonIdx).trim();
    const value = seg.slice(colonIdx + 1).trim();
    if (!DAY_ORDER.includes(day as Day)) continue;
    if (/^closed$/i.test(value)) {
      out[day] = { open: "", close: "", closed: true };
      continue;
    }
    // Split on en-dash, em-dash, or hyphen with surrounding spaces.
    const parts = value.split(/\s*[–—-]\s*/);
    if (parts.length >= 2) {
      out[day] = { open: parts[0].trim(), close: parts[1].trim() };
    }
  }
  return out;
}
