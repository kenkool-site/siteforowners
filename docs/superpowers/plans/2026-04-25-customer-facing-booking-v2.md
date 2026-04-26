# Customer-Facing Booking v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-service multi-hour booking durations and a dual booking entry (in-site primary + external "quiet" link), gated by a per-tenant `booking_mode`.

**Architecture:** Pure availability/conflict logic isolated in a new `src/lib/availability.ts` module (unit-testable, no I/O). Database gains `tenants.booking_mode`, `bookings.duration_minutes`, and `previews.services[*].duration_minutes`. UI components (`TemplateBooking`, the 5 service templates, `SiteEditor`) thread the new `bookingMode` value and call into the availability module.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (Postgres + JSONB), Tailwind, Framer Motion, `node:test` + `tsx` for tests.

**Spec:** [docs/superpowers/specs/2026-04-25-customer-facing-booking-v2-design.md](../specs/2026-04-25-customer-facing-booking-v2-design.md)

**Test command pattern:** `npx tsx --test src/lib/<file>.test.ts`

**Build/typecheck command:** `npm run build` (Next.js handles tsc)

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/015_service_duration_and_booking_mode.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/015_service_duration_and_booking_mode.sql`:

```sql
-- Adds per-service duration support and per-tenant booking_mode for the
-- dual booking entry (in-site primary + external quiet link).

-- 1. tenants.booking_mode (3-state: in_site_only | external_only | both)
ALTER TABLE tenants
  ADD COLUMN booking_mode text NOT NULL DEFAULT 'in_site_only'
  CHECK (booking_mode IN ('in_site_only', 'external_only', 'both'));

-- Backfill: tenants currently using an external provider keep today's
-- behavior. booking_url lives at previews.generated_copy ->> 'booking_url',
-- joined to tenants via preview_slug.
UPDATE tenants t
   SET booking_mode = 'external_only'
  FROM previews p
 WHERE p.slug = t.preview_slug
   AND COALESCE(p.generated_copy ->> 'booking_url', '') <> '';

-- 2. bookings.duration_minutes (immutable per-booking duration)
ALTER TABLE bookings
  ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60;

-- 3. previews.services[*].duration_minutes backfill — every service item
-- without a duration_minutes field gets 60.
UPDATE previews
   SET services = (
     SELECT jsonb_agg(
       CASE
         WHEN item ? 'duration_minutes' THEN item
         ELSE item || jsonb_build_object('duration_minutes', 60)
       END
     )
     FROM jsonb_array_elements(services) AS item
   )
 WHERE jsonb_typeof(services) = 'array'
   AND jsonb_array_length(services) > 0;
```

- [ ] **Step 2: Apply migration locally**

Run: `supabase db push` (or `supabase migration up` depending on local setup)
Expected: migration `015_service_duration_and_booking_mode.sql` runs without error.

- [ ] **Step 3: Verify schema**

Run:
```bash
psql "$DATABASE_URL" -c "\d tenants" | grep booking_mode
psql "$DATABASE_URL" -c "\d bookings" | grep duration_minutes
psql "$DATABASE_URL" -c "SELECT slug, jsonb_array_length(services) FROM previews WHERE jsonb_typeof(services)='array' AND jsonb_array_length(services) > 0 LIMIT 1;"
psql "$DATABASE_URL" -c "SELECT slug, services->0->>'duration_minutes' FROM previews WHERE jsonb_typeof(services)='array' AND jsonb_array_length(services) > 0 LIMIT 3;"
```
Expected: `booking_mode` column present; `duration_minutes` column present; `duration_minutes` field present on at least one sample service.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_service_duration_and_booking_mode.sql
git commit -m "feat(db): add booking_mode + per-service/per-booking durations"
```

---

## Task 2: TypeScript type updates (compile foundation)

**Files:**
- Modify: `src/lib/admin-auth.ts:80-92`
- Modify: `src/lib/admin-tenant.ts:13-18`
- Modify: `src/lib/admin-auth.ts:99-134`
- Modify: `src/lib/admin-bookings.ts:41-49` and the SELECT clauses in `getTodayBookings`/`getUpcomingBookings`

- [ ] **Step 1: Extend `AdminTenant` type**

In `src/lib/admin-auth.ts`, replace the `AdminTenant` type block at line 80 with:

```ts
export type BookingMode = 'in_site_only' | 'external_only' | 'both';

export type AdminTenant = {
  id: string;
  business_name: string;
  owner_name: string;
  preview_slug: string | null;
  email: string | null;
  admin_email: string | null;
  admin_pin_hash: string | null;
  subscription_status: string;
  site_published: boolean;
  booking_tool: string | null;
  checkout_mode: string | null;
  booking_mode: BookingMode;
};
```

- [ ] **Step 2: Add `booking_mode` to all SELECT clauses for tenants**

Find every Supabase `.from("tenants").select(...)` call and add `booking_mode` to the column list. Known sites:

- `src/lib/admin-auth.ts:106` — `resolveTenantByHost` (custom domain branch)
- `src/lib/admin-auth.ts:125` — `resolveTenantByHost` (subdomain branch)
- `src/lib/admin-tenant.ts:15` — `loadTenantBySlug`

Run `grep -rn '\.from("tenants")\.select' src/` to confirm none are missed. Append `, booking_mode` to each SELECT.

- [ ] **Step 3: Extend `BookingRow` type and reads**

In `src/lib/admin-bookings.ts`, update the `BookingRow` type (line 41) and both SELECT clauses (the existing `getUpcomingBookings` at ~line 73 and the corresponding `getTodayBookings`):

```ts
export type BookingRow = {
  id: string;
  booking_date: string;
  booking_time: string;
  duration_minutes: number;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  status: string;
};
```

Add `duration_minutes` to the SELECT column list in both functions:
```ts
.select("id, booking_date, booking_time, duration_minutes, customer_name, customer_phone, service_name, status")
```

- [ ] **Step 4: Update the `b()` helper in the existing test**

In `src/lib/admin-bookings.test.ts`, the `b()` helper builds a `BookingRow` and is now missing `duration_minutes`. Add it:

```ts
function b(id: string, date: string, time = "10:00 AM"): BookingRow {
  return {
    id,
    booking_date: date,
    booking_time: time,
    duration_minutes: 60,
    customer_name: "Cust",
    customer_phone: "555",
    service_name: "Svc",
    status: "confirmed",
  };
}
```

- [ ] **Step 5: Typecheck and existing tests pass**

Run:
```bash
npm run build
npx tsx --test src/lib/admin-bookings.test.ts
```
Expected: build succeeds; existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-auth.ts src/lib/admin-tenant.ts src/lib/admin-bookings.ts src/lib/admin-bookings.test.ts
git commit -m "feat(types): add booking_mode and duration_minutes to tenant/booking types"
```

---

## Task 3: `availability.ts` — types + conflict detection (TDD)

**Files:**
- Create: `src/lib/availability.ts`
- Create: `src/lib/availability.test.ts`

- [ ] **Step 1: Write the failing test for `bookingsOverlap`**

Create `src/lib/availability.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsOverlap, type BookingInterval } from "./availability";

function bk(startHour: number, durationHours: number): BookingInterval {
  return { startMinutes: startHour * 60, durationMinutes: durationHours * 60 };
}

test("bookingsOverlap: non-touching intervals do not overlap", () => {
  assert.equal(bookingsOverlap(bk(9, 1), bk(11, 1)), false);
});

test("bookingsOverlap: touching intervals (a ends when b starts) do not overlap", () => {
  // half-open intervals: [9, 10) and [10, 11) do not overlap
  assert.equal(bookingsOverlap(bk(9, 1), bk(10, 1)), false);
});

test("bookingsOverlap: overlapping intervals are detected", () => {
  // [9, 12) overlaps [10, 11)
  assert.equal(bookingsOverlap(bk(9, 3), bk(10, 1)), true);
});

test("bookingsOverlap: nested interval is detected", () => {
  // [10, 13) contains [11, 12)
  assert.equal(bookingsOverlap(bk(10, 3), bk(11, 1)), true);
});

test("bookingsOverlap: identical intervals overlap", () => {
  assert.equal(bookingsOverlap(bk(10, 1), bk(10, 1)), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: FAIL — `Cannot find module './availability'` or similar.

- [ ] **Step 3: Implement minimal `availability.ts`**

Create `src/lib/availability.ts`:

```ts
export type BookingInterval = {
  startMinutes: number;   // minutes since midnight
  durationMinutes: number;
};

export function bookingsOverlap(a: BookingInterval, b: BookingInterval): boolean {
  const aEnd = a.startMinutes + a.durationMinutes;
  const bEnd = b.startMinutes + b.durationMinutes;
  return a.startMinutes < bEnd && b.startMinutes < aEnd;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Add failing test for `wouldExceedCapacity` (max_per_slot)**

Append to `src/lib/availability.test.ts`:

```ts
import { wouldExceedCapacity } from "./availability";

test("wouldExceedCapacity: empty existing returns false for any candidate", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [], 1), false);
});

test("wouldExceedCapacity: max_per_slot=1, one overlapping booking → exceeds", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(10, 1)], 1), true);
});

test("wouldExceedCapacity: max_per_slot=2, one overlapping booking → ok", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(10, 1)], 2), false);
});

test("wouldExceedCapacity: max_per_slot=2, two overlapping bookings → exceeds", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(10, 1), bk(10, 1)], 2), true);
});

test("wouldExceedCapacity: non-overlapping existing booking is ignored", () => {
  assert.equal(wouldExceedCapacity(bk(10, 1), [bk(12, 1)], 1), false);
});

test("wouldExceedCapacity: 3h candidate blocked by single 1h existing in middle", () => {
  // candidate [10,13), existing [11,12). Hour 11 has 1 overlap, max=1 → exceeds.
  assert.equal(wouldExceedCapacity(bk(10, 3), [bk(11, 1)], 1), true);
});
```

- [ ] **Step 6: Run, watch them fail**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: import error / function undefined.

- [ ] **Step 7: Implement `wouldExceedCapacity`**

Append to `src/lib/availability.ts`:

```ts
/**
 * Returns true iff inserting `candidate` would push the count of
 * concurrent bookings for any minute it spans above `maxPerSlot`.
 */
export function wouldExceedCapacity(
  candidate: BookingInterval,
  existing: BookingInterval[],
  maxPerSlot: number
): boolean {
  const overlaps = existing.filter((b) => bookingsOverlap(candidate, b));
  // For the half-open hour-grid v1 we treat any overlap as occupying the
  // same slot; so the question becomes whether the count of overlapping
  // bookings already meets capacity.
  return overlaps.length >= maxPerSlot;
}
```

- [ ] **Step 8: Run, all green**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: 11 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/availability.ts src/lib/availability.test.ts
git commit -m "feat(availability): add booking interval overlap + capacity check"
```

---

## Task 4: `availability.ts` — `computeAvailableStarts` (TDD)

**Files:**
- Modify: `src/lib/availability.ts`
- Modify: `src/lib/availability.test.ts`

- [ ] **Step 1: Write failing tests for happy path + edge cases**

Append to `src/lib/availability.test.ts`:

```ts
import { computeAvailableStarts, type WorkingHours } from "./availability";

const FULL_WEEK: WorkingHours = {
  Sunday: null,
  Monday: { openHour: 9, closeHour: 17 },
  Tuesday: { openHour: 9, closeHour: 17 },
  Wednesday: { openHour: 9, closeHour: 17 },
  Thursday: { openHour: 9, closeHour: 17 },
  Friday: { openHour: 9, closeHour: 17 },
  Saturday: { openHour: 10, closeHour: 14 },
};

test("computeAvailableStarts: 1h service, no bookings, weekday → all hours", () => {
  // Monday, Apr 27 2026
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: 3h service shrinks the window from the end", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 180,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  // Last valid start is 14 (14+3 = 17 = close)
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14]);
});

test("computeAvailableStarts: closed weekday returns []", () => {
  // Sunday Apr 26 2026
  const starts = computeAvailableStarts({
    date: "2026-04-26",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, []);
});

test("computeAvailableStarts: blocked date returns []", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: ["2026-04-27"],
  });
  assert.deepEqual(starts, []);
});

test("computeAvailableStarts: existing 1h booking removes only its hour", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [{ startMinutes: 11 * 60, durationMinutes: 60 }],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 10, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: 3h service blocked by 1h booking in middle of day", () => {
  // Existing booking [12,13). 3h service can start at 9, 13, 14 only.
  // 10+3=13 overlaps; 11+3=14 overlaps; 12+3=15 overlaps.
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 180,
    workingHours: FULL_WEEK,
    existingBookings: [{ startMinutes: 12 * 60, durationMinutes: 60 }],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [9, 13, 14]);
});

test("computeAvailableStarts: max_per_slot=2 doubles capacity", () => {
  const starts = computeAvailableStarts({
    date: "2026-04-27",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [{ startMinutes: 11 * 60, durationMinutes: 60 }],
    maxPerSlot: 2,
    blockedDates: [],
  });
  // hour 11 has 1 of 2 used, still bookable
  assert.deepEqual(starts, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test("computeAvailableStarts: service longer than working day returns []", () => {
  // Saturday 10-14 = 4h window; 5h service does not fit.
  const starts = computeAvailableStarts({
    date: "2026-04-25",
    durationMinutes: 300,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, []);
});

test("computeAvailableStarts: Saturday short hours", () => {
  // Saturday 10-14 = 4h window; 1h service.
  const starts = computeAvailableStarts({
    date: "2026-04-25",
    durationMinutes: 60,
    workingHours: FULL_WEEK,
    existingBookings: [],
    maxPerSlot: 1,
    blockedDates: [],
  });
  assert.deepEqual(starts, [10, 11, 12, 13]);
});
```

- [ ] **Step 2: Run, watch them fail**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `computeAvailableStarts`**

Append to `src/lib/availability.ts`:

```ts
export type DayHours = { openHour: number; closeHour: number };
export type WorkingHours = Record<string, DayHours | null>;

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export type AvailabilityInput = {
  /** ISO date "YYYY-MM-DD" */
  date: string;
  durationMinutes: number;
  workingHours: WorkingHours;
  existingBookings: BookingInterval[];
  maxPerSlot: number;
  blockedDates: string[];
};

/**
 * Returns the list of valid start hours (0–23) for a service of the
 * given duration on the given date, considering working hours, blocked
 * dates, existing bookings, and per-slot capacity.
 *
 * v1 assumes 60-minute granularity (durations are whole hours, starts
 * land on the hour). Stays in this module so any future granularity
 * change happens in one place.
 */
export function computeAvailableStarts(input: AvailabilityInput): number[] {
  const {
    date,
    durationMinutes,
    workingHours,
    existingBookings,
    maxPerSlot,
    blockedDates,
  } = input;

  if (blockedDates.includes(date)) return [];

  // Parse YYYY-MM-DD as UTC midnight for stable weekday lookup.
  const parts = date.split("-").map(Number);
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const weekdayName = WEEKDAY_NAMES[utc.getUTCDay()];
  const day = workingHours[weekdayName];
  if (!day) return [];

  const durationHours = durationMinutes / 60;
  const result: number[] = [];
  // Last valid start hour is closeHour - durationHours.
  for (let h = day.openHour; h + durationHours <= day.closeHour; h++) {
    const candidate: BookingInterval = {
      startMinutes: h * 60,
      durationMinutes,
    };
    if (!wouldExceedCapacity(candidate, existingBookings, maxPerSlot)) {
      result.push(h);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run, all green**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: 20 tests pass (11 from Task 3 + 9 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/availability.ts src/lib/availability.test.ts
git commit -m "feat(availability): add computeAvailableStarts for multi-hour services"
```

---

## Task 5: Add a parser/formatter for "10:00 AM" booking_time strings

**Files:**
- Modify: `src/lib/availability.ts`
- Modify: `src/lib/availability.test.ts`

The DB stores `booking_time` as text like `"10:00 AM"`. The conflict checker and `.ics` need numeric minutes-since-midnight. We extract this into pure helpers in the same module so all string parsing lives in one place.

- [ ] **Step 1: Write failing tests for `parseBookingTime` and `formatTimeRange`**

Append to `src/lib/availability.test.ts`:

```ts
import { parseBookingTime, formatTimeRange } from "./availability";

test("parseBookingTime: '10:00 AM' → 600 (10 * 60)", () => {
  assert.equal(parseBookingTime("10:00 AM"), 600);
});

test("parseBookingTime: '12:00 PM' (noon) → 720", () => {
  assert.equal(parseBookingTime("12:00 PM"), 720);
});

test("parseBookingTime: '12:00 AM' (midnight) → 0", () => {
  assert.equal(parseBookingTime("12:00 AM"), 0);
});

test("parseBookingTime: '1:30 PM' → 13*60 + 30 = 810", () => {
  assert.equal(parseBookingTime("1:30 PM"), 810);
});

test("formatTimeRange: 10:00 AM, 60min → '10:00 AM – 11:00 AM'", () => {
  assert.equal(formatTimeRange("10:00 AM", 60), "10:00 AM – 11:00 AM");
});

test("formatTimeRange: 10:00 AM, 180min → '10:00 AM – 1:00 PM'", () => {
  assert.equal(formatTimeRange("10:00 AM", 180), "10:00 AM – 1:00 PM");
});
```

- [ ] **Step 2: Run, fail**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: import error.

- [ ] **Step 3: Implement parser/formatter**

Append to `src/lib/availability.ts`:

```ts
/** Parse a "10:00 AM" / "1:30 PM" string into minutes since midnight. */
export function parseBookingTime(s: string): number {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) throw new Error(`invalid booking_time: "${s}"`);
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const period = m[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (period === "PM") hour += 12;
  return hour * 60 + minute;
}

/** Format minutes-since-midnight back into "1:30 PM". */
function formatMinutes(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

export function formatTimeRange(startStr: string, durationMinutes: number): string {
  const start = parseBookingTime(startStr);
  return `${formatMinutes(start)} – ${formatMinutes(start + durationMinutes)}`;
}
```

- [ ] **Step 4: Run, green**

Run: `npx tsx --test src/lib/availability.test.ts`
Expected: 26 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/availability.ts src/lib/availability.test.ts
git commit -m "feat(availability): add booking_time parser + range formatter"
```

---

## Task 6: Rewrite `getBookingMode` with 3-state return

**Files:**
- Modify: `src/lib/admin-bookings.ts:4-39`
- Modify: every call site of `getBookingMode` and `BookingMode.external`

The new `BookingMode` type is a discriminated union on `mode`, sourcing the in-site/external decision from `tenants.booking_mode` and the URL/provider from `previews.generated_copy.booking_url`.

- [ ] **Step 1: Replace the `BookingMode` type and `getBookingMode` body**

In `src/lib/admin-bookings.ts`, replace lines 4-39 with:

```ts
export type BookingMode =
  | { mode: 'in_site_only' }
  | { mode: 'external_only'; url: string; providerName: string }
  | { mode: 'both'; url: string; providerName: string };

function detectProvider(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("acuityscheduling.com")) return "Acuity";
  if (lower.includes("booksy")) return "Booksy";
  if (lower.includes("vagaro")) return "Vagaro";
  if (lower.includes("squareup.com") || lower.includes("square.site")) return "Square";
  if (lower.includes("calendly")) return "Calendly";
  return "your booking provider";
}

/**
 * Returns the tenant's booking entry mode, joining `tenants.booking_mode`
 * (the policy) with `previews.generated_copy.booking_url` (the URL).
 *
 * If the policy says external/both but no URL is configured (transient
 * inconsistency), we degrade to in_site_only so the public site always
 * shows a working booking entry.
 */
export async function getBookingMode(previewSlug: string | null): Promise<BookingMode> {
  if (!previewSlug) return { mode: 'in_site_only' };
  noStore();
  const supabase = createAdminClient();

  const [{ data: tenant }, { data: preview }] = await Promise.all([
    supabase
      .from("tenants")
      .select("booking_mode")
      .eq("preview_slug", previewSlug)
      .maybeSingle(),
    supabase
      .from("previews")
      .select("generated_copy")
      .eq("slug", previewSlug)
      .maybeSingle(),
  ]);

  const bookingMode = (tenant?.booking_mode as string | undefined) ?? 'in_site_only';
  const gc = preview?.generated_copy as Record<string, unknown> | null;
  const bookingUrl = typeof gc?.booking_url === "string" && gc.booking_url.trim().length > 0
    ? (gc.booking_url as string)
    : null;

  if (bookingMode === 'in_site_only') return { mode: 'in_site_only' };
  if (!bookingUrl) return { mode: 'in_site_only' };  // defensive
  if (bookingMode === 'external_only') {
    return { mode: 'external_only', url: bookingUrl, providerName: detectProvider(bookingUrl) };
  }
  return { mode: 'both', url: bookingUrl, providerName: detectProvider(bookingUrl) };
}
```

- [ ] **Step 2: Update every call site**

The old `external: boolean` discriminator is gone. Run:

```bash
grep -rn "getBookingMode\|\.external" src/app src/components 2>/dev/null
```

Known call sites (from spec):
- `src/app/site/[slug]/admin/schedule/page.tsx:35-36` — change `if (bookingMode.external)` to `if (bookingMode.mode === 'external_only')`. Replace any `bookingMode.providerName`/`bookingMode.url` access (still valid only inside the `external_only`/`both` branch).
- `src/app/site/[slug]/admin/page.tsx` (admin home, per memory note 1950) — same pattern. Find the gate and switch to `mode === 'external_only'`.

For each call site, narrow on `mode` and only access `url`/`providerName` inside the appropriate branch.

- [ ] **Step 3: Build to typecheck**

Run: `npm run build`
Expected: build succeeds. If a call site is missed, the type narrowing error tells you exactly where.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin-bookings.ts src/app/site/
git commit -m "feat(booking): switch getBookingMode to 3-state discriminated union"
```

---

## Task 7: `/api/create-booking` — multi-hour conflict + .ics duration

**Files:**
- Modify: `src/app/api/create-booking/route.ts:9-166`

- [ ] **Step 1: Update the request body and conflict check**

Replace the body destructure (line 11-22) with:

```ts
const body = await request.json();
const {
  preview_slug,
  service_name,
  service_price,
  duration_minutes,    // NEW
  booking_date,
  booking_time,
  customer_name,
  customer_phone,
  customer_email,
  customer_notes,
} = body;

if (!preview_slug || !service_name || !booking_date || !booking_time || !customer_name || !customer_phone) {
  return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
}

const durationMinutes = Number.isInteger(duration_minutes) ? Number(duration_minutes) : 60;
if (durationMinutes < 60 || durationMinutes > 480 || durationMinutes % 60 !== 0) {
  return NextResponse.json(
    { error: "duration_minutes must be a whole number of hours between 1 and 8" },
    { status: 400 }
  );
}
```

- [ ] **Step 2: Replace the conflict check with the multi-hour version**

Replace the existing conflict block (line 50-74) with:

```ts
import { wouldExceedCapacity, parseBookingTime } from "@/lib/availability";
// ^ Add this import at the top of the file with the other imports.

// ...inside POST...
if (tenantId) {
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("max_per_slot")
    .eq("tenant_id", tenantId)
    .single();

  const maxPerSlot = settings?.max_per_slot || 1;

  const { data: sameDay } = await supabase
    .from("bookings")
    .select("booking_time, duration_minutes")
    .eq("tenant_id", tenantId)
    .eq("booking_date", booking_date)
    .eq("status", "confirmed");

  const candidate = {
    startMinutes: parseBookingTime(booking_time),
    durationMinutes,
  };
  const existing = (sameDay ?? []).map((r) => ({
    startMinutes: parseBookingTime(r.booking_time as string),
    durationMinutes: (r.duration_minutes as number) ?? 60,
  }));

  if (wouldExceedCapacity(candidate, existing, maxPerSlot)) {
    return NextResponse.json(
      { error: "This time slot is no longer available. Please choose another time." },
      { status: 409 }
    );
  }
}
```

- [ ] **Step 3: Persist `duration_minutes` on the new booking**

Update the `.insert(...)` block (line 78-92):

```ts
const { data: booking, error: insertError } = await supabase
  .from("bookings")
  .insert({
    tenant_id: tenantId || null,
    preview_slug,
    service_name,
    service_price: service_price || null,
    duration_minutes: durationMinutes,
    booking_date,
    booking_time,
    customer_name,
    customer_phone,
    customer_email: customer_email || null,
    customer_notes: customer_notes || null,
  })
  .select("id")
  .single();
```

- [ ] **Step 4: Use `durationMinutes` for the .ics end time**

Replace the .ics duration block (line 99-117) with:

```ts
const dateObj = new Date(booking_date + "T00:00:00");
const { hours, minutes } = parseTime(booking_time);
const startDate = new Date(dateObj);
startDate.setHours(hours, minutes, 0);
const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
```

The previous global-fallback lookup of `booking_settings.slot_duration` is no longer needed and should be removed.

- [ ] **Step 5: Manual smoke**

Run the dev server (`npm run dev`) and `curl` the endpoint:

```bash
curl -s -X POST http://localhost:3000/api/create-booking \
  -H "Content-Type: application/json" \
  -d '{
    "preview_slug": "<an-existing-preview-slug>",
    "service_name": "Box Braids",
    "service_price": "$180",
    "duration_minutes": 180,
    "booking_date": "2026-05-04",
    "booking_time": "10:00 AM",
    "customer_name": "Test",
    "customer_phone": "5550100"
  }'
```

Expected: `{"success":true,"booking_id":"..."}`. Verify in DB that `duration_minutes = 180` on the new row.

Now POST again with `booking_time: "11:00 AM"` (overlapping). Expected: `409` with the slot-unavailable error.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/create-booking/route.ts
git commit -m "feat(api): support multi-hour bookings with overlap-aware conflict check"
```

---

## Task 8: `TemplateBooking` — service step + duration display + time picker integration

**Files:**
- Modify: `src/components/templates/TemplateBooking.tsx`

The file is 1000 lines; we're touching ~6 spots. Read [TemplateBooking.tsx](../../../src/components/templates/TemplateBooking.tsx) before editing.

- [ ] **Step 1: Extend `SimpleService` and `MockBookingCalendar` props with duration**

In `src/components/templates/TemplateBooking.tsx`, update the `SimpleService` type (line 29):

```ts
interface SimpleService {
  name: string;
  price: string;
  durationMinutes?: number;  // defaults to 60 if absent
}
```

Update the `MockBookingCalendar` props type (line 99) so it can receive `existingBookings`, `workingHours`, `maxPerSlot`, and `blockedDates`. Add new optional props:

```ts
function MockBookingCalendar({
  services,
  colors,
  businessName,
  onClose,
  workingHours,
  blockedDates,
  maxPerSlot,
  existingBookingsByDate,
}: {
  services: SimpleService[];
  colors: ThemeColors;
  businessName: string;
  onClose: () => void;
  workingHours: import("@/lib/availability").WorkingHours;
  blockedDates: string[];
  maxPerSlot: number;
  /** Map of "YYYY-MM-DD" → confirmed bookings on that date */
  existingBookingsByDate: Record<string, { startMinutes: number; durationMinutes: number }[]>;
}) {
```

- [ ] **Step 2: Replace the mock `generateTimeSlots` call with `computeAvailableStarts`**

Find the call site of `generateTimeSlots(selectedDate)` inside `MockBookingCalendar`. Replace it with:

```ts
import { computeAvailableStarts, formatTimeRange } from "@/lib/availability";

// Inside the time step:
const isoDate = selectedDate
  ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
  : null;

const startHours = isoDate
  ? computeAvailableStarts({
      date: isoDate,
      durationMinutes: selectedService?.durationMinutes ?? 60,
      workingHours,
      existingBookings: existingBookingsByDate[isoDate] ?? [],
      maxPerSlot,
      blockedDates,
    })
  : [];

const slots = startHours.map((h) => {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
});
```

The existing `slots.map(...)` rendering loop stays the same.

Then **delete** the `generateTimeSlots` helper (lines 78-94) — it is no longer used.

- [ ] **Step 3: Show duration on service cards**

In the service-selection step's render loop, find the service card (in `MockBookingCalendar`'s JSX where each service is rendered) and add a duration label next to the price:

```tsx
<div className="flex items-baseline gap-2">
  <span>{service.name}</span>
  <span className="text-sm opacity-60">
    {(service.durationMinutes ?? 60) / 60}h · {service.price}
  </span>
</div>
```

Match the existing surrounding markup; this is illustrative.

- [ ] **Step 4: Show full time range on confirm step**

In the confirm step, where `selectedTime` is displayed, replace it with a range:

```tsx
<div>{formatTimeRange(selectedTime, selectedService?.durationMinutes ?? 60)}</div>
```

- [ ] **Step 5: Pass `duration_minutes` in the POST body**

Find the `fetch("/api/create-booking", ...)` call inside the booking submit handler. Add `duration_minutes` to the body:

```ts
body: JSON.stringify({
  preview_slug: previewSlug,
  service_name: selectedService.name,
  service_price: selectedService.price,
  duration_minutes: selectedService.durationMinutes ?? 60,
  booking_date,
  booking_time,
  customer_name,
  customer_phone,
  customer_email,
  customer_notes,
}),
```

- [ ] **Step 6: Build to typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/components/templates/TemplateBooking.tsx
git commit -m "feat(booking-ui): show service duration, use availability for time slots"
```

---

## Task 9: `TemplateBooking` — dual-mode entry CTA (Layout A)

**Files:**
- Modify: `src/components/templates/TemplateBooking.tsx`

- [ ] **Step 1: Add `bookingMode` to `TemplateBookingProps`**

Update the `TemplateBookingProps` interface (line 34):

```ts
interface TemplateBookingProps {
  title?: string;
  subtitle?: string;
  bookingUrl?: string;
  phone?: string;
  colors: ThemeColors;
  bookingCategories?: BookingCategory[];
  services?: SimpleService[];
  businessName?: string;
  previewSlug?: string;
  isLive?: boolean;
  onSelectService?: (deepLinkUrl: string) => void;
  /** v2: drives the dual-mode entry CTA. Defaults to legacy behavior. */
  bookingMode?:
    | { mode: 'in_site_only' }
    | { mode: 'external_only'; url: string; providerName: string }
    | { mode: 'both'; url: string; providerName: string };
}
```

- [ ] **Step 2: Branch the entry CTA on `bookingMode`**

Find the existing entry-CTA render (the section near line 856-947 that branches on `bookingUrl` / `canEmbed`). Replace it with the three-mode rendering:

```tsx
const mode = bookingMode?.mode ?? (bookingUrl ? 'external_only' : 'in_site_only');

if (mode === 'external_only') {
  // Today's behavior. Render the embed/redirect using bookingUrl. Keep
  // the existing markup from before — just gated on this branch.
}

if (mode === 'in_site_only') {
  return (
    <button
      type="button"
      onClick={() => setShowCalendar(true)}
      style={{ background: colors.primary }}
      className="block w-full text-center text-white font-semibold rounded-xl px-6 py-4 shadow-md"
    >
      Book instantly on this website →
    </button>
  );
}

// mode === 'both' — Layout A: solid primary + quiet underlined link
return (
  <div>
    <button
      type="button"
      onClick={() => setShowCalendar(true)}
      style={{ background: colors.primary }}
      className="block w-full text-center text-white font-semibold rounded-xl px-6 py-4 shadow-md"
    >
      Book instantly on this website →
    </button>
    <p className="text-center text-xs text-gray-500 mt-3">
      Already using {bookingMode!.providerName}?{" "}
      <a
        href={bookingMode!.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        style={{ color: colors.primary }}
      >
        You can still book there ↗
      </a>
    </p>
  </div>
);
```

The exact JSX should match the existing component's wrapper. The point is: three branches, each with the right markup.

- [ ] **Step 3: Build to typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/templates/TemplateBooking.tsx
git commit -m "feat(booking-ui): render dual-mode entry CTA with quiet external link"
```

---

## Task 10: Per-service Book buttons branch on `bookingMode` (5 files)

**Files:**
- Modify: `src/components/templates/services/BoldServices.tsx`
- Modify: `src/components/templates/services/VibrantServices.tsx`
- Modify: `src/components/templates/services/ClassicServices.tsx`
- Modify: `src/components/templates/services/ElegantServices.tsx`
- Modify: `src/components/templates/services/WarmServices.tsx`

Each of the 5 service templates today calls `onSelectService(deepLinkUrl)` (or opens a new tab). With `bookingMode`, the per-service Book button should:
- `in_site_only` or `both`: open the in-site modal (call `onSelectService`)
- `external_only`: open the service's `bookingDeepLink` directly (today's external-tab behavior)

- [ ] **Step 1: Extend the `ServicesProps` type in each of the 5 files**

In each of `Bold/Vibrant/Classic/Elegant/WarmServices.tsx`, update the `ServicesProps` interface:

```ts
type Mode = 'in_site_only' | 'external_only' | 'both';

interface ServicesProps {
  services: { name: string; price: string; description?: string; bookingDeepLink?: string; durationMinutes?: number }[];
  colors: ThemeColors;
  onSelectService?: (deepLinkUrl: string) => void;
  bookingMode?: Mode;  // defaults to 'in_site_only' downstream
}
```

- [ ] **Step 2: Branch the per-service Book button**

In each file, find the service-card Book button. Replace its `onClick` with the branching logic:

```tsx
onClick={() => {
  const m = bookingMode ?? 'in_site_only';
  if (m === 'external_only') {
    if (service.bookingDeepLink) {
      window.open(service.bookingDeepLink, '_blank', 'noopener,noreferrer');
    }
    return;
  }
  // in_site_only OR both → open in-site modal
  onSelectService?.(service.bookingDeepLink ?? '');
}}
```

Apply the same change in all 5 files. Do not factor into a shared helper for v1 (services components have diverged style/markup).

- [ ] **Step 3: Optional — show duration on each service card**

If the existing service-card markup has space, add `{(service.durationMinutes ?? 60) / 60}h` next to the price. Match the existing typography. Skip if the layout doesn't accommodate it; this is also covered in TemplateBooking. Do not block this task on it.

- [ ] **Step 4: Build to typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/templates/services/
git commit -m "feat(services-ui): branch per-service Book button on booking_mode"
```

---

## Task 11: `TemplateOrchestrator` — wire `bookingMode` through

**Files:**
- Modify: `src/components/templates/TemplateOrchestrator.tsx`

`TemplateOrchestrator` currently receives the rendered preview `data` and threads `data.booking_url` through. We add the policy: read `tenant.booking_mode` (passed in from the page) and pass it down.

- [ ] **Step 1: Find and read where the orchestrator gets `data`**

Inspect [TemplateOrchestrator.tsx](../../../src/components/templates/TemplateOrchestrator.tsx) around line 294 where `<TemplateBooking>` is rendered, and around lines 339-409 where the per-template hero/services blocks are rendered.

- [ ] **Step 2: Add a `bookingMode` prop on the orchestrator**

```ts
interface TemplateOrchestratorProps {
  // ...existing fields...
  bookingMode?: 'in_site_only' | 'external_only' | 'both';
}

export function TemplateOrchestrator({ /* ...existing... */, bookingMode = 'in_site_only' }: TemplateOrchestratorProps) {
```

- [ ] **Step 3: Build the discriminated `bookingMode` value to pass to `TemplateBooking`**

```ts
import { detectProvider } from "@/lib/admin-bookings"; // or inline if not exported
// (If detectProvider is not exported, copy the small switch — but prefer exporting it.)

const bookingModeProp =
  bookingMode === 'in_site_only' || !data.booking_url
    ? { mode: 'in_site_only' as const }
    : bookingMode === 'external_only'
    ? { mode: 'external_only' as const, url: data.booking_url, providerName: detectProvider(data.booking_url) }
    : { mode: 'both' as const, url: data.booking_url, providerName: detectProvider(data.booking_url) };
```

If `detectProvider` is not exported from `admin-bookings.ts`, export it (single keyword: `export function detectProvider`).

- [ ] **Step 4: Pass `bookingModeProp` to `TemplateBooking`**

Update the `<TemplateBooking ... />` render around line 294:

```tsx
<TemplateBooking
  // ...existing props...
  bookingUrl={data.booking_url}
  bookingMode={bookingModeProp}
/>
```

- [ ] **Step 5: Pass `bookingMode` (the simple string) to each services component**

For Bold/Vibrant/Classic/Elegant/WarmServices wherever they're rendered in this file, add `bookingMode={bookingMode}`. The services components take the raw `'in_site_only' | 'external_only' | 'both'` string (not the discriminated union — they only branch on it).

- [ ] **Step 6: Update the orchestrator's call sites**

Whoever renders `<TemplateOrchestrator>` now needs to pass `bookingMode`. Search for usages:

```bash
grep -rn "TemplateOrchestrator" src/
```

For each call site:
- Public site render in `src/app/site/[slug]/SiteClient.tsx` (or wherever the slug page renders) — read `tenant.booking_mode` from the loaded tenant and pass it.
- The marketing preview (`src/app/(marketing)/preview/...`) typically has no tenant; pass the default `'in_site_only'`.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add src/components/templates/TemplateOrchestrator.tsx src/lib/admin-bookings.ts src/app/
git commit -m "feat(orchestrator): thread booking_mode from tenant to templates"
```

---

## Task 12: SiteEditor — booking-mode radio control

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

The SiteEditor is 1548 lines. Read it before editing to find the right section (look for the existing "Booking" or "Services" group near where `booking_url` / `bookingDeepLink` is edited).

- [ ] **Step 1: Add booking_mode to the editor's loaded data and save payload**

The editor loads tenant fields via a server prop or fetch. Find where the tenant is loaded and ensure `booking_mode` is included in the SELECT (or the prop type).

Find the `save()` / submit handler and ensure it passes `booking_mode` to its API endpoint (likely `/api/admin/tenants/[tenantId]` or similar — confirm the route).

- [ ] **Step 2: Render the 3-button radio group**

In an appropriate section near other booking controls, add:

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Booking mode</label>
  <p className="text-xs text-gray-500">
    Controls how customers book on the public site.
  </p>
  <div className="grid grid-cols-3 gap-2">
    {([
      { v: 'in_site_only',  label: 'In-site only',   sub: 'Just our calendar' },
      { v: 'external_only', label: 'External only',  sub: 'Their existing tool' },
      { v: 'both',          label: 'Both',           sub: 'In-site + quiet link' },
    ] as const).map((opt) => (
      <button
        key={opt.v}
        type="button"
        onClick={() => setBookingMode(opt.v)}
        className={`text-left p-3 border rounded-lg ${
          bookingMode === opt.v
            ? 'border-[var(--admin-primary)] bg-[var(--admin-primary)]/10'
            : 'border-gray-200'
        }`}
      >
        <div className="text-sm font-semibold">{opt.label}</div>
        <div className="text-xs text-gray-500">{opt.sub}</div>
      </button>
    ))}
  </div>
</div>
```

`bookingMode`/`setBookingMode` should come from a `useState<BookingMode>(initial.booking_mode ?? 'in_site_only')` near the top of the component.

- [ ] **Step 3: Wire `booking_mode` into the save handler**

The save handler (look for `fetch('/api/admin/tenants/...'`) needs to include `booking_mode` in its body. Update the API route on the server side too if it explicitly allowlists fields.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual smoke**

In the dev server, open the SiteEditor for an existing tenant. Switch booking mode between the three options, save, refresh — value persists. Verify the public site reflects the choice.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx src/app/api/admin/tenants/
git commit -m "feat(editor): add booking_mode radio control"
```

---

## Task 13: SiteEditor — per-service duration input

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

- [ ] **Step 1: Find the services-editing section**

Search the file for where `services` items are rendered for editing (look for a `.map((service, i) => ...` over the services array). Each service row likely has fields for name, price, description, bookingDeepLink.

- [ ] **Step 2: Add a duration input on each service row**

Within the service-row `<div>`, add (next to the price input):

```tsx
<div className="flex items-center gap-2">
  <label className="text-xs text-gray-500">Duration</label>
  <button
    type="button"
    className="px-2 py-1 border rounded text-sm"
    onClick={() =>
      updateService(i, {
        ...service,
        duration_minutes: Math.max(60, (service.duration_minutes ?? 60) - 60),
      })
    }
    aria-label="Decrease duration"
  >−</button>
  <span className="text-sm font-medium w-10 text-center">
    {(service.duration_minutes ?? 60) / 60}h
  </span>
  <button
    type="button"
    className="px-2 py-1 border rounded text-sm"
    onClick={() =>
      updateService(i, {
        ...service,
        duration_minutes: Math.min(480, (service.duration_minutes ?? 60) + 60),
      })
    }
    aria-label="Increase duration"
  >+</button>
</div>
```

`updateService(i, next)` should match the file's existing pattern for editing a service item; if there's no helper, mutate the array immutably and call the existing setter.

- [ ] **Step 3: Ensure `duration_minutes` is included in the save payload**

The services-save path likely posts the entire `services` array as JSONB. Verify nothing strips unknown fields. If the API route allowlists fields per service, add `duration_minutes` to it.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual smoke**

In dev, open the editor, set a service to 3h, save, refresh — value persists. Then book that service on the public site — confirm the time picker excludes hours that don't fit and the confirmation shows a 3-hour range.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx src/app/api/
git commit -m "feat(editor): add per-service duration input"
```

---

## Task 14: End-to-end manual verification

- [ ] **Step 1: Set up three test tenants (or three distinct configs)**

In dev or staging, ensure you have at least one tenant in each `booking_mode`:
- In-site only (no booking_url)
- External only (with Acuity URL)
- Both (with Acuity URL + booking_mode='both')

- [ ] **Step 2: Verify each mode renders correctly**

Visit each tenant's public site:
- `in_site_only`: only the primary "Book instantly" button. No Acuity link anywhere.
- `external_only`: the Acuity embed/redirect, exactly as today. No in-site calendar.
- `both`: primary "Book instantly" button + quiet "Already using Acuity? You can still book there ↗" link below. Per-service Book buttons open the in-site modal.

- [ ] **Step 3: Verify multi-hour booking flow**

For the in-site-only tenant: pick a 3h service, pick a date, confirm only valid 3h-fitting hours appear in the picker. Submit. Verify:
- DB row has `duration_minutes = 180`.
- Owner email has the time range "10:00 AM – 1:00 PM".
- The `.ics` attachment ends 3 hours after start.
- A second 3h booking that overlaps is rejected with a 409.

- [ ] **Step 4: Verify mobile (375px)**

In Chrome DevTools, resize to 375px and confirm:
- Layout A entry stays full-width primary + centered quiet link.
- Time picker is usable.
- Service cards show duration legibly.

- [ ] **Step 5: Final review — confirm the spec's Non-Goals are honored**

- Hour-range blocking: not implemented (Spec 2).
- SMS: not implemented (Spec 2).
- 30-min granularity: not implemented.

If any of those snuck in, remove them.

- [ ] **Step 6: Open PR**

```bash
git push -u origin <branch>
gh pr create --title "feat: customer-facing booking v2 (multi-hour + dual-mode)" --body "$(cat <<'EOF'
## Summary
- Per-service multi-hour booking durations (1–8h)
- Dual booking entry (in-site primary + quiet external link) gated by tenant.booking_mode
- Pure availability/conflict module with full unit-test coverage

## Test plan
- [x] availability.ts unit tests pass (26 tests)
- [x] admin-bookings.test.ts still green
- [x] /api/create-booking accepts duration_minutes, rejects overlaps with 409
- [x] In-site / external-only / both modes verified manually on dev tenants
- [x] Mobile 375px renders correctly
- [x] Migration applied cleanly; existing tenants preserved their behavior

Spec: docs/superpowers/specs/2026-04-25-customer-facing-booking-v2-design.md
EOF
)"
```

---

## Self-review notes

The plan was reviewed for spec coverage, placeholder content, and type consistency. Items verified:

- Every spec section maps to a task: data model → Tasks 1–2; availability logic → Tasks 3–5; getBookingMode rewrite → Task 6; API → Task 7; UI → Tasks 8–11; admin editor → Tasks 12–13; verification → Task 14.
- No "TBD" / "TODO" / "implement later" placeholders.
- Type names consistent across tasks: `BookingInterval`, `WorkingHours`, `BookingMode` (discriminated union), `AvailabilityInput`. Function names consistent: `bookingsOverlap`, `wouldExceedCapacity`, `computeAvailableStarts`, `parseBookingTime`, `formatTimeRange`, `getBookingMode`, `detectProvider`.
- Test counts: Task 3 adds 11 (5 + 6); Task 4 adds 9; Task 5 adds 6 → 26 total in `availability.test.ts`.
