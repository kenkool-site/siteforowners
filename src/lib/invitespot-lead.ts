export const EVENT_TYPES = ["birthday", "wedding", "naming", "burial", "anniversary", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type InvitespotLeadStatus = "new" | "contacted" | "archived";

export interface InvitespotLeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  event_type: string;
  rough_date: string | null;
  guest_count: number | null;
  referral_slug: string | null;
  status: InvitespotLeadStatus;
  created_at: string;
}

export type InvitespotLead = {
  name: string;
  email: string;
  phone: string;
  eventType: EventType;
  roughDate: string;
  guestCount: number | null;
  referralSlug: string;
};

export type ParseInvitespotLeadResult =
  | { ok: true; value: InvitespotLead }
  | { ok: false; error: string };

function cleanString(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function cleanGuestCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export function parseInvitespotLead(body: unknown): ParseInvitespotLeadResult {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = cleanString(data.name);
  const email = cleanString(data.email);
  const phone = cleanString(data.phone, 40);
  const eventType = cleanString(data.eventType, 20);
  const roughDate = cleanString(data.roughDate, 120);
  const guestCount = cleanGuestCount(data.guestCount);
  const referralSlug = cleanString(data.referralSlug, 120);

  if (!name) {
    return { ok: false, error: "Your name is required." };
  }
  if (!email && !phone) {
    return { ok: false, error: "An email or phone number is required." };
  }
  if (!isEventType(eventType)) {
    return { ok: false, error: "Let us know what you're planning." };
  }

  return {
    ok: true,
    value: { name, email, phone, eventType, roughDate, guestCount, referralSlug },
  };
}
