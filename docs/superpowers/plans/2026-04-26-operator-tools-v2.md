# Operator Tools v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-tab admin schedule with a week-view calendar plus rewritten hours editor; add Twilio SMS for owner notify, customer confirmation, and day-before reminder via Vercel Cron.

**Architecture:** Pure logic isolated in `src/lib/sms.ts` (Twilio wrapper, E.164 normalization, due-reminder predicate — all unit-testable). New `WeekCalendar` / `DayAgenda` components render the schedule page; `HoursEditor` is rewritten in place. The booking flow gains a single new field (`customer_sms_opt_in`); SMS sends fire alongside existing email sends in `Promise.allSettled`. A Vercel Cron route polls daily at 09:00 UTC for due reminders.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (Postgres + JSONB), Tailwind, `node:test` + `tsx` for tests, Twilio SDK for SMS, Vercel Cron Jobs for scheduling.

**Spec:** [docs/superpowers/specs/2026-04-26-operator-tools-v2-design.md](../specs/2026-04-26-operator-tools-v2-design.md)

**Test command pattern:** `npx tsx --test src/lib/<file>.test.ts`

**Build/typecheck command:** `npm run build` (Next.js handles tsc)

**Suggested PR split (optional):**
- PR A — Tasks 1–6 + 11: DB, SMS module, API changes, booking-modal opt-in checkbox. Ships SMS without changing schedule UI.
- PR B — Tasks 7–10: schedule page rewrite (WeekCalendar + DayAgenda + HoursEditor + page integration). Ships calendar redesign separately.
- Or one combined PR — also fine.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/016_schedule_v2_and_sms.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/016_schedule_v2_and_sms.sql`:

```sql
-- Adds SMS opt-in tracking on bookings, an owner SMS-receiving phone,
-- and an index supporting the daily reminder cron query.

-- 1. SMS opt-in + reminder sent flag on each booking
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_sms_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS sms_reminder_sent boolean NOT NULL DEFAULT false;

-- 2. Owner SMS-receiving phone. Falls back to tenants.phone if NULL when sending.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sms_phone text;

-- 3. Partial index on the cron's "due reminders" query: scans confirmed
-- bookings on a given date that haven't received their reminder yet.
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_due
  ON bookings (booking_date, status)
  WHERE sms_reminder_sent = false;
```

- [ ] **Step 2: Verify the file**

Run: `head -20 supabase/migrations/016_schedule_v2_and_sms.sql`
Expected: shows the SQL above.

Do NOT apply the migration. The user runs `supabase db push` manually.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_schedule_v2_and_sms.sql
git commit -m "feat(db): add SMS opt-in, reminder tracking, owner sms_phone"
```

---

## Task 2: Install Twilio SDK

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install twilio`
Expected: `package.json` gains `"twilio": "^X.Y.Z"` under `dependencies`. `package-lock.json` updates.

- [ ] **Step 2: Confirm no peer-dep warnings**

Run: `npm ls twilio`
Expected: a single `twilio@X.Y.Z` line, no extraneous warnings.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add twilio dependency for SMS sends"
```

---

## Task 3: SMS module (TDD)

**Files:**
- Create: `src/lib/sms.ts`
- Create: `src/lib/sms.test.ts`

The module is pure where possible — `toE164` and `isReminderDue` are testable without mocking Twilio. The send functions short-circuit when env vars are missing, so importing the module in tests doesn't require a Twilio account.

- [ ] **Step 1: Write the failing test for `toE164`**

Create `src/lib/sms.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164 } from "./sms";

test("toE164: 10-digit US number gets +1 prefix", () => {
  assert.equal(toE164("5551234567"), "+15551234567");
});

test("toE164: dashes and parens stripped", () => {
  assert.equal(toE164("(555) 123-4567"), "+15551234567");
  assert.equal(toE164("555-123-4567"), "+15551234567");
});

test("toE164: 11-digit starting with 1 → +1...", () => {
  assert.equal(toE164("15551234567"), "+15551234567");
});

test("toE164: existing E.164 input stays as-is (digits-only normalized)", () => {
  assert.equal(toE164("+15551234567"), "+15551234567");
  assert.equal(toE164("+1 (555) 123-4567"), "+15551234567");
});

test("toE164: unrecognized garbage returns null", () => {
  assert.equal(toE164(""), null);
  assert.equal(toE164("abc"), null);
  assert.equal(toE164("123"), null);
});

test("toE164: empty string returns null", () => {
  assert.equal(toE164("   "), null);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx tsx --test src/lib/sms.test.ts`
Expected: import error (module doesn't exist).

- [ ] **Step 3: Implement `toE164`**

Create `src/lib/sms.ts`:

```ts
// SMS via Twilio. Pure helpers (toE164, isReminderDue) are testable;
// the send functions short-circuit when TWILIO_* env vars are missing
// so dev environments without Twilio still work normally.
//
// v1 assumptions:
//   - US/Canada numbers only (+1 default country code)
//   - Single shared TWILIO_FROM number (no per-tenant numbers)
//   - Twilio's automatic STOP handling is sufficient (no webhook)

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Normalize a raw phone string to Twilio's required E.164 format.
 * Returns null for inputs that can't be confidently normalized.
 */
export function toE164(raw: string, defaultCountry = "1"): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+") && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
```

- [ ] **Step 4: Run, expect 6 passing tests**

Run: `npx tsx --test src/lib/sms.test.ts`
Expected: `# tests 6`, `# pass 6`.

- [ ] **Step 5: Add failing tests for `isReminderDue`**

Append to `src/lib/sms.test.ts`:

```ts
import { isReminderDue, type ReminderRow } from "./sms";

function row(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "b1",
    booking_date: "2026-05-02",
    status: "confirmed",
    customer_sms_opt_in: true,
    sms_reminder_sent: false,
    ...overrides,
  };
}

test("isReminderDue: true for confirmed + opted-in + not-sent + matching date", () => {
  assert.equal(isReminderDue(row(), "2026-05-02"), true);
});

test("isReminderDue: false when status is not confirmed", () => {
  assert.equal(isReminderDue(row({ status: "canceled" }), "2026-05-02"), false);
  assert.equal(isReminderDue(row({ status: "completed" }), "2026-05-02"), false);
  assert.equal(isReminderDue(row({ status: "no_show" }), "2026-05-02"), false);
});

test("isReminderDue: false when customer did not opt in", () => {
  assert.equal(isReminderDue(row({ customer_sms_opt_in: false }), "2026-05-02"), false);
});

test("isReminderDue: false when reminder already sent", () => {
  assert.equal(isReminderDue(row({ sms_reminder_sent: true }), "2026-05-02"), false);
});

test("isReminderDue: false when date does not match tomorrow", () => {
  assert.equal(isReminderDue(row({ booking_date: "2026-05-01" }), "2026-05-02"), false);
  assert.equal(isReminderDue(row({ booking_date: "2026-05-03" }), "2026-05-02"), false);
});
```

- [ ] **Step 6: Run, expect failure**

Run: `npx tsx --test src/lib/sms.test.ts`
Expected: `isReminderDue` not exported, import error.

- [ ] **Step 7: Implement `isReminderDue` and `tomorrowIsoUtc`**

Append to `src/lib/sms.ts`:

```ts
export type ReminderRow = {
  id: string;
  booking_date: string;
  status: string;
  customer_sms_opt_in: boolean;
  sms_reminder_sent: boolean;
};

/**
 * Belt-and-suspenders predicate: even though the SQL filters on these
 * conditions, re-check in app code so a typo in the query can't ship
 * a reminder to a canceled booking.
 */
export function isReminderDue(row: ReminderRow, tomorrowIso: string): boolean {
  return (
    row.status === "confirmed" &&
    row.customer_sms_opt_in === true &&
    row.sms_reminder_sent === false &&
    row.booking_date === tomorrowIso
  );
}

/**
 * Returns the YYYY-MM-DD date string for "tomorrow" in UTC, given a
 * reference `now`. Pure: no `Date.now()` reads inside.
 */
export function tomorrowIsoUtc(now: Date): string {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return t.toISOString().slice(0, 10);
}
```

- [ ] **Step 8: Add `tomorrowIsoUtc` test**

Append to `src/lib/sms.test.ts`:

```ts
import { tomorrowIsoUtc } from "./sms";

test("tomorrowIsoUtc: returns next-day ISO in UTC", () => {
  assert.equal(tomorrowIsoUtc(new Date("2026-05-01T12:00:00Z")), "2026-05-02");
  assert.equal(tomorrowIsoUtc(new Date("2026-05-31T23:59:00Z")), "2026-06-01");
  assert.equal(tomorrowIsoUtc(new Date("2026-12-31T23:59:00Z")), "2027-01-01");
});
```

- [ ] **Step 9: Run, expect 10 tests passing total**

Run: `npx tsx --test src/lib/sms.test.ts`
Expected: `# tests 10`, `# pass 10`.

- [ ] **Step 10: Add the three send functions (no test — they wrap the Twilio SDK)**

Append to `src/lib/sms.ts`:

```ts
export interface BookingSmsData {
  businessName: string;
  serviceName: string;
  date: string;          // "Sat May 2"
  time: string;          // "10:00 AM – 1:00 PM"
  customerName: string;
  customerPhone: string;
  businessAddress?: string;
}

async function send(to: string, body: string): Promise<void> {
  if (!client || !fromNumber) return;
  const normalized = toE164(to);
  if (!normalized) {
    console.warn("[sms] could not normalize destination phone", { to });
    return;
  }
  try {
    await client.messages.create({ from: fromNumber, to: normalized, body });
  } catch (err) {
    console.error("[sms] send failed", { to: normalized, err });
  }
}

export async function sendBookingOwnerNotification(ownerPhone: string, b: BookingSmsData): Promise<void> {
  if (!ownerPhone) return;
  await send(
    ownerPhone,
    `🔔 New booking: ${b.customerName}, ${b.serviceName}, ${b.date} @ ${b.time}.`,
  );
}

export async function sendBookingCustomerConfirmation(b: BookingSmsData): Promise<void> {
  const addr = b.businessAddress ? ` Address: ${b.businessAddress}.` : "";
  await send(
    b.customerPhone,
    `Hi ${b.customerName.split(" ")[0]}! Your appointment at ${b.businessName} is confirmed for ${b.date} @ ${b.time}.${addr} Reply STOP to opt out.`,
  );
}

export async function sendBookingCustomerReminder(b: BookingSmsData): Promise<void> {
  const startTime = b.time.split(" – ")[0];
  await send(
    b.customerPhone,
    `Reminder: your appointment at ${b.businessName} is tomorrow (${b.date}) at ${startTime}. See you then!`,
  );
}
```

- [ ] **Step 11: Build to typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 12: Commit**

```bash
git add src/lib/sms.ts src/lib/sms.test.ts
git commit -m "feat(sms): add Twilio wrapper with E.164 normalization + due-reminder predicate"
```

---

## Task 4: `/api/create-booking` accepts opt-in + fires SMS

**Files:**
- Modify: `src/app/api/create-booking/route.ts`

- [ ] **Step 1: Add the imports**

At the top of `src/app/api/create-booking/route.ts`, add to the existing imports block:

```ts
import {
  sendBookingOwnerNotification,
  sendBookingCustomerConfirmation,
  type BookingSmsData,
} from "@/lib/sms";
import { formatTimeRange } from "@/lib/availability";  // already imported in some other files; add here too
```

(If `formatTimeRange` is already imported, skip the second line.)

- [ ] **Step 2: Destructure `customer_sms_opt_in` from the body**

Find the destructure block (around lines 11-22 — open the file). Add `customer_sms_opt_in` to the destructure:

```ts
const {
  preview_slug,
  service_name,
  service_price,
  duration_minutes,
  booking_date,
  booking_time,
  customer_name,
  customer_phone,
  customer_email,
  customer_notes,
  customer_sms_opt_in,
} = body;
```

Right after the existing `durationMinutes` validation block, add:

```ts
const smsOptIn = customer_sms_opt_in === true;
```

- [ ] **Step 3: Persist `customer_sms_opt_in` on the inserted row**

Find the `.insert(...)` call (around lines 78-92). Add the new field:

```ts
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
  customer_sms_opt_in: smsOptIn,
})
```

- [ ] **Step 4: Fire SMS in the existing `Promise.allSettled` block**

Find the `Promise.allSettled([...])` block at the end of the route (currently sends `sendBookingNotification` and `sendBookingConfirmation`). Look up the owner SMS phone from the tenant — fetch alongside or reuse if already loaded. Add the SMS calls:

```ts
// Look up owner SMS phone (falls back to tenants.phone)
let ownerSmsPhone = "";
if (tenantId) {
  const { data: t } = await supabase
    .from("tenants")
    .select("sms_phone, phone")
    .eq("id", tenantId)
    .maybeSingle();
  ownerSmsPhone = (t?.sms_phone as string | null) ?? (t?.phone as string | null) ?? "";
}

const smsData: BookingSmsData = {
  businessName,
  serviceName: service_name,
  date: dateStr,
  time: formatTimeRange(booking_time, durationMinutes),
  customerName: customer_name,
  customerPhone: customer_phone,
  businessAddress: businessAddress || undefined,
};

Promise.allSettled([
  sendBookingNotification(ownerEmail, emailData, icsContent),
  sendBookingConfirmation(emailData, icsContent),
  sendBookingOwnerNotification(ownerSmsPhone, smsData),
  smsOptIn ? sendBookingCustomerConfirmation(smsData) : Promise.resolve(),
]).then((results) => {
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("Booking notification failed:", r.reason);
    }
  }
});
```

- [ ] **Step 5: Build + run availability tests**

Run:
```bash
npm run build
npx tsx --test src/lib/sms.test.ts
npx tsx --test src/lib/availability.test.ts
```
All three must succeed. Build clean, 10 SMS tests pass, 31 availability tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/create-booking/route.ts
git commit -m "feat(api): accept customer_sms_opt_in + fire SMS sends on new booking"
```

---

## Task 5: `/api/cron/send-reminders` + Vercel Cron config

**Files:**
- Create: `src/app/api/cron/send-reminders/route.ts`
- Create or modify: `vercel.json`

- [ ] **Step 1: Create the cron route**

Create `src/app/api/cron/send-reminders/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingCustomerReminder,
  isReminderDue,
  tomorrowIsoUtc,
  type BookingSmsData,
  type ReminderRow,
} from "@/lib/sms";
import { formatTimeRange } from "@/lib/availability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tomorrowIso = tomorrowIsoUtc(new Date());

  // INNER JOIN tenants → drops orphan bookings (preview/marketing artifacts).
  const { data: rows, error } = await supabase
    .from("bookings")
    .select(`
      id, booking_date, booking_time, duration_minutes, status,
      customer_name, customer_phone, customer_sms_opt_in, sms_reminder_sent,
      service_name, tenants!inner(business_name, address)
    `)
    .eq("booking_date", tomorrowIso)
    .eq("status", "confirmed")
    .eq("customer_sms_opt_in", true)
    .eq("sms_reminder_sent", false);

  if (error) {
    console.error("[cron/send-reminders] query failed", { error });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    // Belt-and-suspenders: re-check the predicate even though SQL filtered.
    const reminderRow: ReminderRow = {
      id: r.id as string,
      booking_date: r.booking_date as string,
      status: r.status as string,
      customer_sms_opt_in: r.customer_sms_opt_in as boolean,
      sms_reminder_sent: r.sms_reminder_sent as boolean,
    };
    if (!isReminderDue(reminderRow, tomorrowIso)) continue;

    const tenant = (r as { tenants?: { business_name?: string; address?: string } }).tenants;
    const dateLabel = formatDateLabel(r.booking_date as string);
    const smsData: BookingSmsData = {
      businessName: tenant?.business_name ?? "your appointment",
      serviceName: r.service_name as string,
      date: dateLabel,
      time: formatTimeRange(r.booking_time as string, (r.duration_minutes as number) ?? 60),
      customerName: r.customer_name as string,
      customerPhone: r.customer_phone as string,
      businessAddress: tenant?.address ?? undefined,
    };

    try {
      await sendBookingCustomerReminder(smsData);
      const { error: upErr } = await supabase
        .from("bookings")
        .update({ sms_reminder_sent: true })
        .eq("id", r.id);
      if (upErr) {
        console.error("[cron/send-reminders] flag update failed", { id: r.id, upErr });
        failed++;
      } else {
        sent++;
      }
    } catch (e) {
      console.error("[cron/send-reminders] send threw", { id: r.id, e });
      failed++;
    }
  }

  return NextResponse.json({ tomorrow: tomorrowIso, sent, failed });
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
```

- [ ] **Step 2: Create or update `vercel.json`**

If `vercel.json` doesn't exist, create it:

```json
{
  "crons": [
    { "path": "/api/cron/send-reminders", "schedule": "0 9 * * *" }
  ]
}
```

If it exists, add the `crons` array (or append to an existing one). Run `cat vercel.json` first to confirm starting state.

- [ ] **Step 3: Build to typecheck**

Run: `npm run build`
Expected: success. The new route appears in the build output as a dynamic route.

- [ ] **Step 4: Manual local check (optional but recommended)**

Run: `npm run dev` in one shell. In another:

```bash
# With CRON_SECRET set in .env.local:
curl -i http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```
Expected: `200 {"tomorrow":"YYYY-MM-DD","sent":0,"failed":0}` (assuming no test bookings exist for tomorrow).

```bash
# Without auth header:
curl -i http://localhost:3000/api/cron/send-reminders
```
Expected: `401 {"error":"Unauthorized"}`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/send-reminders/route.ts vercel.json
git commit -m "feat(api): add daily reminder cron at 09:00 UTC"
```

---

## Task 6: `/api/admin/tenants/sms-phone` (owner-auth)

**Files:**
- Create: `src/app/api/admin/tenants/sms-phone/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/admin/tenants/sms-phone/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/sms";

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const raw = (body as Record<string, unknown>).sms_phone;
  let smsPhone: string | null = null;
  if (raw === null || raw === "" || raw === undefined) {
    smsPhone = null;
  } else if (typeof raw === "string") {
    const normalized = toE164(raw);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid phone format" }, { status: 400 });
    }
    smsPhone = normalized;
  } else {
    return NextResponse.json({ error: "sms_phone must be a string or null" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tenants")
    .update({ sms_phone: smsPhone })
    .eq("id", session.tenant.id);
  if (error) {
    console.error("[admin/tenants/sms-phone] update failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sms_phone: smsPhone });
}
```

- [ ] **Step 2: Build to typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/tenants/sms-phone/route.ts
git commit -m "feat(api): add owner endpoint to set tenants.sms_phone"
```

---

## Task 7: Rewrite `HoursEditor`

**Files:**
- Rewrite: `src/app/site/[slug]/admin/_components/HoursEditor.tsx`

The current 106-line component uses text inputs for "10:00 AM" / "7:00 PM" — error-prone. Replace with a per-day toggle + native `<input type="time">` + quick presets.

- [ ] **Step 1: Read the current shape so we know what `working_hours` JSON looks like**

Run: `cat src/app/site/[slug]/admin/_components/HoursEditor.tsx | head -25`

Confirm: state is `Record<string, { open: string; close: string } | null>` where the strings are 12-hour like `"10:00 AM"`. The save endpoint is `POST /api/admin/bookings/hours`.

- [ ] **Step 2: Rewrite the file**

Replace the full contents of `src/app/site/[slug]/admin/_components/HoursEditor.tsx`:

```tsx
"use client";

import { useState } from "react";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

const DEFAULT_HOURS: WorkingHours = {
  Monday: { open: "10:00 AM", close: "7:00 PM" },
  Tuesday: { open: "10:00 AM", close: "7:00 PM" },
  Wednesday: { open: "10:00 AM", close: "7:00 PM" },
  Thursday: { open: "10:00 AM", close: "7:00 PM" },
  Friday: { open: "10:00 AM", close: "7:00 PM" },
  Saturday: { open: "10:00 AM", close: "5:00 PM" },
  Sunday: null,
};

const PRESETS: { label: string; hours: WorkingHours }[] = [
  {
    label: "Standard 10–7",
    hours: {
      Monday: { open: "10:00 AM", close: "7:00 PM" },
      Tuesday: { open: "10:00 AM", close: "7:00 PM" },
      Wednesday: { open: "10:00 AM", close: "7:00 PM" },
      Thursday: { open: "10:00 AM", close: "7:00 PM" },
      Friday: { open: "10:00 AM", close: "7:00 PM" },
      Saturday: { open: "10:00 AM", close: "5:00 PM" },
      Sunday: null,
    },
  },
  {
    label: "Early 8–5",
    hours: {
      Monday: { open: "8:00 AM", close: "5:00 PM" },
      Tuesday: { open: "8:00 AM", close: "5:00 PM" },
      Wednesday: { open: "8:00 AM", close: "5:00 PM" },
      Thursday: { open: "8:00 AM", close: "5:00 PM" },
      Friday: { open: "8:00 AM", close: "5:00 PM" },
      Saturday: null,
      Sunday: null,
    },
  },
  {
    label: "Closed weekends",
    hours: {
      Monday: { open: "10:00 AM", close: "7:00 PM" },
      Tuesday: { open: "10:00 AM", close: "7:00 PM" },
      Wednesday: { open: "10:00 AM", close: "7:00 PM" },
      Thursday: { open: "10:00 AM", close: "7:00 PM" },
      Friday: { open: "10:00 AM", close: "7:00 PM" },
      Saturday: null,
      Sunday: null,
    },
  },
];

// "10:00 AM" → "10:00" (24h)
function to24h(s: string): string {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return s;
  let h = Number(m[1]);
  const mi = m[2];
  const period = m[3].toUpperCase();
  if (h === 12) h = 0;
  if (period === "PM") h += 12;
  return `${h.toString().padStart(2, "0")}:${mi}`;
}

// "10:00" (24h) → "10:00 AM"
function to12h(s: string): string {
  const [hStr, mStr] = s.split(":");
  let h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr ?? "00"} ${period}`;
}

export function HoursEditor({ initial }: { initial: WorkingHours | null }) {
  const [hours, setHours] = useState<WorkingHours>(initial ?? DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setDay(day: string, next: DayHours | null) {
    setHours((h) => ({ ...h, [day]: next }));
    setSaved(false);
  }

  function applyPreset(preset: WorkingHours) {
    setHours(preset);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/bookings/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not save hours");
        return;
      }
      setSaved(true);
    } catch {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Quick presets:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.hours)}
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {WEEKDAYS.map((day) => {
          const value = hours[day];
          const isOpen = value !== null;
          return (
            <div key={day} className="px-4 py-3 flex items-center gap-3">
              <div className="w-24 text-sm font-medium">{day}</div>
              <button
                type="button"
                onClick={() => setDay(day, isOpen ? null : { open: "10:00 AM", close: "7:00 PM" })}
                className={`text-xs px-2 py-1 rounded ${
                  isOpen
                    ? "bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)]"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {isOpen ? "Open" : "Closed"}
              </button>
              {isOpen && (
                <div className="flex-1 flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    step={3600}
                    value={to24h(value!.open)}
                    onChange={(e) => setDay(day, { open: to12h(e.target.value), close: value!.close })}
                    className="rounded border border-gray-200 px-2 py-1 text-sm"
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    type="time"
                    step={3600}
                    value={to24h(value!.close)}
                    onChange={(e) => setDay(day, { open: value!.open, close: to12h(e.target.value) })}
                    className="rounded border border-gray-200 px-2 py-1 text-sm"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100">
        <span className="text-xs text-gray-500">
          {saved ? "✓ Saved" : saving ? "Saving..." : " "}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Save hours
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/site/[slug]/admin/_components/HoursEditor.tsx
git commit -m "feat(schedule): rewrite HoursEditor with native time inputs + quick presets"
```

---

## Task 8: `WeekCalendar` component (desktop)

**Files:**
- Create: `src/app/site/[slug]/admin/_components/WeekCalendar.tsx`

Renders a 7-column × hour-row grid. Each booking is a colored block spanning its `duration_minutes`. Closed days (per `working_hours`) and blocked days (per `blocked_dates`) get a striped background. Click a day header → popover with "Closed this day" toggle. Click a booking → calls a parent-supplied callback (parent renders the action sheet).

- [ ] **Step 1: Create the file**

Create `src/app/site/[slug]/admin/_components/WeekCalendar.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { parseBookingTime } from "@/lib/availability";

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface WeekCalendarProps {
  weekStart: Date;                           // Sunday or Monday — see startsOnMonday
  bookings: BookingRow[];                    // bookings whose date falls in [weekStart, weekStart+7)
  workingHours: WorkingHours | null;
  blockedDates: string[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onBookingClick: (row: BookingRow) => void;
  onToggleDayBlock: (isoDate: string, blocked: boolean) => Promise<void>;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

// "10:00" or "10:00 AM" → minutes
function parseClockMinutes(s: string): number {
  try { return parseBookingTime(s); }
  catch {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }
}

const HOUR_PX = 48;     // pixel height of one hour row

export function WeekCalendar({
  weekStart,
  bookings,
  workingHours,
  blockedDates,
  onPrevWeek,
  onNextWeek,
  onToday,
  onBookingClick,
  onToggleDayBlock,
}: WeekCalendarProps) {
  const [popoverDay, setPopoverDay] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Compute the visible hour range across the 7 days.
  const { firstHour, lastHour } = useMemo(() => {
    let minOpen = 10 * 60;
    let maxClose = 19 * 60;
    if (workingHours) {
      const opens: number[] = [];
      const closes: number[] = [];
      for (const day of DAYS_FULL) {
        const w = workingHours[day];
        if (w) {
          opens.push(parseClockMinutes(w.open));
          closes.push(parseClockMinutes(w.close));
        }
      }
      if (opens.length > 0) minOpen = Math.min(...opens);
      if (closes.length > 0) maxClose = Math.max(...closes);
    }
    return {
      firstHour: Math.floor(minOpen / 60),
      lastHour: Math.ceil(maxClose / 60),
    };
  }, [workingHours]);

  const days = useMemo(() => {
    const out: { date: Date; iso: string; weekdayName: string; weekdayShort: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      out.push({
        date: d,
        iso: isoDate(d),
        weekdayName: DAYS_FULL[d.getDay()],
        weekdayShort: DAYS_SHORT[d.getDay()],
      });
    }
    return out;
  }, [weekStart]);

  const today = isoDate(new Date());
  const monthLabel = `${weekStart.toLocaleString("en-US", { month: "long" })} ${weekStart.getDate()} – ${addDays(weekStart, 6).toLocaleString("en-US", { month: "long" })} ${addDays(weekStart, 6).getDate()}, ${addDays(weekStart, 6).getFullYear()}`;

  async function toggleBlock(iso: string) {
    if (pending) return;
    const isBlocked = blockedDates.includes(iso);
    setPending(true);
    try {
      await onToggleDayBlock(iso, !isBlocked);
      setPopoverDay(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header pager */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button onClick={onPrevWeek} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">‹</button>
          <button onClick={onToday} className="px-3 py-1 text-sm hover:bg-gray-50 rounded">Today</button>
          <button onClick={onNextWeek} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">›</button>
        </div>
        <div className="text-sm font-semibold text-gray-900">{monthLabel}</div>
        <div className="w-20" />
      </div>

      {/* Week grid */}
      <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
        {/* Day headers */}
        <div />
        {days.map((d) => {
          const isToday = d.iso === today;
          const dayClosed = workingHours?.[d.weekdayName] === null || blockedDates.includes(d.iso);
          return (
            <div key={d.iso} className="relative border-l border-gray-100">
              <button
                type="button"
                onClick={() => setPopoverDay(popoverDay === d.iso ? null : d.iso)}
                className={`w-full px-2 py-2 text-center ${isToday ? "bg-[var(--admin-primary-light)]" : ""}`}
              >
                <div className={`text-[10px] font-semibold ${isToday ? "text-[color:var(--admin-primary)]" : "text-gray-500"}`}>
                  {d.weekdayShort} {d.date.getDate()}
                </div>
                {dayClosed && <div className="text-[9px] text-[color:var(--admin-primary)]">Closed</div>}
              </button>
              {popoverDay === d.iso && (
                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs w-40">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggleBlock(d.iso)}
                    className="w-full text-left px-2 py-2 hover:bg-gray-50 rounded"
                  >
                    {blockedDates.includes(d.iso) ? "Reopen this day" : "Closed this day"}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Hour rows */}
        {Array.from({ length: lastHour - firstHour }, (_, i) => {
          const h = firstHour + i;
          const period = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 === 0 ? 12 : h % 12;
          return (
            <div key={`row-${h}`} className="contents">
              <div className="text-[10px] text-right pr-1 text-gray-400" style={{ height: HOUR_PX, lineHeight: `${HOUR_PX}px` }}>
                {h12}{period === "AM" ? "a" : "p"}
              </div>
              {days.map((d) => {
                const wh = workingHours?.[d.weekdayName];
                const dayClosed = wh === null;
                const dayBlocked = blockedDates.includes(d.iso);
                const striped = dayClosed || dayBlocked;
                return (
                  <div
                    key={`${d.iso}-${h}`}
                    className="border-l border-t border-gray-100 relative"
                    style={{
                      height: HOUR_PX,
                      backgroundImage: striped
                        ? "repeating-linear-gradient(45deg, var(--admin-primary-light, #fed7e2), var(--admin-primary-light, #fed7e2) 4px, white 4px, white 8px)"
                        : undefined,
                    }}
                  />
                );
              })}
            </div>
          );
        })}

        {/* Booking blocks (absolute-positioned overlay per day column) */}
        {days.map((d, dayIdx) => {
          const dayBookings = bookings.filter(
            (b) => b.booking_date === d.iso && b.status === "confirmed",
          );
          return (
            <div
              key={`overlay-${d.iso}`}
              className="absolute pointer-events-none"
              style={{
                gridColumn: dayIdx + 2,
                gridRow: `2 / span ${lastHour - firstHour}`,
                position: "relative",
              }}
            >
              {dayBookings.map((b) => {
                const startMin = parseBookingTime(b.booking_time);
                const startHourFloat = startMin / 60;
                const top = (startHourFloat - firstHour) * HOUR_PX;
                const height = ((b.duration_minutes ?? 60) / 60) * HOUR_PX - 1;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onBookingClick(b)}
                    className="absolute left-0.5 right-0.5 rounded text-[10px] text-left px-1 py-0.5 pointer-events-auto overflow-hidden"
                    style={{
                      top,
                      height,
                      backgroundColor: "var(--admin-primary)",
                      color: "white",
                    }}
                  >
                    <div className="font-semibold truncate">{b.customer_name}</div>
                    <div className="opacity-80 truncate">{b.service_name}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/site/[slug]/admin/_components/WeekCalendar.tsx
git commit -m "feat(schedule): add WeekCalendar component (desktop hour grid)"
```

---

## Task 9: `DayAgenda` component (mobile)

**Files:**
- Create: `src/app/site/[slug]/admin/_components/DayAgenda.tsx`

A vertical list of hours for a single day. Each hour row is either a booking block or "Open" with a small "Block" link (toggles the whole day).

- [ ] **Step 1: Create the file**

Create `src/app/site/[slug]/admin/_components/DayAgenda.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { parseBookingTime, formatTimeRange } from "@/lib/availability";

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface DayAgendaProps {
  date: Date;
  bookings: BookingRow[];                    // all bookings for this date
  workingHours: WorkingHours | null;
  blockedDates: string[];
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onBookingClick: (row: BookingRow) => void;
  onToggleDayBlock: (isoDate: string, blocked: boolean) => Promise<void>;
}

function parseClockMinutes(s: string): number {
  try { return parseBookingTime(s); }
  catch {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DayAgenda({
  date,
  bookings,
  workingHours,
  blockedDates,
  onPrevDay,
  onNextDay,
  onToday,
  onBookingClick,
  onToggleDayBlock,
}: DayAgendaProps) {
  const iso = isoDate(date);
  const weekdayName = DAYS_FULL[date.getDay()];
  const wh = workingHours?.[weekdayName];
  const dayBlocked = blockedDates.includes(iso);
  const dayClosed = wh === null;
  const [pending, setPending] = useState(false);

  const headerLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const hourRows = useMemo(() => {
    if (!wh) return [];
    const startH = Math.ceil(parseClockMinutes(wh.open) / 60);
    const endH = Math.floor(parseClockMinutes(wh.close) / 60);
    const rows: number[] = [];
    for (let h = startH; h < endH; h++) rows.push(h);
    return rows;
  }, [wh]);

  // Group bookings by their starting hour for quick lookup.
  const bookingsByHour = useMemo(() => {
    const map = new Map<number, BookingRow>();
    for (const b of bookings) {
      if (b.status !== "confirmed") continue;
      const startH = Math.floor(parseBookingTime(b.booking_time) / 60);
      map.set(startH, b);
    }
    return map;
  }, [bookings]);

  async function toggleBlock() {
    if (pending) return;
    setPending(true);
    try {
      await onToggleDayBlock(iso, !dayBlocked);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={onPrevDay} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">‹</button>
        <div className="flex flex-col items-center">
          <div className="text-sm font-semibold text-gray-900">{headerLabel}</div>
          <button onClick={onToday} className="text-xs text-[color:var(--admin-primary)] hover:underline">
            Today
          </button>
        </div>
        <button onClick={onNextDay} className="px-2 py-1 text-sm hover:bg-gray-50 rounded">›</button>
      </div>

      {dayClosed ? (
        <div className="p-6 text-center text-sm text-gray-500">
          Closed on {weekdayName}s. Adjust in the working-hours editor below.
        </div>
      ) : (
        <>
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {dayBlocked ? "Day is blocked." : `${bookingsByHour.size} booking${bookingsByHour.size === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={toggleBlock}
              className={`text-xs px-2 py-1 rounded ${
                dayBlocked
                  ? "bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)]"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {dayBlocked ? "Reopen" : "Close this day"}
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {hourRows.map((h) => {
              const period = h >= 12 ? "PM" : "AM";
              const h12 = h % 12 === 0 ? 12 : h % 12;
              const booking = bookingsByHour.get(h);
              const striped = dayBlocked;
              return (
                <div
                  key={h}
                  className="px-4 py-3 flex items-center gap-3 text-sm"
                  style={{
                    backgroundImage: striped
                      ? "repeating-linear-gradient(45deg, var(--admin-primary-light, #fed7e2), var(--admin-primary-light, #fed7e2) 4px, white 4px, white 8px)"
                      : undefined,
                  }}
                >
                  <div className="w-16 text-gray-500 text-xs">{`${h12}:00 ${period}`}</div>
                  {booking ? (
                    <button
                      type="button"
                      onClick={() => onBookingClick(booking)}
                      className="flex-1 text-left"
                    >
                      <div className="font-semibold">{booking.customer_name}</div>
                      <div className="text-xs text-gray-500">
                        {booking.service_name} · {formatTimeRange(booking.booking_time, booking.duration_minutes)}
                      </div>
                    </button>
                  ) : (
                    <div className="flex-1 text-gray-400">Open</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/site/[slug]/admin/_components/DayAgenda.tsx
git commit -m "feat(schedule): add DayAgenda component (mobile vertical-hour list)"
```

---

## Task 10: Schedule page rewrite — integrate calendar + hours editor

**Files:**
- Modify: `src/app/site/[slug]/admin/schedule/page.tsx`
- Create: `src/app/site/[slug]/admin/schedule/ScheduleClient.tsx` (new — handles week navigation state)
- Modify: `src/lib/admin-bookings.ts` (add `getBookingsForRange`)
- Delete: `src/app/site/[slug]/admin/_components/BlockDateDialog.tsx`
- Delete: `src/app/site/[slug]/admin/_components/TabBar.tsx` (only if no other admin page uses it — check first)

The page is a server component that fetches data. The new `ScheduleClient` is a client component that holds week navigation state and decides between `WeekCalendar` and `DayAgenda` via `useMediaQuery`.

- [ ] **Step 1: Add `getBookingsForRange` to admin-bookings.ts**

In `src/lib/admin-bookings.ts`, add this exported function (place it after the existing `getUpcomingBookings`):

```ts
/** Bookings whose date is in [startIso, endIso], inclusive. Both YYYY-MM-DD. */
export async function getBookingsForRange(
  tenantId: string,
  startIso: string,
  endIso: string,
): Promise<BookingRow[]> {
  noStore();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, duration_minutes, customer_name, customer_phone, service_name, status")
    .eq("tenant_id", tenantId)
    .gte("booking_date", startIso)
    .lte("booking_date", endIso)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });
  if (error) {
    console.error("[admin-bookings] getBookingsForRange failed", { tenantId, startIso, endIso, error });
    return [];
  }
  return (data ?? []) as BookingRow[];
}
```

- [ ] **Step 2: Check TabBar usage**

Run: `grep -rn "TabBar" src/app/`
Expected: only references in `src/app/site/[slug]/admin/schedule/page.tsx` (the file we're rewriting). If other pages use TabBar, do NOT delete it — only remove its import from the schedule page.

- [ ] **Step 3: Rewrite the page**

Replace the full contents of `src/app/site/[slug]/admin/schedule/page.tsx`:

```tsx
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import {
  getBookingsForRange,
  getBookingSettings,
  getBookingMode,
} from "@/lib/admin-bookings";
import { ScheduleClient } from "./ScheduleClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekSunday(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());  // back to Sunday
  return out;
}

export default async function SchedulePage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const bookingMode = await getBookingMode(tenant.preview_slug);
  if (bookingMode.mode === "external_only") {
    return (
      <div className="py-4 md:py-6">
        <div className="px-4 md:px-8">
          <div className="text-lg font-semibold">Schedule</div>
        </div>
        <div className="px-3 md:px-8 mt-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
            <div className="text-sm text-gray-700">
              You manage bookings in <span className="font-semibold">{bookingMode.providerName}</span>.
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Appointments don&apos;t show up here — open {bookingMode.providerName} to view your calendar.
            </div>
            <a
              href={bookingMode.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg"
            >
              Open {bookingMode.providerName} ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  const weekStart = startOfWeekSunday(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Fetch a slightly wider window so prev/next-week navigation has data without
  // a round-trip on first interaction. The client narrows to the visible week.
  const fetchStart = new Date(weekStart);
  fetchStart.setDate(fetchStart.getDate() - 7);
  const fetchEnd = new Date(weekEnd);
  fetchEnd.setDate(fetchEnd.getDate() + 14);

  const [bookings, settings] = await Promise.all([
    getBookingsForRange(tenant.id, isoDate(fetchStart), isoDate(fetchEnd)),
    getBookingSettings(tenant.id),
  ]);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Schedule</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <ScheduleClient
          initialWeekStart={isoDate(weekStart)}
          bookings={bookings}
          workingHours={settings?.working_hours ?? null}
          blockedDates={settings?.blocked_dates ?? []}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the client component**

Create `src/app/site/[slug]/admin/schedule/ScheduleClient.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { BookingRow } from "@/lib/admin-bookings";
import { WeekCalendar } from "../_components/WeekCalendar";
import { DayAgenda } from "../_components/DayAgenda";
import { HoursEditor } from "../_components/HoursEditor";
import { BookingActionSheet } from "../_components/BookingActionSheet";

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

interface ScheduleClientProps {
  initialWeekStart: string;       // YYYY-MM-DD (Sunday)
  bookings: BookingRow[];
  workingHours: WorkingHours | null;
  blockedDates: string[];
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function ScheduleClient({
  initialWeekStart,
  bookings,
  workingHours,
  blockedDates: initialBlockedDates,
}: ScheduleClientProps) {
  const [weekStart, setWeekStart] = useState<Date>(parseIso(initialWeekStart));
  const [agendaDate, setAgendaDate] = useState<Date>(new Date());
  const [blockedDates, setBlockedDates] = useState<string[]>(initialBlockedDates);
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  async function handleToggleDayBlock(iso: string, blocked: boolean): Promise<void> {
    const res = await fetch("/api/admin/bookings/block-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: blocked ? "add" : "remove", dates: [iso] }),
    });
    if (!res.ok) {
      alert("Could not update");
      return;
    }
    const data = await res.json();
    setBlockedDates((data.blocked_dates as string[]) ?? []);
  }

  return (
    <div className="space-y-4">
      {isMobile ? (
        <DayAgenda
          date={agendaDate}
          bookings={bookings.filter((b) => b.booking_date === formatIso(agendaDate))}
          workingHours={workingHours}
          blockedDates={blockedDates}
          onPrevDay={() => setAgendaDate((d) => addDays(d, -1))}
          onNextDay={() => setAgendaDate((d) => addDays(d, 1))}
          onToday={() => setAgendaDate(new Date())}
          onBookingClick={setActiveBooking}
          onToggleDayBlock={handleToggleDayBlock}
        />
      ) : (
        <WeekCalendar
          weekStart={weekStart}
          bookings={bookings.filter((b) => {
            const wsIso = formatIso(weekStart);
            const weIso = formatIso(addDays(weekStart, 6));
            return b.booking_date >= wsIso && b.booking_date <= weIso;
          })}
          workingHours={workingHours}
          blockedDates={blockedDates}
          onPrevWeek={() => setWeekStart((d) => addDays(d, -7))}
          onNextWeek={() => setWeekStart((d) => addDays(d, 7))}
          onToday={() => {
            const t = new Date();
            t.setDate(t.getDate() - t.getDay());
            t.setHours(0, 0, 0, 0);
            setWeekStart(t);
          }}
          onBookingClick={setActiveBooking}
          onToggleDayBlock={handleToggleDayBlock}
        />
      )}

      <details className="bg-white border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer font-medium text-sm">
          Working hours
        </summary>
        <div className="px-4 pb-4">
          <HoursEditor initial={workingHours} />
        </div>
      </details>

      {activeBooking && (
        <BookingActionSheet
          row={activeBooking}
          onClose={() => setActiveBooking(null)}
          onStatusChange={() => setActiveBooking(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Extract the action sheet from BookingRow into its own component**

Currently the action sheet markup lives inside `BookingRow.tsx`. We need to use it from `ScheduleClient` independently. Create `src/app/site/[slug]/admin/_components/BookingActionSheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { BookingRow as BookingRowType } from "@/lib/admin-bookings";
import { formatTimeRange } from "@/lib/availability";

export function BookingActionSheet({
  row,
  onClose,
  onStatusChange,
}: {
  row: BookingRowType;
  onClose: () => void;
  onStatusChange: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function setStatus(toStatus: string) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: row.id, toStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not update booking");
        return;
      }
      onStatusChange();
    } catch {
      alert("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl md:mb-10 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded mx-auto mb-3 md:hidden" />
        <div className="text-sm font-semibold mb-3">
          {row.customer_name} · {formatTimeRange(row.booking_time, row.duration_minutes)}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("completed")}
            className="w-full bg-[var(--admin-primary)] text-white font-medium py-3 rounded-lg disabled:opacity-50"
          >
            Mark completed
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("no_show")}
            className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-3 rounded-lg disabled:opacity-50"
          >
            Mark no-show
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("canceled")}
            className="w-full bg-white border border-red-600 text-red-600 font-medium py-3 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <a
            href={"tel:" + row.customer_phone}
            className="block w-full text-center bg-white border border-[color:var(--admin-primary)] text-[color:var(--admin-primary)] font-medium py-3 rounded-lg"
          >
            📞 Call customer
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Delete the obsolete components**

Run:
```bash
rm src/app/site/[slug]/admin/_components/BlockDateDialog.tsx
```

If Step 2 confirmed `TabBar.tsx` is only used by the schedule page (which we just rewrote without using it), delete it too:
```bash
rm src/app/site/[slug]/admin/_components/TabBar.tsx
```

If `TabBar.tsx` is used elsewhere, leave it alone.

- [ ] **Step 7: Build to typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add src/app/site/[slug]/admin/schedule/ src/app/site/[slug]/admin/_components/BookingActionSheet.tsx src/lib/admin-bookings.ts
git rm src/app/site/[slug]/admin/_components/BlockDateDialog.tsx
# Only if you deleted TabBar:
git rm src/app/site/[slug]/admin/_components/TabBar.tsx
git commit -m "feat(schedule): rewrite admin schedule with WeekCalendar + DayAgenda + Hours accordion"
```

---

## Task 11: Add SMS opt-in checkbox to the booking modal

**Files:**
- Modify: `src/components/templates/TemplateBooking.tsx`

The customer-info step inside `RealBookingCalendar` collects name / phone / email / notes. Add an opt-in checkbox below the phone field, default checked, and pass its value in the POST body.

- [ ] **Step 1: Find the customer-info step and the handleBook POST body**

Run: `grep -n "customer_phone\|customerPhone\|info.*step\|customerInfo\|fetch.*create-booking" src/components/templates/TemplateBooking.tsx | head -15`

You're looking for two spots:
- The `<input>` for the customer phone field (likely in the `info` step around line 540-580)
- The `fetch("/api/create-booking", ...)` call inside `handleBook` (around line 440-480)

- [ ] **Step 2: Add the state**

Inside `RealBookingCalendar`, add a state hook near the existing `customerPhone` / `customerEmail` state:

```ts
const [customerSmsOptIn, setCustomerSmsOptIn] = useState(true);
```

- [ ] **Step 3: Add the checkbox markup**

Right after the customer-phone `<input>`, add:

```tsx
<label className="flex items-center gap-2 mt-2 text-sm">
  <input
    type="checkbox"
    checked={customerSmsOptIn}
    onChange={(e) => setCustomerSmsOptIn(e.target.checked)}
    className="h-4 w-4"
  />
  <span style={{ color: colors.foreground }}>
    Send me text reminders
  </span>
</label>
```

Match the existing component's spacing / typography conventions — this is illustrative.

- [ ] **Step 4: Send opt-in in the POST body**

In the `handleBook` function, find the `body: JSON.stringify({...})` block. Add `customer_sms_opt_in`:

```ts
body: JSON.stringify({
  preview_slug: previewSlug,
  service_name: selectedService.name,
  service_price: selectedService.price,
  duration_minutes: selectedService.durationMinutes ?? 60,
  booking_date: bookingDateStr,
  booking_time: selectedTime,
  customer_name: customerName.trim(),
  customer_phone: customerPhone.trim(),
  customer_email: customerEmail.trim() || undefined,
  customer_notes: customerNotes.trim() || undefined,
  customer_sms_opt_in: customerSmsOptIn,
}),
```

(Match the actual existing field shape. The new addition is `customer_sms_opt_in: customerSmsOptIn`.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/components/templates/TemplateBooking.tsx
git commit -m "feat(booking-ui): add SMS opt-in checkbox to RealBookingCalendar"
```

---

## Task 12: End-to-end manual verification + open PR

This is a verification + handoff step. Nothing to commit unless you find issues.

- [ ] **Step 1: Apply migration locally**

Run: `supabase db push` (or whatever the project's local-apply command is). Verify with:

```bash
psql "$DATABASE_URL" -c "\d bookings" | grep -E "customer_sms_opt_in|sms_reminder_sent"
psql "$DATABASE_URL" -c "\d tenants" | grep sms_phone
```
Expected: all three columns present.

- [ ] **Step 2: Schedule page in dev**

Run: `npm run dev`. Open `/site/<slug>/admin/schedule` for an in-site tenant.

Confirm:
- Week calendar renders with hour rows.
- An existing 3-hour booking appears as a 3-hour block (Spec 1 dependency).
- Clicking a day header opens the popover; clicking "Closed this day" toggles `blocked_dates` and the day shows the striped pattern after refresh of state.
- Clicking a booking opens the action sheet (Mark completed / no-show / cancel / call).
- Working-hours accordion expands; the time inputs accept changes; "Closed weekends" preset toggles Sat/Sun off.
- Resize the window below 640px → swap to DayAgenda. Pager works. "Close this day" toggles correctly.

- [ ] **Step 3: SMS opt-in checkbox**

Open the public site for the same tenant, start a booking. Confirm the "Send me text reminders" checkbox appears under the phone field, defaults checked. Submit. Inspect the network request — body has `customer_sms_opt_in: true`.

- [ ] **Step 4: SMS sends (only if Twilio env vars are set)**

If `TWILIO_*` is configured locally, make a test booking with your own phone in the customer field. Verify owner gets the "🔔 New booking" SMS and customer gets the confirmation. If Twilio is not configured, skip this step — the no-op pattern means nothing breaks; just no SMS sent.

- [ ] **Step 5: Cron route**

Insert a synthetic booking dated tomorrow with `customer_sms_opt_in = true` (manually via SQL or a real booking). Hit:

```bash
curl -i http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```
Expected: `200 {"tomorrow":"...", "sent":1, "failed":0}`. Hit again — `sent:0` because the flag is set.

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin <branch>
```

Open PR (or two PRs per the suggested split at the top of this plan). Title:
- Combined: `feat: operator tools v2 (schedule redesign + Twilio SMS)`
- PR A: `feat: Twilio SMS for bookings (owner notify, customer confirm, day-before reminder)`
- PR B: `feat: admin schedule redesign (week calendar + hours editor)`

PR body — start from the spec's Test plan section.

---

## Self-review notes

Spec coverage walked end-to-end:

| Spec section | Tasks |
|---|---|
| Migration `016_*` (3 columns + index) | Task 1 |
| `src/lib/sms.ts` (toE164, isReminderDue, tomorrowIsoUtc, 3 send functions) | Task 3 |
| Twilio dependency | Task 2 |
| `/api/create-booking` accepts opt-in + fires SMS | Task 4 |
| `/api/cron/send-reminders` + `vercel.json` | Task 5 |
| `/api/admin/tenants/sms-phone` | Task 6 |
| `HoursEditor` rewrite (toggles + native time inputs + presets) | Task 7 |
| `WeekCalendar` (desktop) | Task 8 |
| `DayAgenda` (mobile) | Task 9 |
| Schedule page rewrite, BookingActionSheet extract, delete BlockDateDialog/TabBar | Task 10 |
| SMS opt-in checkbox in booking modal | Task 11 |
| Manual verification + PR | Task 12 |

Type names verified consistent across tasks: `WorkingHours`, `DayHours`, `BookingRow`, `BookingSmsData`, `ReminderRow`. Function names: `toE164`, `isReminderDue`, `tomorrowIsoUtc`, `sendBookingOwnerNotification`, `sendBookingCustomerConfirmation`, `sendBookingCustomerReminder`, `getBookingsForRange`. No "TBD" / "TODO" / "implement later" placeholders.
