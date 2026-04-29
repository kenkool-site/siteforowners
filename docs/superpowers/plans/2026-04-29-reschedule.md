# Reschedule Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customer self-serve reschedule via signed-link in confirmation emails, plus owner reschedule via a new admin action. One reschedule per booking, ≥24h before original time, deposit transfers, in-place row update.

**Architecture:** One column added to `bookings` (`reschedule_count`). Stateless HMAC token in customer email URLs (no DB column, no revocation list — token expiry = booking start time). Two new API routes (`/api/booking/[id]/reschedule` customer, `/api/admin/bookings/[id]/reschedule` owner) sharing a small core update helper. New `/reschedule` page reuses `CustomerBookingFlow` in a new `mode="reschedule"`. New `RescheduleModal` for the owner side. Two new email and two new SMS templates.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Tailwind, Supabase (Postgres), Twilio SDK v6, Resend, `node:test` + `tsx` for unit tests, Node `crypto` for HMAC.

**Spec reference:** [`docs/superpowers/specs/2026-04-29-reschedule-design.md`](../specs/2026-04-29-reschedule-design.md)

**Env requirement:** `RESCHEDULE_TOKEN_SECRET` must be set in Vercel before merge — a 32+ byte random hex string. Routes 500 if missing rather than silently accepting unsigned tokens.

---

## File structure

### New files

| File | Responsibility |
|---|---|
| `siteforowners/supabase/migrations/023_add_reschedule.sql` | Schema migration (`reschedule_count` int column on `bookings`) |
| `siteforowners/src/lib/reschedule-token.ts` | Pure HMAC sign/verify helpers, token URL builder |
| `siteforowners/src/lib/reschedule-token.test.ts` | Unit tests: round-trip, expiry, tamper detection, tampered booking_id, missing secret |
| `siteforowners/src/app/api/booking/[id]/reschedule/route.ts` | Customer endpoint — token-auth, all rules enforced, fires customer + owner notifications |
| `siteforowners/src/app/api/admin/bookings/[id]/reschedule/route.ts` | Owner endpoint — session-auth, 24h + count limits waived, capacity force-override flow |
| `siteforowners/src/app/reschedule/page.tsx` | Public page — verifies token, loads booking, renders fallback or the customer flow |
| `siteforowners/src/app/reschedule/done/page.tsx` | Success screen after a successful reschedule |
| `siteforowners/src/app/site/[slug]/admin/_components/RescheduleModal.tsx` | Owner-side date/time picker modal |

### Modified files

| File | Why |
|---|---|
| `siteforowners/src/lib/email.ts` | `BookingEmailData` adds `previousDate?` / `previousTime?` / `rescheduleUrl?`. Two new functions: `sendBookingRescheduledCustomer`, `sendBookingRescheduledOwner`. Existing customer-facing emails (confirmation, pending-deposit, deposit-received) render a "Reschedule" button when a token URL is provided. |
| `siteforowners/src/lib/sms.ts` | `BookingSmsData` adds `previousDate?` / `previousTime?`. Two new functions: `sendBookingRescheduledCustomerSms`, `sendBookingRescheduledOwnerSms` |
| `siteforowners/src/app/api/create-booking/route.ts` | Build a reschedule token + URL on insert, pass into customer email data |
| `siteforowners/src/app/api/admin/bookings/status/route.ts` | Same — build token + URL when firing the deposit-received email on `pending → confirmed` |
| `siteforowners/src/app/api/available-slots/route.ts` | Accept `?exclude_booking_id=` so the booking being rescheduled doesn't block its own current slot |
| `siteforowners/src/components/templates/CustomerBookingFlow.tsx` | Add `mode="reschedule"`, `lockedService`, `lockedCustomer`, `originalDateTime`, `submitLabel` props. Skip service step + customer-info step. Hide deposit panel + booking-policies callout. Different submit endpoint |
| `siteforowners/src/app/site/[slug]/admin/_components/BookingActionSheet.tsx` | Add "Reschedule" button + open `RescheduleModal` |

---

## Task 1: Migration — `bookings.reschedule_count`

**Files:**
- Create: `siteforowners/supabase/migrations/023_add_reschedule.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Spec 6: customer self-serve + owner-initiated reschedule.
--
-- Single counter column. Customer self-serve limit is 1; owner-initiated
-- reschedules also increment this counter. Used to (a) enforce the limit
-- on the customer endpoint and (b) render an "already moved" badge in
-- admin so the owner sees the customer has used their quota.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reschedule_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN bookings.reschedule_count IS
  'Spec 6: number of times this booking has been rescheduled, by either
   the customer (self-serve) or the owner. Customer endpoint enforces
   < 1; owner endpoint bypasses but still increments.';
```

- [ ] **Step 2: Apply locally**

```bash
cd siteforowners && supabase db push
```
Or paste into the Supabase dashboard SQL editor. Verify with `\d bookings` that the column appears with default 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_add_reschedule.sql
git commit -m "feat(db): add bookings.reschedule_count for spec 6 reschedule"
```

---

## Task 2: Reschedule token helper + tests

**Files:**
- Create: `siteforowners/src/lib/reschedule-token.ts`
- Create: `siteforowners/src/lib/reschedule-token.test.ts`

- [ ] **Step 1: Write failing tests first**

```ts
// siteforowners/src/lib/reschedule-token.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

const SECRET = "test-secret-do-not-use-in-prod";
process.env.RESCHEDULE_TOKEN_SECRET = SECRET;

import { signToken, verifyToken, buildRescheduleUrl } from "./reschedule-token";

test("signToken + verifyToken round-trip succeeds", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({ bookingId, expiry, signature: sig });
  assert.equal(r.ok, true);
});

test("verifyToken rejects expired token", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) - 60;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({ bookingId, expiry, signature: sig });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "expired");
});

test("verifyToken rejects tampered signature", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const tampered = sig.slice(0, -2) + "XX";
  const r = verifyToken({ bookingId, expiry, signature: tampered });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad_signature");
});

test("verifyToken rejects tampered bookingId", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({
    bookingId: "00000000-0000-0000-0000-000000000002",
    expiry,
    signature: sig,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad_signature");
});

test("verifyToken rejects tampered expiry", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = signToken({ bookingId, expiry });
  const r = verifyToken({ bookingId, expiry: expiry + 100, signature: sig });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "bad_signature");
});

test("buildRescheduleUrl produces /reschedule?b=&e=&s= shape", () => {
  const bookingId = "00000000-0000-0000-0000-000000000001";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const url = buildRescheduleUrl("https://example.com", bookingId, expiry);
  const u = new URL(url);
  assert.equal(u.pathname, "/reschedule");
  assert.equal(u.searchParams.get("b"), bookingId);
  assert.equal(u.searchParams.get("e"), String(expiry));
  assert.ok(u.searchParams.get("s")?.length, "signature present");
});

test("signToken throws when RESCHEDULE_TOKEN_SECRET is missing", () => {
  const before = process.env.RESCHEDULE_TOKEN_SECRET;
  delete process.env.RESCHEDULE_TOKEN_SECRET;
  assert.throws(() => signToken({ bookingId: "x", expiry: 1 }), /RESCHEDULE_TOKEN_SECRET/);
  process.env.RESCHEDULE_TOKEN_SECRET = before;
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx tsx --test src/lib/reschedule-token.test.ts
```
Expected: all 7 tests fail with "Cannot find module './reschedule-token'".

- [ ] **Step 3: Implement the module**

```ts
// siteforowners/src/lib/reschedule-token.ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless HMAC tokens for the customer reschedule link. The signed
 * payload is `${bookingId}.${expiry}` where expiry is unix seconds.
 *
 * The secret is read at sign/verify time so tests can mutate
 * process.env between cases. Production must set
 * RESCHEDULE_TOKEN_SECRET (≥32 bytes recommended); routes that depend
 * on this module surface a 500 if it's missing rather than silently
 * accepting unsigned tokens.
 */

interface SignInput {
  bookingId: string;
  expiry: number;
}

interface VerifyInput extends SignInput {
  signature: string;
}

type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "bad_signature" };

function getSecret(): string {
  const s = process.env.RESCHEDULE_TOKEN_SECRET;
  if (!s) {
    throw new Error("RESCHEDULE_TOKEN_SECRET is not set");
  }
  return s;
}

function computeSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken({ bookingId, expiry }: SignInput): string {
  const secret = getSecret();
  return computeSignature(secret, `${bookingId}.${expiry}`);
}

export function verifyToken({ bookingId, expiry, signature }: VerifyInput): VerifyResult {
  const secret = getSecret();
  const expected = computeSignature(secret, `${bookingId}.${expiry}`);
  // timingSafeEqual requires equal-length buffers; bail early on length mismatch.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (expiry < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function buildRescheduleUrl(
  appUrl: string,
  bookingId: string,
  expiry: number,
): string {
  const sig = signToken({ bookingId, expiry });
  const base = appUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ b: bookingId, e: String(expiry), s: sig });
  return `${base}/reschedule?${params.toString()}`;
}

/**
 * Convert a booking date+time string (e.g. "2026-05-01" + "11:00 AM")
 * to a unix-seconds expiry. Floating local time, same convention as
 * the .ics generator. Used by the routes when minting tokens.
 */
export function bookingStartToExpiry(bookingDate: string, bookingTime: string): number {
  const dateObj = new Date(bookingDate + "T00:00:00");
  const m = bookingTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return Math.floor(dateObj.getTime() / 1000);
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const period = m[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  dateObj.setHours(hours, minutes, 0, 0);
  return Math.floor(dateObj.getTime() / 1000);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx tsx --test src/lib/reschedule-token.test.ts
```
Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reschedule-token.ts src/lib/reschedule-token.test.ts
git commit -m "feat(reschedule): HMAC token sign/verify helper"
```

---

## Task 3: Email + SMS reschedule templates

**Files:**
- Modify: `siteforowners/src/lib/email.ts`
- Modify: `siteforowners/src/lib/sms.ts`

- [ ] **Step 1: Extend `BookingEmailData` with reschedule fields**

In `src/lib/email.ts`, find the `BookingEmailData` interface and add three optional fields:

```ts
  /** Spec 6: previous date string ("Friday May 1") for reschedule emails. */
  previousDate?: string;
  /** Spec 6: previous time string ("11:00 AM") for reschedule emails. */
  previousTime?: string;
  /** Spec 6: signed reschedule link to render in customer-facing emails.
   * When set, customer-facing email functions render a "Reschedule" CTA. */
  rescheduleUrl?: string;
```

- [ ] **Step 2: Add a "Reschedule" button next to the calendar buttons**

Find the `renderCalendarButtons` helper in `src/lib/email.ts`. Just below it, add:

```ts
function renderRescheduleButton(booking: BookingEmailData): string {
  if (!booking.rescheduleUrl) return "";
  return `
    <div style="margin: 14px 0 0; text-align: center;">
      <a href="${booking.rescheduleUrl}" style="display: inline-block; padding: 9px 16px; background: #fff; color: #2563EB; text-decoration: none; border: 1px solid #2563EB; border-radius: 6px; font-size: 13px; font-weight: 600;">Reschedule</a>
    </div>
  `;
}
```

Then in `sendBookingConfirmation`, `sendBookingPendingDepositEmail`, and `sendBookingDepositReceivedEmail`, render `${renderRescheduleButton(booking)}` immediately after the existing `${calendarButtons}` (or in the equivalent spot — `sendBookingPendingDepositEmail` doesn't have calendar buttons; render the reschedule button just above the closing phone-line).

- [ ] **Step 3: Add the two new sender functions**

Append to `src/lib/email.ts`:

```ts
/** Spec 6: customer notification when a booking is rescheduled. The body
 * leads with the new date/time and shows the previous slot for reference.
 * Add-to-Calendar buttons reuse the hosted .ics endpoint, which always
 * returns the current row state, so older email links auto-update. */
export async function sendBookingRescheduledCustomer(
  booking: BookingEmailData,
  initiator: "customer" | "owner",
) {
  if (!resend) return;
  if (!booking.customerEmail) return;
  const firstName = (booking.customerName.split(" ")[0]) || booking.customerName;
  const lead = initiator === "owner"
    ? `Your appointment at <strong>${escapeHtml(booking.businessName)}</strong> has been moved by the business.`
    : `Your appointment at <strong>${escapeHtml(booking.businessName)}</strong> has been rescheduled.`;
  const calendarButtons = renderCalendarButtons(booking);
  const rescheduleButton = renderRescheduleButton(booking);
  await resend.emails.send({
    from: tenantFrom(booking.businessName),
    to: booking.customerEmail,
    ...(booking.ownerEmail ? { replyTo: booking.ownerEmail } : {}),
    subject: `Your booking at ${booking.businessName} has been moved`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #2563EB; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="margin: 0; color: #fff; font-size: 20px;">Booking moved</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="color: #4B5563; font-size: 15px; margin: 0 0 16px;">Hi ${escapeHtml(firstName)}, ${lead}</p>
          <div style="background: #EFF6FF; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <p style="margin: 0 0 8px; font-size: 14px;"><strong>Service:</strong> ${escapeHtml(booking.serviceName)}</p>
            <p style="margin: 0 0 8px; font-size: 14px;"><strong>New date:</strong> ${escapeHtml(booking.date)}</p>
            <p style="margin: 0 0 8px; font-size: 14px;"><strong>New time:</strong> ${escapeHtml(booking.time)}</p>
            ${booking.previousDate && booking.previousTime ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6B7280;">Previously: ${escapeHtml(booking.previousDate)} at ${escapeHtml(booking.previousTime)}</p>` : ""}
            ${booking.businessAddress ? `<p style="margin: 8px 0 0; font-size: 14px;"><strong>Location:</strong> ${escapeHtml(booking.businessAddress)}</p>` : ""}
          </div>
          ${calendarButtons}
          ${rescheduleButton}
          ${booking.businessPhone ? `<p style="color: #6B7280; font-size: 13px; margin: 16px 0 0;">Need to make changes? Call <a href="tel:${escapeHtml(booking.businessPhone)}" style="color: #2563EB;">${escapeHtml(booking.businessPhone)}</a></p>` : ""}
        </div>
      </div>
    `,
  });
}

/** Spec 6: owner notification when a customer reschedules. */
export async function sendBookingRescheduledOwner(
  ownerEmail: string,
  booking: BookingEmailData,
) {
  if (!resend) return;
  const toEmail = ownerEmail || ADMIN_EMAIL;
  if (!toEmail) return;
  const adminUrl = booking.previewSlug
    ? `${APP_URL.replace(/\/$/, "")}/site/${booking.previewSlug}/admin/schedule`
    : "";
  await resend.emails.send({
    from: tenantFrom(booking.businessName),
    to: toEmail,
    subject: `🔄 ${booking.customerName} rescheduled — ${booking.serviceName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #1f2937; padding: 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">Customer rescheduled</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="color: #111827; font-size: 15px; margin: 0 0 16px;"><strong>${escapeHtml(booking.customerName)}</strong> moved their <strong>${escapeHtml(booking.serviceName)}</strong> booking.</p>
          <div style="background: #f9fafb; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            ${booking.previousDate && booking.previousTime ? `<p style="margin: 0 0 6px; font-size: 14px; color: #6B7280;">From: ${escapeHtml(booking.previousDate)} at ${escapeHtml(booking.previousTime)}</p>` : ""}
            <p style="margin: 0; font-size: 14px;"><strong>To:</strong> ${escapeHtml(booking.date)} at ${escapeHtml(booking.time)}</p>
          </div>
          ${adminUrl ? `<div style="margin-top: 16px; text-align: center;"><a href="${adminUrl}" style="display: inline-block; background: #1f2937; color: #fff; padding: 10px 22px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none;">View in Admin →</a></div>` : ""}
        </div>
      </div>
    `,
  });
}
```

- [ ] **Step 4: Extend `BookingSmsData` and add SMS senders**

In `src/lib/sms.ts`, add to `BookingSmsData`:

```ts
  /** Spec 6: previous date/time strings for reschedule SMS. */
  previousDate?: string;
  previousTime?: string;
```

Append two new functions:

```ts
/** Spec 6: customer SMS when a booking is rescheduled. */
export async function sendBookingRescheduledCustomerSms(
  b: BookingSmsData,
  initiator: "customer" | "owner",
): Promise<void> {
  const firstName = b.customerName.split(" ")[0];
  const prev = b.previousDate && b.previousTime ? ` (was ${b.previousDate} ${b.previousTime})` : "";
  const lead = initiator === "owner"
    ? `Your booking at ${b.businessName} has been moved by the business`
    : `Your booking at ${b.businessName} has been rescheduled`;
  await send(
    b.customerPhone,
    `Hi ${firstName}! ${lead} to ${b.date} @ ${b.time}${prev}. Reply STOP to opt out.`,
  );
}

/** Spec 6: owner SMS when a customer reschedules. */
export async function sendBookingRescheduledOwnerSms(
  ownerPhone: string,
  b: BookingSmsData,
): Promise<void> {
  if (!ownerPhone) return;
  const prev = b.previousDate && b.previousTime ? ` (was ${b.previousDate} ${b.previousTime})` : "";
  await send(
    ownerPhone,
    `🔄 ${b.customerName} rescheduled their ${b.serviceName} to ${b.date} @ ${b.time}${prev}.`,
  );
}
```

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint src/lib/email.ts src/lib/sms.ts
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts src/lib/sms.ts
git commit -m "feat(reschedule): email + SMS templates + Reschedule button on existing emails"
```

---

## Task 4: `available-slots` endpoint accepts `?exclude_booking_id=`

**Files:**
- Modify: `siteforowners/src/app/api/available-slots/route.ts`

The endpoint currently filters out conflicts using all confirmed/pending bookings on the date. During reschedule preview, the booking being moved would conflict with itself. Add an optional query param to exclude one booking from the conflict pool.

- [ ] **Step 1: Read the existing route and find the slots query**

```bash
grep -n "from(\"bookings\")" src/app/api/available-slots/route.ts
```

- [ ] **Step 2: Read the query param at the top of the GET handler**

Add near the existing `searchParams` reads:

```ts
const excludeBookingId = searchParams.get("exclude_booking_id");
```

- [ ] **Step 3: Apply the exclusion to the bookings query**

Find the supabase query that loads conflicting bookings (typically `.from("bookings").select(...).eq("tenant_id", ...).eq("booking_date", ...)`). Add a conditional `.neq("id", excludeBookingId)` when the param is set:

```ts
let q = supabase
  .from("bookings")
  .select("booking_time, duration_minutes")
  .eq("tenant_id", tenantId)
  .eq("booking_date", date)
  .in("status", ["confirmed", "pending"]);
if (excludeBookingId) q = q.neq("id", excludeBookingId);
const { data: sameDay } = await q;
```

(Adapt to the existing variable names. The existing call is split across a few lines; preserve its style.)

- [ ] **Step 4: Manual smoke test**

Start dev server. Visit `/api/available-slots?tenant_id=...&date=2026-05-01` and note the slot list. Then visit with `&exclude_booking_id=<some_real_id_for_that_date>` and confirm the slot held by that booking is now available.

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint src/app/api/available-slots/route.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/available-slots/route.ts
git commit -m "feat(reschedule): exclude_booking_id param so a booking doesn't block its own slot"
```

---

## Task 5: Customer reschedule endpoint

**Files:**
- Create: `siteforowners/src/app/api/booking/[id]/reschedule/route.ts`

This endpoint validates the token, runs all rules (status, count, 24h cutoff, capacity, working hours, blocked dates), updates the booking row in place with optimistic concurrency on `reschedule_count`, and fires both customer + owner notifications.

- [ ] **Step 1: Create the route file**

```ts
// siteforowners/src/app/api/booking/[id]/reschedule/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken, signToken, bookingStartToExpiry } from "@/lib/reschedule-token";
import { parseBookingTime, wouldExceedCapacity, formatTimeRange } from "@/lib/availability";
import {
  sendBookingRescheduledCustomer,
  sendBookingRescheduledOwner,
  type BookingEmailData,
} from "@/lib/email";
import {
  sendBookingRescheduledCustomerSms,
  sendBookingRescheduledOwnerSms,
  type BookingSmsData,
} from "@/lib/sms";
import { googleCalendarUrl } from "@/lib/calendar-links";
import { parseTime } from "@/lib/ics";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function dateStr(dateObj: Date): string {
  return `${DAYS[dateObj.getDay()]}, ${MONTHS[dateObj.getMonth()]} ${dateObj.getDate()}`;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const bookingId = params.id;
  let body: { token?: { e?: number; s?: string }; new_date?: string; new_time?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const exp = body.token?.e;
  const sig = body.token?.s;
  if (!exp || !sig || !body.new_date || !body.new_time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const tokenResult = verifyToken({ bookingId, expiry: exp, signature: sig });
  if (!tokenResult.ok) {
    return NextResponse.json({ error: tokenResult.reason }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, tenant_id, service_name, service_price, booking_date, booking_time, duration_minutes, customer_name, customer_phone, customer_email, customer_sms_opt_in, status, reschedule_count")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (["canceled", "completed", "no_show"].includes(booking.status as string)) {
    return NextResponse.json({ error: "Booking is no longer active" }, { status: 410 });
  }
  if ((booking.reschedule_count as number) >= 1) {
    return NextResponse.json({ error: "This booking has already been rescheduled" }, { status: 409 });
  }

  // 24h cutoff. Compute original start in floating local time, same as the
  // .ics + token expiry math so the boundary stays consistent.
  const originalStart = new Date((booking.booking_date as string) + "T00:00:00");
  const orig = parseTime(booking.booking_time as string);
  originalStart.setHours(orig.hours, orig.minutes, 0, 0);
  if (originalStart.getTime() - Date.now() < TWENTY_FOUR_HOURS_MS) {
    return NextResponse.json(
      { error: "Online reschedule is not available within 24 hours of your booking" },
      { status: 409 },
    );
  }

  // Validate the new slot is in the future.
  const newStart = new Date(body.new_date + "T00:00:00");
  const newT = parseTime(body.new_time);
  newStart.setHours(newT.hours, newT.minutes, 0, 0);
  if (newStart.getTime() <= Date.now()) {
    return NextResponse.json({ error: "New slot must be in the future" }, { status: 400 });
  }

  // Capacity check, excluding this booking from the conflict pool.
  const tenantId = booking.tenant_id as string | null;
  if (tenantId) {
    const { data: settings } = await supabase
      .from("booking_settings")
      .select("max_per_slot, working_hours, blocked_dates")
      .eq("tenant_id", tenantId)
      .single();
    const maxPerSlot = (settings?.max_per_slot as number | null) || 1;

    // Working-hours + blocked-date guards.
    const blocked = (settings?.blocked_dates as string[] | null) ?? [];
    if (blocked.includes(body.new_date)) {
      return NextResponse.json({ error: "That day is unavailable" }, { status: 400 });
    }
    const workingHours = settings?.working_hours as Record<string, { open: string; close: string } | null> | null;
    const dayName = DAYS[newStart.getDay()];
    const dayHours = workingHours?.[dayName];
    if (dayHours === null) {
      return NextResponse.json({ error: "That day is unavailable" }, { status: 400 });
    }

    const { data: sameDay } = await supabase
      .from("bookings")
      .select("booking_time, duration_minutes")
      .eq("tenant_id", tenantId)
      .eq("booking_date", body.new_date)
      .neq("id", bookingId)
      .in("status", ["confirmed", "pending"]);

    const candidate = {
      startMinutes: parseBookingTime(body.new_time),
      durationMinutes: (booking.duration_minutes as number) ?? 60,
    };
    const existing = (sameDay ?? []).map((r) => ({
      startMinutes: parseBookingTime(r.booking_time as string),
      durationMinutes: (r.duration_minutes as number) ?? 60,
    }));
    if (wouldExceedCapacity(candidate, existing, maxPerSlot)) {
      return NextResponse.json({ error: "That slot is no longer available" }, { status: 409 });
    }
  }

  // Capture old date/time before the update so we can include them in
  // notifications. The row has the new values after the UPDATE returns.
  const previousBookingDate = booking.booking_date as string;
  const previousBookingTime = booking.booking_time as string;

  // Optimistic concurrency: only update if reschedule_count is still 0.
  // This protects against a race where two reschedules submit at once.
  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      booking_date: body.new_date,
      booking_time: body.new_time,
      reschedule_count: 1,
    })
    .eq("id", bookingId)
    .eq("reschedule_count", 0)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Booking just changed — please refresh and try again" },
      { status: 409 },
    );
  }

  // Build notification payloads.
  const previousDateObj = new Date(previousBookingDate + "T00:00:00");
  const newDateObj = new Date(body.new_date + "T00:00:00");
  const durationMinutes = (booking.duration_minutes as number) ?? 60;

  const tenantInfo = tenantId
    ? await supabase
        .from("tenants")
        .select("business_name, phone, address, email, sms_phone, preview_slug")
        .eq("id", tenantId)
        .maybeSingle()
    : { data: null };
  const tenant = tenantInfo.data;
  const businessName = (tenant?.business_name as string) || "Business";
  const businessPhone = (tenant?.phone as string) || "";
  const businessAddress = (tenant?.address as string) || "";
  const ownerEmail = (tenant?.email as string) || "";
  const ownerSmsPhone = (tenant?.sms_phone as string | null) ?? (tenant?.phone as string | null) ?? "";
  const previewSlug = (tenant?.preview_slug as string | null) ?? undefined;

  const newExpiry = bookingStartToExpiry(body.new_date, body.new_time);
  const newSig = signToken({ bookingId, expiry: newExpiry });
  const rescheduleUrl = `${APP_URL.replace(/\/$/, "")}/reschedule?b=${bookingId}&e=${newExpiry}&s=${newSig}`;
  // Customer just used their quota — don't include the link in the next
  // email. Spec: omit when reschedule_count >= 1 after the increment.
  const omitRescheduleLink = true;

  const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000);
  const gcalUrl = googleCalendarUrl({
    title: `${booking.service_name} — ${businessName}`,
    description: `Service: ${booking.service_name}${booking.service_price ? ` (${booking.service_price})` : ""}\nCustomer: ${booking.customer_name}`,
    location: businessAddress || undefined,
    startDate: newStart,
    endDate: newEnd,
  });

  const emailData: BookingEmailData = {
    businessName,
    businessPhone,
    businessAddress,
    serviceName: booking.service_name as string,
    servicePrice: (booking.service_price as string | null) ?? undefined,
    date: dateStr(newDateObj),
    time: body.new_time,
    customerName: booking.customer_name as string,
    customerPhone: booking.customer_phone as string,
    customerEmail: (booking.customer_email as string | null) ?? undefined,
    ownerEmail: ownerEmail || undefined,
    previewSlug,
    bookingId,
    googleCalendarUrl: gcalUrl,
    previousDate: dateStr(previousDateObj),
    previousTime: previousBookingTime,
    rescheduleUrl: omitRescheduleLink ? undefined : rescheduleUrl,
  };

  const smsData: BookingSmsData = {
    businessName,
    serviceName: booking.service_name as string,
    date: dateStr(newDateObj),
    time: formatTimeRange(body.new_time, durationMinutes),
    customerName: booking.customer_name as string,
    customerPhone: booking.customer_phone as string,
    businessAddress: businessAddress || undefined,
    previousDate: dateStr(previousDateObj),
    previousTime: previousBookingTime,
  };

  Promise.allSettled([
    sendBookingRescheduledCustomer(emailData, "customer"),
    sendBookingRescheduledOwner(ownerEmail, emailData),
    booking.customer_sms_opt_in ? sendBookingRescheduledCustomerSms(smsData, "customer") : Promise.resolve(),
    sendBookingRescheduledOwnerSms(ownerSmsPhone, smsData),
  ]).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("Reschedule notification failed:", r.reason);
      }
    }
  });

  return NextResponse.json({ success: true, booking_id: bookingId });
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint 'src/app/api/booking/[id]/reschedule/route.ts'
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/booking/[id]/reschedule
git commit -m "feat(reschedule): customer endpoint with token-auth and full rule enforcement"
```

---

## Task 6: Embed reschedule URL in customer emails

**Files:**
- Modify: `siteforowners/src/app/api/create-booking/route.ts`
- Modify: `siteforowners/src/app/api/admin/bookings/status/route.ts`

After Task 3 the email function knows to render a Reschedule button when `rescheduleUrl` is on the data object. Now wire the URL into the call sites.

- [ ] **Step 1: Wire into `create-booking`**

In `src/app/api/create-booking/route.ts`, near the existing `gcalUrl = googleCalendarUrl(...)` line, add:

```ts
import { signToken, bookingStartToExpiry } from "@/lib/reschedule-token";
```

(at the top of the file, near the other lib imports)

Then where `emailData` is built, add the reschedule URL alongside the calendar URL:

```ts
const rescheduleExpiry = bookingStartToExpiry(booking_date, booking_time);
const rescheduleSig = signToken({ bookingId: booking.id, expiry: rescheduleExpiry });
const rescheduleUrl = `${APP_URL.replace(/\/$/, "")}/reschedule?b=${booking.id}&e=${rescheduleExpiry}&s=${rescheduleSig}`;
```

(Add a `const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";` near the top of the file if it's not already there.)

Add `rescheduleUrl` to the `emailData` object:

```ts
const emailData = {
  // ...existing fields...
  bookingId: booking.id,
  googleCalendarUrl: gcalUrl,
  rescheduleUrl,
};
```

- [ ] **Step 2: Wire into `admin/bookings/status`**

In `src/app/api/admin/bookings/status/route.ts`, on the `pending → confirmed` branch (where `sendBookingDepositReceivedEmail` is called), build the same URL and add it to the `customerEmailData` object:

```ts
import { signToken, bookingStartToExpiry } from "@/lib/reschedule-token";
// (top of file, with other imports)

// Inside the pending → confirmed branch:
const rescheduleExpiry = bookingStartToExpiry(row.booking_date as string, row.booking_time as string);
const rescheduleSig = signToken({ bookingId, expiry: rescheduleExpiry });
const APP_URL_HERE = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";
const rescheduleUrl = `${APP_URL_HERE.replace(/\/$/, "")}/reschedule?b=${bookingId}&e=${rescheduleExpiry}&s=${rescheduleSig}`;
const customerEmailData = {
  ...emailData,
  bookingId,
  googleCalendarUrl: gcalUrl,
  rescheduleUrl,
};
```

(Replace the existing `customerEmailData = { ...emailData, bookingId, googleCalendarUrl: gcalUrl }` with the version that includes `rescheduleUrl`.)

- [ ] **Step 3: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint src/app/api/create-booking/route.ts src/app/api/admin/bookings/status/route.ts
```

- [ ] **Step 4: Manual smoke test**

Set `RESCHEDULE_TOKEN_SECRET=dev-test-secret` in `.env.local`, run dev server, place a booking through the customer flow, check the resulting confirmation email's HTML — confirm a "Reschedule" button is rendered with a `?b=&e=&s=` URL.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/create-booking/route.ts src/app/api/admin/bookings/status/route.ts
git commit -m "feat(reschedule): embed signed reschedule URL in customer emails"
```

---

## Task 7: Customer reschedule page + done page

**Files:**
- Create: `siteforowners/src/app/reschedule/page.tsx`
- Create: `siteforowners/src/app/reschedule/done/page.tsx`

The page is a server component that validates the token, loads the booking, runs the same rules the API runs, and either renders the customer flow (Task 8) or a friendly fallback. The done page is a static success screen.

- [ ] **Step 1: Create the fallback component**

Create `siteforowners/src/app/reschedule/_components/RescheduleFallback.tsx`:

```tsx
"use client";

interface Props {
  reason:
    | "invalid_token"
    | "expired"
    | "not_found"
    | "inactive"
    | "already_rescheduled"
    | "inside_24h";
  businessPhone?: string;
  businessName?: string;
}

const COPY: Record<Props["reason"], { title: string; body: string }> = {
  invalid_token: {
    title: "Link not recognized",
    body: "This reschedule link looks tampered with or didn't come from us.",
  },
  expired: {
    title: "Link expired",
    body: "This link is for a booking that has already passed.",
  },
  not_found: {
    title: "Booking not found",
    body: "We couldn't find this booking — it may have been canceled.",
  },
  inactive: {
    title: "Booking no longer active",
    body: "This booking has already been canceled or completed.",
  },
  already_rescheduled: {
    title: "Already rescheduled",
    body: "You've already rescheduled this booking once. To make another change, please call.",
  },
  inside_24h: {
    title: "Too close to your appointment",
    body: "Online reschedule isn't available within 24 hours of your booking. Please call to make a change.",
  },
};

export function RescheduleFallback({ reason, businessPhone, businessName }: Props) {
  const { title, body } = COPY[reason];
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="text-4xl mb-3">📅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-600 mb-6">{body}</p>
        {businessPhone && (
          <a
            href={`tel:${businessPhone}`}
            className="inline-block bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
          >
            Call {businessName || "us"}: {businessPhone}
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the server-component page**

```tsx
// siteforowners/src/app/reschedule/page.tsx
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/reschedule-token";
import { parseTime } from "@/lib/ics";
import { RescheduleFallback } from "./_components/RescheduleFallback";
import { ReschedulePicker } from "./_components/ReschedulePicker";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReschedulePage({
  searchParams,
}: {
  searchParams: { b?: string; e?: string; s?: string };
}) {
  const bookingId = searchParams.b;
  const expiry = searchParams.e ? Number(searchParams.e) : NaN;
  const signature = searchParams.s;

  if (!bookingId || !Number.isFinite(expiry) || !signature) {
    return <RescheduleFallback reason="invalid_token" />;
  }

  const tok = verifyToken({ bookingId, expiry, signature });
  if (!tok.ok) {
    return <RescheduleFallback reason={tok.reason === "expired" ? "expired" : "invalid_token"} />;
  }

  const supabase = createAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, tenant_id, service_name, service_price, duration_minutes, booking_date, booking_time, customer_name, customer_phone, customer_email, status, reschedule_count")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return <RescheduleFallback reason="not_found" />;

  let businessName = "";
  let businessPhone = "";
  let previewSlug = "";
  let workingHours: Record<string, { open: string; close: string } | null> | null = null;
  let blockedDates: string[] = [];
  if (booking.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, phone, preview_slug")
      .eq("id", booking.tenant_id)
      .maybeSingle();
    businessName = (tenant?.business_name as string) || "";
    businessPhone = (tenant?.phone as string) || "";
    previewSlug = (tenant?.preview_slug as string) || "";

    const { data: settings } = await supabase
      .from("booking_settings")
      .select("working_hours, blocked_dates")
      .eq("tenant_id", booking.tenant_id)
      .maybeSingle();
    workingHours = (settings?.working_hours as typeof workingHours) ?? null;
    blockedDates = (settings?.blocked_dates as string[] | null) ?? [];
  }

  if (["canceled", "completed", "no_show"].includes(booking.status as string)) {
    return <RescheduleFallback reason="inactive" businessPhone={businessPhone} businessName={businessName} />;
  }
  if ((booking.reschedule_count as number) >= 1) {
    return <RescheduleFallback reason="already_rescheduled" businessPhone={businessPhone} businessName={businessName} />;
  }

  const originalStart = new Date((booking.booking_date as string) + "T00:00:00");
  const orig = parseTime(booking.booking_time as string);
  originalStart.setHours(orig.hours, orig.minutes, 0, 0);
  if (originalStart.getTime() - Date.now() < TWENTY_FOUR_HOURS_MS) {
    return <RescheduleFallback reason="inside_24h" businessPhone={businessPhone} businessName={businessName} />;
  }

  if (!previewSlug) notFound();

  return (
    <ReschedulePicker
      bookingId={booking.id as string}
      previewSlug={previewSlug}
      tenantId={booking.tenant_id as string}
      businessName={businessName}
      service={{
        name: booking.service_name as string,
        price: (booking.service_price as string | null) ?? "",
        duration_minutes: (booking.duration_minutes as number) ?? 60,
      }}
      customer={{
        name: booking.customer_name as string,
        phone: booking.customer_phone as string,
        email: (booking.customer_email as string | null) ?? "",
      }}
      originalDate={booking.booking_date as string}
      originalTime={booking.booking_time as string}
      workingHours={workingHours}
      blockedDates={blockedDates}
      tokenExpiry={expiry}
      tokenSignature={signature}
    />
  );
}
```

- [ ] **Step 3: Create the picker stub**

This stub renders `CustomerBookingFlow` in reschedule mode after Task 8 is done. For now stub it minimally so the page compiles:

```tsx
// siteforowners/src/app/reschedule/_components/ReschedulePicker.tsx
"use client";

interface Props {
  bookingId: string;
  previewSlug: string;
  tenantId: string;
  businessName: string;
  service: { name: string; price: string; duration_minutes: number };
  customer: { name: string; phone: string; email: string };
  originalDate: string;
  originalTime: string;
  workingHours: Record<string, { open: string; close: string } | null> | null;
  blockedDates: string[];
  tokenExpiry: number;
  tokenSignature: string;
}

export function ReschedulePicker(_props: Props) {
  return <div className="p-8 text-center">Reschedule picker — wired in Task 8.</div>;
}
```

- [ ] **Step 4: Create the done page**

```tsx
// siteforowners/src/app/reschedule/done/page.tsx
export default function RescheduleDonePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Booking moved</h1>
        <p className="text-sm text-gray-600">
          Your appointment has been rescheduled. We sent you a confirmation with the new details.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint src/app/reschedule/
```

- [ ] **Step 6: Manual smoke test**

Visit a real reschedule URL from the email (Task 6). Confirm the page renders the stub. Then test fallbacks: tamper with the signature, expire the token, etc.

- [ ] **Step 7: Commit**

```bash
git add src/app/reschedule
git commit -m "feat(reschedule): public page validates token + renders fallback or stub picker"
```

---

## Task 8: `CustomerBookingFlow` reschedule mode + wire into `ReschedulePicker`

**Files:**
- Modify: `siteforowners/src/components/templates/CustomerBookingFlow.tsx`
- Modify: `siteforowners/src/app/reschedule/_components/ReschedulePicker.tsx`

- [ ] **Step 1: Add reschedule props to `CustomerBookingFlow`**

In the props interface for `CustomerBookingFlow`, add:

```ts
  /** Spec 6: pre-populate the details-step inputs (used by reschedule
   * mode where customer info is already known). */
  initialCustomer?: {
    name: string;
    phone: string;
    email?: string;
  };
  /** Spec 6: when set, the flow renders in reschedule mode — service +
   * customer info are locked, deposit panel is hidden, submit calls a
   * different endpoint. */
  rescheduleMode?: {
    bookingId: string;
    originalDateLabel: string;     // "Friday, May 1"
    originalTimeLabel: string;     // "11:00 AM"
    tokenExpiry: number;
    tokenSignature: string;
    onDone: () => void;
  };
```

Then in the component body, seed the existing `customerName` / `customerPhone` / `customerEmail` `useState` hooks with `initialCustomer?.name ?? ""`, etc., so the inputs come pre-filled.

- [ ] **Step 2: Branch the flow when `rescheduleMode` is set**

Inside the component:

1. When `rescheduleMode` is set, `step` defaults to `"schedule"` instead of `"service"`. Update the existing `useState`:

```ts
const [step, setStep] = useState<"service" | "details" | "schedule" | "confirm">(
  rescheduleMode ? "schedule" : initialService ? "details" : "service",
);
```

2. The submit button calls a different endpoint when `rescheduleMode` is set. Find the existing `handleBook` function and add a branch that calls `/api/booking/[id]/reschedule`:

```ts
async function handleReschedule() {
  if (!rescheduleMode || !selectedTime || !selectedDate) return;
  setSubmitting(true);
  try {
    const newDate = formatLocalIsoDate(selectedDate);
    const res = await fetch(`/api/booking/${rescheduleMode.bookingId}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: { e: rescheduleMode.tokenExpiry, s: rescheduleMode.tokenSignature },
        new_date: newDate,
        new_time: selectedTime,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error || "Could not reschedule. Try another slot or call us.");
      return;
    }
    rescheduleMode.onDone();
  } finally {
    setSubmitting(false);
  }
}
```

(Use the existing `formatLocalIsoDate` helper if present; otherwise inline the same formatting used elsewhere — `${y}-${m}-${d}`.)

3. In the schedule step, when `rescheduleMode` is set, show the original date/time at the top:

```tsx
{rescheduleMode && (
  <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
    <div className="text-xs uppercase tracking-wider text-blue-900 font-semibold mb-1">Currently scheduled</div>
    <div className="text-blue-900">
      {rescheduleMode.originalDateLabel} at {rescheduleMode.originalTimeLabel}
    </div>
  </div>
)}
```

4. The submit button's label and onClick branch on `rescheduleMode`:

```tsx
<button
  onClick={rescheduleMode ? handleReschedule : handleBook}
  disabled={submitting || !selectedTime}
  ...
>
  {submitting
    ? rescheduleMode ? "Saving..." : "Booking..."
    : rescheduleMode ? "Confirm reschedule"
    : isDepositRequired ? "Confirm & I'll pay deposit"
    : "Confirm booking"}
</button>
```

5. Hide the deposit panel and policies callout when in reschedule mode:

Where `{isDepositRequired && (...)}` and `{policiesHeadline && (...)}` are rendered in the details step, wrap each in `{!rescheduleMode && ...}`.

(In reschedule mode the customer skipped past the details step entirely — they go straight to schedule — so these only matter if the user navigates back. Belt-and-suspenders.)

- [ ] **Step 3: Wire `ReschedulePicker` to `CustomerBookingFlow`**

Replace the stub from Task 7 with:

```tsx
// siteforowners/src/app/reschedule/_components/ReschedulePicker.tsx
"use client";

import { useRouter } from "next/navigation";
import { CustomerBookingFlow } from "@/components/templates/CustomerBookingFlow";
import { defaultThemeColors } from "@/lib/templates/themes";

interface Props {
  bookingId: string;
  previewSlug: string;
  tenantId: string;
  businessName: string;
  service: { name: string; price: string; duration_minutes: number };
  customer: { name: string; phone: string; email: string };
  originalDate: string;
  originalTime: string;
  workingHours: Record<string, { open: string; close: string } | null> | null;
  blockedDates: string[];
  tokenExpiry: number;
  tokenSignature: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function ReschedulePicker(props: Props) {
  const router = useRouter();
  const colors = defaultThemeColors;
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-1">{props.businessName || "Reschedule your booking"}</h1>
        <p className="text-sm text-gray-600 mb-6">Pick a new time for your appointment.</p>
        <CustomerBookingFlow
          services={[{ name: props.service.name, price: props.service.price, duration_minutes: props.service.duration_minutes }]}
          colors={colors}
          businessName={props.businessName}
          previewSlug={props.previewSlug}
          tenantId={props.tenantId}
          initialService={{
            name: props.service.name,
            price: props.service.price,
            duration_minutes: props.service.duration_minutes,
          }}
          initialCustomer={{
            name: props.customer.name,
            phone: props.customer.phone,
            email: props.customer.email,
          }}
          workingHours={props.workingHours}
          blockedDates={props.blockedDates}
          rescheduleMode={{
            bookingId: props.bookingId,
            originalDateLabel: dateLabel(props.originalDate),
            originalTimeLabel: props.originalTime,
            tokenExpiry: props.tokenExpiry,
            tokenSignature: props.tokenSignature,
            onDone: () => router.push("/reschedule/done"),
          }}
        />
      </div>
    </div>
  );
}
```

The `initialCustomer` prop above doesn't currently exist on `CustomerBookingFlow`. If the component doesn't already accept it, add it as optional and pre-populate the customer-info inputs from it. Confirm this by inspecting the component's existing prop list before this step.

- [ ] **Step 4: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint src/components/templates/CustomerBookingFlow.tsx src/app/reschedule
```

- [ ] **Step 5: Manual end-to-end smoke test**

1. Place a booking through the customer flow.
2. Click the "Reschedule" link in the confirmation email.
3. Pick a new slot, submit.
4. Verify (a) the page redirects to `/reschedule/done`, (b) you receive a customer reschedule email, (c) the owner email arrives.

- [ ] **Step 6: Commit**

```bash
git add src/components/templates/CustomerBookingFlow.tsx src/app/reschedule
git commit -m "feat(reschedule): customer flow reschedule mode + wired ReschedulePicker"
```

---

## Task 9: Owner reschedule endpoint

**Files:**
- Create: `siteforowners/src/app/api/admin/bookings/[id]/reschedule/route.ts`

Mirrors Task 5's customer endpoint but with session auth, no 24h cutoff, no count cap, and a `force` flag to bypass capacity warnings. Notifies customer only.

- [ ] **Step 1: Create the route file**

```ts
// siteforowners/src/app/api/admin/bookings/[id]/reschedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { parseBookingTime, wouldExceedCapacity, formatTimeRange } from "@/lib/availability";
import {
  sendBookingRescheduledCustomer,
  type BookingEmailData,
} from "@/lib/email";
import {
  sendBookingRescheduledCustomerSms,
  type BookingSmsData,
} from "@/lib/sms";
import { googleCalendarUrl } from "@/lib/calendar-links";
import { parseTime } from "@/lib/ics";
import { signToken, bookingStartToExpiry } from "@/lib/reschedule-token";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

function dateStr(d: Date): string {
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const bookingId = params.id;
  let body: { new_date?: string; new_time?: string; force?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const supabase = createAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, tenant_id, service_name, service_price, booking_date, booking_time, duration_minutes, customer_name, customer_phone, customer_email, customer_sms_opt_in, status, reschedule_count")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const auth = await requireOwnerOrFounder(request, (booking.tenant_id as string) ?? undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!body.new_date || !body.new_time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (["canceled", "completed", "no_show"].includes(booking.status as string)) {
    return NextResponse.json({ error: "Booking is no longer active" }, { status: 410 });
  }

  const newStart = new Date(body.new_date + "T00:00:00");
  const newT = parseTime(body.new_time);
  newStart.setHours(newT.hours, newT.minutes, 0, 0);
  if (newStart.getTime() <= Date.now()) {
    return NextResponse.json({ error: "New slot must be in the future" }, { status: 400 });
  }

  const tenantId = booking.tenant_id as string | null;
  if (tenantId) {
    const { data: settings } = await supabase
      .from("booking_settings")
      .select("max_per_slot, working_hours, blocked_dates")
      .eq("tenant_id", tenantId)
      .single();

    const blocked = (settings?.blocked_dates as string[] | null) ?? [];
    if (blocked.includes(body.new_date)) {
      return NextResponse.json({ error: "That day is unavailable" }, { status: 400 });
    }
    const workingHours = settings?.working_hours as Record<string, { open: string; close: string } | null> | null;
    const dayName = DAYS[newStart.getDay()];
    if (workingHours?.[dayName] === null) {
      return NextResponse.json({ error: "That day is unavailable" }, { status: 400 });
    }

    if (!body.force) {
      const maxPerSlot = (settings?.max_per_slot as number | null) || 1;
      const { data: sameDay } = await supabase
        .from("bookings")
        .select("booking_time, duration_minutes, customer_name")
        .eq("tenant_id", tenantId)
        .eq("booking_date", body.new_date)
        .neq("id", bookingId)
        .in("status", ["confirmed", "pending"]);

      const candidate = {
        startMinutes: parseBookingTime(body.new_time),
        durationMinutes: (booking.duration_minutes as number) ?? 60,
      };
      const existing = (sameDay ?? []).map((r) => ({
        startMinutes: parseBookingTime(r.booking_time as string),
        durationMinutes: (r.duration_minutes as number) ?? 60,
      }));
      if (wouldExceedCapacity(candidate, existing, maxPerSlot)) {
        // Surface the conflicting customer name so the modal can ask
        // the owner to confirm the override.
        const conflict = (sameDay ?? []).find(
          (r) => parseBookingTime(r.booking_time as string) === candidate.startMinutes,
        );
        return NextResponse.json(
          {
            error: "That slot already has a booking",
            conflict: { customer_name: (conflict?.customer_name as string) ?? "another customer" },
          },
          { status: 409 },
        );
      }
    }
  }

  const previousBookingDate = booking.booking_date as string;
  const previousBookingTime = booking.booking_time as string;
  const newCount = ((booking.reschedule_count as number) ?? 0) + 1;

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      booking_date: body.new_date,
      booking_time: body.new_time,
      reschedule_count: newCount,
    })
    .eq("id", bookingId);

  if (updateError) {
    console.error("[admin/bookings/reschedule] update failed", { bookingId, error: updateError });
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  // Notify customer only (owner just did this).
  if (tenantId) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, phone, address, email, preview_slug")
      .eq("id", tenantId)
      .maybeSingle();
    const businessName = (tenant?.business_name as string) || "Business";
    const businessPhone = (tenant?.phone as string) || "";
    const businessAddress = (tenant?.address as string) || "";
    const ownerEmail = (tenant?.email as string) || "";
    const previewSlug = (tenant?.preview_slug as string | null) ?? undefined;

    const previousDateObj = new Date(previousBookingDate + "T00:00:00");
    const newDateObj = new Date(body.new_date + "T00:00:00");
    const durationMinutes = (booking.duration_minutes as number) ?? 60;
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000);

    const newExpiry = bookingStartToExpiry(body.new_date, body.new_time);
    const newSig = signToken({ bookingId, expiry: newExpiry });
    const rescheduleUrl = newCount >= 1
      ? undefined
      : `${APP_URL.replace(/\/$/, "")}/reschedule?b=${bookingId}&e=${newExpiry}&s=${newSig}`;
    const gcalUrl = googleCalendarUrl({
      title: `${booking.service_name} — ${businessName}`,
      description: `Service: ${booking.service_name}${booking.service_price ? ` (${booking.service_price})` : ""}\nCustomer: ${booking.customer_name}`,
      location: businessAddress || undefined,
      startDate: newStart,
      endDate: newEnd,
    });

    const emailData: BookingEmailData = {
      businessName,
      businessPhone,
      businessAddress,
      serviceName: booking.service_name as string,
      servicePrice: (booking.service_price as string | null) ?? undefined,
      date: dateStr(newDateObj),
      time: body.new_time,
      customerName: booking.customer_name as string,
      customerPhone: booking.customer_phone as string,
      customerEmail: (booking.customer_email as string | null) ?? undefined,
      ownerEmail: ownerEmail || undefined,
      previewSlug,
      bookingId,
      googleCalendarUrl: gcalUrl,
      previousDate: dateStr(previousDateObj),
      previousTime: previousBookingTime,
      rescheduleUrl,
    };
    const smsData: BookingSmsData = {
      businessName,
      serviceName: booking.service_name as string,
      date: dateStr(newDateObj),
      time: formatTimeRange(body.new_time, durationMinutes),
      customerName: booking.customer_name as string,
      customerPhone: booking.customer_phone as string,
      businessAddress: businessAddress || undefined,
      previousDate: dateStr(previousDateObj),
      previousTime: previousBookingTime,
    };

    Promise.allSettled([
      sendBookingRescheduledCustomer(emailData, "owner"),
      booking.customer_sms_opt_in ? sendBookingRescheduledCustomerSms(smsData, "owner") : Promise.resolve(),
    ]).then((results) => {
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("Owner reschedule notification failed:", r.reason);
        }
      }
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint 'src/app/api/admin/bookings/[id]/reschedule/route.ts'
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/bookings
git commit -m "feat(reschedule): owner endpoint with session auth + force-override"
```

---

## Task 10: `RescheduleModal` component

**Files:**
- Create: `siteforowners/src/app/site/[slug]/admin/_components/RescheduleModal.tsx`

A bottom-sheet (mobile) / centered card (desktop) with a date picker + time slot grid. Reuses `/api/available-slots?exclude_booking_id=`. Handles 409 conflict by asking the owner to confirm before re-submitting with `force: true`.

- [ ] **Step 1: Create the component**

```tsx
// siteforowners/src/app/site/[slug]/admin/_components/RescheduleModal.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingRow } from "@/lib/admin-bookings";

interface RescheduleModalProps {
  row: BookingRow;
  tenantId: string;
  onClose: () => void;
  onDone: () => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function RescheduleModal({ row, tenantId, onClose, onDone }: RescheduleModalProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(row.booking_date);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<{ customerName: string } | null>(null);

  // Build the next 30 days for the date strip.
  const dates: Date[] = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }

  useEffect(() => {
    setSelectedTime(null);
    setSlots([]);
    const url = `/api/available-slots?tenant_id=${tenantId}&date=${selectedDate}&duration=${row.duration_minutes}&exclude_booking_id=${row.id}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setSlots((data?.slots as string[]) ?? []))
      .catch(() => setSlots([]));
  }, [selectedDate, tenantId, row.id, row.duration_minutes]);

  async function submit(force: boolean) {
    if (!selectedTime || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/bookings/${row.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_date: selectedDate, new_time: selectedTime, force }),
      });
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        setConflict({ customerName: d?.conflict?.customer_name || "another customer" });
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not reschedule");
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center md:items-center"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold mb-1">
          Move {row.customer_name}&rsquo;s booking
        </div>
        <div className="text-xs text-gray-600 mb-3">
          Currently: {row.booking_date} at {row.booking_time}
        </div>

        <div className="overflow-x-auto -mx-4 px-4 mb-3">
          <div className="flex gap-2">
            {dates.map((d) => {
              const iso = isoDate(d);
              const selected = iso === selectedDate;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDate(iso)}
                  className={`flex-shrink-0 w-14 py-2 rounded-lg text-center text-xs ${selected ? "bg-[var(--admin-primary)] text-white" : "bg-gray-100 text-gray-700"}`}
                >
                  <div className="opacity-80">{DAYS[d.getDay()]}</div>
                  <div className="font-semibold">{d.getDate()}</div>
                  <div className="opacity-60 text-[10px]">{MONTHS[d.getMonth()]}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 max-h-48 overflow-y-auto">
          {slots.length === 0 ? (
            <div className="col-span-3 text-xs text-gray-500 text-center py-4">No slots available on this date.</div>
          ) : slots.map((t) => {
            const selected = t === selectedTime;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTime(t)}
                className={`py-2 rounded-lg text-sm font-medium ${selected ? "bg-[var(--admin-primary)] text-white" : "bg-gray-100 text-gray-700"}`}
              >
                {t}
              </button>
            );
          })}
        </div>

        {conflict && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-3 text-sm">
            <p className="text-amber-900 mb-2">
              That slot has another booking with <strong>{conflict.customerName}</strong>. Schedule anyway?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setConflict(null); submit(true); }}
                className="flex-1 bg-amber-600 text-white py-2 rounded text-sm font-semibold"
              >
                Schedule anyway
              </button>
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="flex-1 bg-white border border-gray-300 py-2 rounded text-sm"
              >
                Pick another time
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedTime || submitting || conflict !== null}
            onClick={() => submit(false)}
            className="flex-1 bg-[var(--admin-primary)] text-white py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint 'src/app/site/[slug]/admin/_components/RescheduleModal.tsx'
```

- [ ] **Step 3: Commit**

```bash
git add 'src/app/site/[slug]/admin/_components/RescheduleModal.tsx'
git commit -m "feat(reschedule): owner-side RescheduleModal with date+time picker and conflict override"
```

---

## Task 11: Wire `RescheduleModal` into `BookingActionSheet`

**Files:**
- Modify: `siteforowners/src/app/site/[slug]/admin/_components/BookingActionSheet.tsx`

- [ ] **Step 1: Add the Reschedule button + modal state**

In `BookingActionSheet`:

1. Import the modal: `import { RescheduleModal } from "./RescheduleModal";`
2. Add state: `const [rescheduleOpen, setRescheduleOpen] = useState(false);`
3. The component currently takes a `row` prop. It also needs `tenantId` to pass to the modal — add it to the props interface:

```ts
export function BookingActionSheet({
  row,
  tenantId,
  onClose,
  onStatusChange,
}: {
  row: BookingRowType;
  tenantId: string;
  onClose: () => void;
  onStatusChange: () => void;
}) {
```

(Update callers of `BookingActionSheet` to pass `tenantId` — likely `ScheduleClient.tsx`.)

4. Add a Reschedule button alongside Cancel. Place it just above "Cancel":

```tsx
<button
  type="button"
  disabled={pending}
  onClick={() => setRescheduleOpen(true)}
  className="w-full bg-white border border-blue-600 text-blue-600 font-medium py-3 rounded-lg disabled:opacity-50"
>
  Reschedule
  {row.reschedule_count >= 1 && <span className="ml-2 text-xs opacity-70">(already moved once)</span>}
</button>
```

5. Render the modal conditionally:

```tsx
{rescheduleOpen && (
  <RescheduleModal
    row={row}
    tenantId={tenantId}
    onClose={() => setRescheduleOpen(false)}
    onDone={() => {
      setRescheduleOpen(false);
      onStatusChange();
    }}
  />
)}
```

- [ ] **Step 2: Update `BookingRow` type to include `reschedule_count`**

In `src/lib/admin-bookings.ts`, find the `BookingRow` type and add:

```ts
reschedule_count: number;
```

Find the loader query that selects booking columns and add `reschedule_count` to the select list.

- [ ] **Step 3: Update the `BookingActionSheet` caller to pass `tenantId`**

In `src/app/site/[slug]/admin/schedule/ScheduleClient.tsx` (or wherever `BookingActionSheet` is mounted), pass `tenantId={tenantId}` to it. Confirm the parent already has `tenantId` in scope; if not, thread it through.

- [ ] **Step 4: Type-check + lint**

```bash
npx tsc --noEmit && npx eslint 'src/app/site/[slug]/admin/' src/lib/admin-bookings.ts
```

- [ ] **Step 5: Manual end-to-end smoke test**

1. As owner, open the schedule. Tap a confirmed booking.
2. Confirm "Reschedule" appears in the action sheet.
3. Tap it, pick a new slot, confirm. Booking moves on the calendar.
4. Force a conflict: pick a slot already held by another booking. Confirm the warn-and-confirm flow works.
5. Customer receives a notification email + SMS (if opted in).
6. Verify `reschedule_count` increments in the DB.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/site/[slug]/admin' src/lib/admin-bookings.ts
git commit -m "feat(reschedule): wire RescheduleModal into BookingActionSheet"
```

---

## Final verification

Before merging:

- [ ] Apply migration `023_add_reschedule.sql` in production.
- [ ] Set `RESCHEDULE_TOKEN_SECRET` in Vercel (32-byte hex). Routes 500 without it.
- [ ] Place a real booking → check confirmation email shows Reschedule button.
- [ ] Click the link, reschedule, verify customer + owner emails fire.
- [ ] As owner, reschedule another booking from admin, verify customer notified.
- [ ] Force a 24h-cutoff fallback (book something <24h out, click Reschedule link, see fallback page).
- [ ] Force the already-rescheduled fallback (reschedule once, click the new email's button — should be omitted; click an old email's button — fallback shows).
- [ ] All tests pass: `npx tsx --test $(find src -name "*.test.ts")`
