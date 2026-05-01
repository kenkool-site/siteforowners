// Pure synthetic-data builder for the preview admin mockup. Seeded by the
// preview slug so the same preview always shows the same numbers — the
// founder doesn't see counts shift on every reload.

import type { ActivityEntry } from "./admin-activity";
import type { VisitStats, SparklineBar } from "./admin-visits";
import type { Rollups } from "./admin-rollups";

// ---- types exposed to consumers --------------------------------------------

export interface MockBooking {
  id: string;
  customer_name: string;
  service_name: string;
  booking_date: string; // ISO date (YYYY-MM-DD)
  booking_time: string; // "10:00 AM"
  duration_minutes: number;
  status: "confirmed" | "pending";
}

export interface MockLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source_page: string | null;
  is_read: boolean;
  created_at: string; // ISO timestamp
}

export interface MockAdminData {
  rollups: Rollups;
  visits: VisitStats;
  monthlyVisits: number;
  activity: ActivityEntry[];
  schedule: MockBooking[];
  leads: MockLead[];
}

interface MockPreviewInput {
  slug: string;
  business_name: string | null;
  business_type?: string | null;
  services?: Array<{ name: string; price?: string; durationMinutes?: number }> | null;
  checkout_mode?: string | null;
}

// ---- determinism -----------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function intBetween(rng: () => number, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

// ---- seed pools ------------------------------------------------------------

const CUSTOMER_NAMES = [
  "Marie K.", "Aaliyah J.", "Jasmine R.", "Tasha B.", "Brianna M.",
  "Destiny L.", "Imani P.", "Zoe W.", "Naomi C.", "Layla F.",
  "Camila G.", "Sofia D.", "Isabella V.", "Valeria T.", "Mariana S.",
  "Amelia H.", "Jada N.", "Kennedy O.", "Rachel A.", "Sarah K.",
  "Crystal R.", "Brittany J.", "Nicole H.", "Ashley B.", "Erika M.",
] as const;

// 4-digit suffix variations (last 4 digits of phone). Area code stays generic.
function genPhone(rng: () => number): string {
  const a = intBetween(rng, 200, 999);
  const b = intBetween(rng, 200, 999);
  const c = intBetween(rng, 1000, 9999);
  return `(${a}) ${b}-${c}`;
}

// Lead messages keyed roughly by business type; falls through to generic.
function leadMessagesFor(businessType: string | null | undefined): string[] {
  const t = (businessType || "").toLowerCase();
  if (t.includes("salon") || t.includes("hair") || t.includes("braid") || t.includes("nail")) {
    return [
      "Hi! Do you take walk-ins on Saturdays? I'd love to come in this weekend.",
      "How long is the wait for a knotless braids appointment? My event is in 2 weeks.",
      "Do you do bridal trials? Getting married in October and looking for a stylist.",
      "Hey, my daughter has a recital next Friday — any availability for a quick style?",
      "What's your cancellation policy? Trying to plan ahead.",
      "Can you do extensions on natural hair? First time getting them done.",
    ];
  }
  if (t.includes("restaurant") || t.includes("food") || t.includes("cafe")) {
    return [
      "Do you cater? I'm hosting 30 people next month.",
      "Hi! Are you open on Memorial Day?",
      "Do you have gluten-free options on the lunch menu?",
      "Can I book a private dining room for a birthday?",
      "Do you do takeout for large orders?",
    ];
  }
  if (t.includes("clean") || t.includes("home") || t.includes("service")) {
    return [
      "Looking for biweekly cleaning. 3 bedroom 2 bath. What's the rate?",
      "Hi, do you do move-out cleans? Need it done by the 28th.",
      "Can I schedule a one-time deep clean before Easter?",
      "Do you bring your own supplies?",
    ];
  }
  return [
    "Hi, I'm interested in your services. Can you give me a call?",
    "Do you have availability this week?",
    "What are your prices? Looking to book soon.",
    "Hey, found you on Google. Want to schedule something for next week.",
  ];
}

// ---- builder ---------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtTime12(hour: number, minute = 0): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function buildMockAdminData(preview: MockPreviewInput): MockAdminData {
  const rng = mulberry32(hashStr(preview.slug));
  const services = (preview.services || []).filter((s) => s?.name?.trim());
  const fallbackService = { name: "Service", durationMinutes: 60 };
  const pickService = () => (services.length > 0 ? pick(rng, services) : fallbackService);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // -------- bookings (today + next 5 days, 6-12 total) --------
  const numBookings = intBetween(rng, 6, 12);
  const schedule: MockBooking[] = [];
  for (let i = 0; i < numBookings; i++) {
    const dayOffset = intBetween(rng, 0, 5);
    const date = new Date(today.getTime() + dayOffset * MS_PER_DAY);
    const weekday = date.getUTCDay();
    if (weekday === 0) continue; // closed Sundays
    const svc = pickService();
    const baseHour = intBetween(rng, 10, weekday === 6 ? 16 : 18);
    const baseMin = pick(rng, [0, 30] as const);
    schedule.push({
      id: `mock-bk-${i}-${preview.slug}`,
      customer_name: pick(rng, CUSTOMER_NAMES),
      service_name: svc.name,
      booking_date: isoDate(date),
      booking_time: fmtTime12(baseHour, baseMin),
      duration_minutes: svc.durationMinutes ?? 60,
      status: rng() < 0.15 ? "pending" : "confirmed",
    });
  }
  // Sort chronologically.
  schedule.sort((a, b) => {
    if (a.booking_date !== b.booking_date) return a.booking_date.localeCompare(b.booking_date);
    return a.booking_time.localeCompare(b.booking_time);
  });

  const todayIso = isoDate(today);
  const sevenDayEnd = isoDate(new Date(today.getTime() + 6 * MS_PER_DAY));
  const bookingsToday = schedule.filter((b) => b.booking_date === todayIso).length;
  const bookingsNext7Days = schedule.filter(
    (b) => b.booking_date >= todayIso && b.booking_date <= sevenDayEnd,
  ).length;

  // -------- leads (3-5) --------
  const leadMessages = leadMessagesFor(preview.business_type);
  const numLeads = intBetween(rng, 3, 5);
  const leads: MockLead[] = [];
  const usedMessages = new Set<number>();
  for (let i = 0; i < numLeads; i++) {
    let msgIdx = intBetween(rng, 0, leadMessages.length - 1);
    let guard = 0;
    while (usedMessages.has(msgIdx) && guard++ < 10) {
      msgIdx = (msgIdx + 1) % leadMessages.length;
    }
    usedMessages.add(msgIdx);
    const ageMs = intBetween(rng, 5 * 60 * 1000, 6 * MS_PER_DAY);
    const at = new Date(Date.now() - ageMs);
    const hasEmail = rng() < 0.6;
    leads.push({
      id: `mock-ld-${i}-${preview.slug}`,
      name: pick(rng, CUSTOMER_NAMES).replace(/\s+\w\.$/, ""), // drop the "K." suffix for leads
      phone: genPhone(rng),
      email: hasEmail ? `customer${intBetween(rng, 1, 99)}@email.com` : null,
      message: leadMessages[msgIdx],
      source_page: pick(rng, ["/", "/services", "/contact", null] as const),
      is_read: i >= 2, // first 2 unread
      created_at: at.toISOString(),
    });
  }
  const unreadLeads = leads.filter((l) => !l.is_read).length;

  // -------- visits (7-day sparkline + this/last week + monthly) --------
  // Pattern: weekday 8-25, weekend bump 30-60.
  const sparkline: SparklineBar[] = [];
  let thisWeek = 0;
  for (let i = 0; i < 7; i++) {
    // Mon=0 .. Sun=6
    const isWeekend = i >= 5;
    const c = isWeekend ? intBetween(rng, 30, 60) : intBetween(rng, 8, 25);
    sparkline.push({ day: `d${i}`, count: c });
    thisWeek += c;
  }
  const lastWeek = Math.max(1, Math.round(thisWeek * (0.7 + rng() * 0.5)));
  const trendPct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  const monthlyVisits = thisWeek * 4 + intBetween(rng, 20, 80);

  const visits: VisitStats = { thisWeek, lastWeek, trendPct, sparkline };

  // -------- recent activity (5 entries, mixed) --------
  const activity: ActivityEntry[] = [];
  // First 2 leads → activity (recent + unread)
  for (let i = 0; i < Math.min(2, leads.length); i++) {
    const l = leads[i];
    activity.push({
      key: `act-ld-${l.id}`,
      kind: "lead",
      title: `New lead from ${l.name}`,
      subtitle: (l.message || "").slice(0, 60) + ((l.message?.length || 0) > 60 ? "…" : ""),
      at: l.created_at,
    });
  }
  // 3 most recent bookings → activity
  const bookingsByRecency = [...schedule].slice(-3).reverse();
  for (const b of bookingsByRecency) {
    const ageMs = intBetween(rng, 30 * 60 * 1000, 3 * MS_PER_DAY);
    activity.push({
      key: `act-bk-${b.id}`,
      kind: "booking",
      title: `${b.customer_name} booked ${b.service_name}`,
      subtitle: `${b.booking_date} · ${b.booking_time}`,
      at: new Date(Date.now() - ageMs).toISOString(),
    });
  }
  // Sort by at desc.
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  const newOrders = preview.checkout_mode === "pickup" ? intBetween(rng, 0, 4) : 0;

  const rollups: Rollups = {
    newOrders,
    bookingsToday,
    unreadLeads,
    bookingsNext7Days,
  };

  return { rollups, visits, monthlyVisits, activity, schedule, leads };
}
