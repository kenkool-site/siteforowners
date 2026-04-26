# Operator Tools v2 — Design

**Date:** 2026-04-26
**Status:** Draft (awaiting user review)
**Scope:** Spec 2 of 2 in the Booking & Scheduling v2 initiative.
Spec 1 (customer-facing booking) shipped in PR #47.

---

## Problem

Two operator-facing pain points block real-world use:

1. **Schedule management is awkward.** The current `/admin/schedule` page is a 3-tab list (Today / Upcoming / Hours). Owners can't see their week at a glance, the working-hours editor uses fragile text inputs ("10:00 AM"), and "Block date" is a tiny link that only handles whole days.
2. **No SMS notifications.** Email works, but the founder asked for SMS for new bookings, customer confirmations, and customer reminders. Twilio account will be configured by the founder; this spec covers the integration.

## Goals

- Replace the 3-tab schedule page with a calendar week view that shows bookings as duration-aware blocks and exposes day-level availability management with one click.
- Improve the working-hours editor to use native time inputs and quick presets.
- Send SMS via Twilio at three transactional events: owner notify on new booking, customer confirm on new booking, customer reminder the day before.

## Non-Goals

Deferred or owned by future specs:

- **Hour-range blocks** ("away Friday 2-5pm"). Working-hours editor handles recurring patterns; whole-day blocks handle one-offs. If a real need emerges, add later.
- **Drag-to-create-block** in the calendar. No hour blocks means no drag UX.
- **Multi-week calendar / month view.** Week is the only view.
- **2-hour-before reminder, daily owner digest, "thank you" follow-up.** Out of scope.
- **Per-tenant Twilio numbers / Messaging Services.** Single shared `TWILIO_FROM`.
- **Owner-customizable SMS templates.** Hardcoded copy in `src/lib/sms.ts`.
- **Booking-cancellation SMS.** Manual phone call still required when canceling.
- **Reply STOP webhook.** Twilio's automatic STOP handling is sufficient.
- **Tenant-local timezone for reminders.** Uses 9am UTC; tenants are mostly EST/CDT.
- **Service categories + add-ons.** Spec 3 (booking flow polish).

---

## Architecture

```
+---------------------------------------------------------------+
|  /admin/schedule                                              |
|  +------------------------------------------------------+     |
|  | WeekCalendar (desktop) / DayAgenda (≤640px)         |     |
|  |  - bookings rendered as duration-aware blocks       |     |
|  |  - day-header click → "Closed this day" toggle      |     |
|  |  - booking click → existing BookingRow action sheet |     |
|  +------------------------------------------------------+     |
|  +------------------------------------------------------+     |
|  | HoursEditor (accordion)                              |     |
|  |  - per-weekday toggle + native <input type="time">   |     |
|  |  - presets: Standard / Early / Closed weekends       |     |
|  +------------------------------------------------------+     |
+---------------------------------------------------------------+

POST /api/create-booking
   ├── insert booking
   ├── Promise.allSettled([
   │     sendBookingNotification (email, owner)         existing
   │     sendBookingConfirmation (email, customer)      existing
   │     sendBookingOwnerNotification (SMS, owner)      new — src/lib/sms.ts
   │     sendBookingCustomerConfirmation (SMS, customer)new
   │   ])
   └── return success

GET /api/cron/send-reminders        (Vercel Cron, daily 09:00 UTC)
   ├── auth: Authorization === Bearer ${CRON_SECRET}
   ├── select bookings WHERE booking_date = tomorrow
   │       AND status = 'confirmed'
   │       AND sms_reminder_sent = false
   │       AND customer_sms_opt_in = true
   ├── for each: sendBookingCustomerReminder + UPDATE sms_reminder_sent = true
   └── return { sent: N, failed: M }
```

## Data Model

Single migration `016_schedule_v2_and_sms.sql`. All idempotent.

```sql
-- 1. SMS opt-in + reminder tracking on bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_sms_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS sms_reminder_sent boolean NOT NULL DEFAULT false;

-- 2. Owner SMS-receiving phone (falls back to tenants.phone if null)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sms_phone text;

-- 3. Index supporting the cron's "due reminders" query
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_due
  ON bookings (booking_date, status)
  WHERE sms_reminder_sent = false;
```

No changes needed to `working_hours` or `blocked_dates`. The schedule UI is pure UI on top of the existing shape.

---

## UI Components

### `WeekCalendar.tsx` (new, desktop)

7-column × hour-row grid. Hour range adapts to the tenant's working-hours envelope (earliest open across the week → latest close), default 10am–7pm.

Rendering:
- Each cell is empty by default.
- Bookings render as colored blocks spanning their `duration_minutes` (a 3-hour booking at 10am occupies 3 cells).
- Closed days (per `working_hours[day] === null`) render as a striped background across the entire column.
- Whole-day blocks (per `blocked_dates`) render the same way.

Interactions:
- Click a **day header** → small popover with one toggle: "Closed this day." Writes to `blocked_dates` via the existing `/api/admin/bookings/block-date` endpoint.
- Click a **booking block** → opens the existing booking action sheet from `BookingRow.tsx` (Mark completed / no-show / cancel / call). The action sheet markup is reused as-is.
- Header navigation: `‹ Today ›` and centered date range "April 27 – May 2, 2026."

### `DayAgenda.tsx` (new, mobile ≤640px)

One day at a time. Vertical list of hours from open to close. Each hour is a row:
- If a booking starts in that hour: row is the booking block (same click → action sheet).
- If empty: row says "Open" with a small "Block" link (which writes to `blocked_dates` for the whole day, not the hour — same semantics as desktop).

Header pager: `‹ Friday May 1 ›`. Closed days render with the striped background.

### `HoursEditor.tsx` (rewrite)

Replaces the existing 106-line component. Same data shape (`Record<weekday, {open, close} | null>`).

Per row (one per weekday):
- Toggle (open / closed)
- Two `<input type="time" step="3600">` (HTML5 native, hour-step) for open / close
- Quick presets at the top of the editor: "Standard 10–7," "Early 8–5," "Closed weekends"

Save through the existing `/api/admin/bookings/hours` endpoint.

### Schedule page (rewrite)

`src/app/site/[slug]/admin/schedule/page.tsx`. Drops the `TabBar`. Renders:

1. `<WeekCalendar>` (or `<DayAgenda>` at ≤640px via CSS or `useMediaQuery`)
2. `<HoursEditor>` as a collapsible accordion below the calendar

The `bookingMode === "external_only"` redirect note from Spec 1 stays at the top, unchanged.

### Booking modal — SMS opt-in checkbox

`src/components/templates/TemplateBooking.tsx`. Right under the customer phone field in `RealBookingCalendar`, add:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={smsOptIn}
    onChange={(e) => setSmsOptIn(e.target.checked)}
    className="h-4 w-4"
  />
  <span style={{ color: colors.foreground }}>Send me text reminders</span>
</label>
```

Default checked. Submit posts `customer_sms_opt_in: smsOptIn` to `/api/create-booking`.

---

## SMS Module

`src/lib/sms.ts` — single new module mirroring the structure of `src/lib/email.ts`.

```ts
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export interface BookingSmsData {
  businessName: string;
  serviceName: string;
  date: string;          // "Sat May 2"
  time: string;          // "10:00 AM – 1:00 PM"
  customerName: string;
  customerPhone: string;
  businessAddress?: string;
}

export async function sendBookingOwnerNotification(ownerPhone: string, b: BookingSmsData): Promise<void> {
  if (!client || !fromNumber || !ownerPhone) return;
  await client.messages.create({
    from: fromNumber,
    to: ownerPhone,
    body: `🔔 New booking: ${b.customerName}, ${b.serviceName}, ${b.date} @ ${b.time}.`,
  });
}

export async function sendBookingCustomerConfirmation(b: BookingSmsData): Promise<void> {
  if (!client || !fromNumber) return;
  const addr = b.businessAddress ? ` Address: ${b.businessAddress}.` : "";
  await client.messages.create({
    from: fromNumber,
    to: b.customerPhone,
    body: `Hi ${b.customerName.split(" ")[0]}! Your appointment at ${b.businessName} is confirmed for ${b.date} @ ${b.time}.${addr} Reply STOP to opt out.`,
  });
}

export async function sendBookingCustomerReminder(b: BookingSmsData): Promise<void> {
  if (!client || !fromNumber) return;
  await client.messages.create({
    from: fromNumber,
    to: b.customerPhone,
    body: `Reminder: your appointment at ${b.businessName} is tomorrow (${b.date}) at ${b.time.split(" – ")[0]}. See you then!`,
  });
}
```

No-op pattern: when env vars are missing (dev environments), calls return silently. Booking flow still works — just no SMS sent.

### Phone number normalization

Twilio requires E.164 format (`+15551234567`). Customer phones come in free-form from the booking form ("555-123-4567", "(555) 123-4567", "5551234567"). Owner phones come from `tenants.sms_phone` or `tenants.phone`, similarly free-form.

A small helper inside `sms.ts` normalizes before send:

```ts
function toE164(raw: string, defaultCountry = "1"): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;  // unrecognized — caller skips send
}
```

Each `send*` function calls `toE164` on the destination number. If null, the send is skipped (logged, not thrown — same pattern as missing env vars). v1 assumes US/Canada (+1); international tenants are out of scope.

## API Changes

### `POST /api/create-booking`

- Accept `customer_sms_opt_in: boolean` (default false).
- Persist on the inserted booking row.
- After insert, fire owner notify + customer confirm SMS in the existing `Promise.allSettled` block alongside the email sends. Customer confirm only fires if `customer_sms_opt_in === true`.

### `GET /api/cron/send-reminders` (new)

- Auth: `Authorization: Bearer ${CRON_SECRET}` header check at top of handler. Reject 401 otherwise.
- Compute tomorrow's ISO date (UTC).
- Query `bookings` joined with `tenants` (for businessName, address):
  ```sql
  SELECT b.id, b.booking_date, b.booking_time, b.duration_minutes,
         b.customer_name, b.customer_phone, b.service_name,
         t.business_name, t.address
    FROM bookings b
    INNER JOIN tenants t ON t.id = b.tenant_id   -- INNER skips orphans
   WHERE b.booking_date = $1               -- tomorrow ISO
     AND b.status = 'confirmed'
     AND b.customer_sms_opt_in = true
     AND b.sms_reminder_sent = false
  ```
  `INNER JOIN` (not LEFT) intentionally drops bookings without an associated tenant — those are typically preview/marketing artifacts and shouldn't trigger production SMS.
- For each: build `BookingSmsData`, call `sendBookingCustomerReminder`, then `UPDATE bookings SET sms_reminder_sent = true WHERE id = $1`.
- Return `{ sent: N, failed: M, errors: [...] }`.

The "find due reminders" query is extracted into a pure function `findDueReminders(rows: BookingRow[], tomorrowIso: string): BookingRow[]` so it can be unit-tested without touching Supabase.

### `POST /api/admin/tenants/sms-phone` (new)

- Owner-auth via existing `requireOwnerSession`.
- Body: `{ sms_phone: string | null }`. Validate format (loose: digits + optional `+`, length 10–15).
- Upsert `tenants.sms_phone` for the session's tenant.

### `vercel.json` add

```json
{
  "crons": [
    { "path": "/api/cron/send-reminders", "schedule": "0 9 * * *" }
  ]
}
```

Vercel automatically sets the `Authorization: Bearer ${CRON_SECRET}` header when invoking the cron endpoint, using the `CRON_SECRET` env var.

---

## Testing

### New unit tests (`src/lib/sms.test.ts`)

- No-op when `TWILIO_ACCOUNT_SID` is unset (mock the module's `client` to null and verify the send functions return without throwing).
- Owner notify formats: customer name, service, date, time range present in body.
- Customer confirm: includes business name, address, STOP footer.
- Customer reminder: phrasing reads as "tomorrow."
- `findDueReminders` correctly filters by date, status, opt-in, sent flag.
- `toE164` parses 10-digit, 11-digit-with-1, and existing E.164 inputs; returns null for garbage.

### Existing tests stay green

- `availability.test.ts` (31 tests)
- `admin-bookings.test.ts` (3 tests)

### Manual smoke

- **Schedule page rewrite:** open `/admin/schedule` for an in-site tenant, see week view with bookings, click a day header → "Closed this day" → toggle on, refresh, day shows striped pattern. Toggle off → restored. Click a booking → action sheet opens, same as today.
- **Hours editor:** open accordion, change Tuesday's close from 7pm to 5pm via time picker, save, reload — persists. Click "Closed weekends" preset → Sat/Sun rows toggle off.
- **Mobile (375px):** schedule page swaps to DayAgenda, pager works, "Block" link toggles whole-day block.
- **SMS opt-in checkbox:** booking modal shows checkbox under phone field, defaults checked. Uncheck → submit → DB row has `customer_sms_opt_in = false`.
- **SMS owner notify:** with Twilio env vars set, make a test booking, verify owner phone receives "🔔 New booking..."
- **SMS customer confirm:** same booking, verify customer phone receives the confirmation.
- **Cron reminder:** insert a test booking dated tomorrow with opt-in true, hit `/api/cron/send-reminders` with the right header, verify SMS sent and `sms_reminder_sent` flipped to true. Hit again — no resend.

---

## Files Touched

| File | Change |
|------|--------|
| `supabase/migrations/016_schedule_v2_and_sms.sql` | New |
| `src/lib/sms.ts` | New — Twilio wrapper |
| `src/lib/sms.test.ts` | New |
| `src/app/api/create-booking/route.ts` | Accept `customer_sms_opt_in`, fire SMS in Promise.allSettled |
| `src/app/api/cron/send-reminders/route.ts` | New |
| `src/app/api/admin/tenants/sms-phone/route.ts` | New |
| `src/app/site/[slug]/admin/schedule/page.tsx` | Rewrite — drop tabs, render WeekCalendar + HoursEditor |
| `src/app/site/[slug]/admin/_components/WeekCalendar.tsx` | New |
| `src/app/site/[slug]/admin/_components/DayAgenda.tsx` | New |
| `src/app/site/[slug]/admin/_components/HoursEditor.tsx` | Rewrite — toggles + native time inputs + presets |
| `src/app/site/[slug]/admin/_components/BlockDateDialog.tsx` | Delete — folded into WeekCalendar's day-header click |
| `src/app/site/[slug]/admin/_components/TabBar.tsx` | Delete — schedule no longer uses tabs |
| `src/components/templates/TemplateBooking.tsx` | Add SMS opt-in checkbox to RealBookingCalendar's customer-info step |
| `vercel.json` | Add cron schedule |
| `package.json` | Add `twilio` dependency |

## Env vars (founder configures)

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1...
CRON_SECRET=<random-hex>
```

When all four are present, SMS sends. When any are missing, sends are silent no-ops and logging notes the omission. The cron endpoint always returns 401 if `CRON_SECRET` is misconfigured.

## Rollout

1. Apply migration `016_*.sql` (you run manually).
2. Deploy without Twilio env vars: schedule UI redesign is live, SMS is a no-op.
3. Configure Twilio + `CRON_SECRET` in Vercel env vars when ready.
4. Redeploy (env-var change requires it).
5. Smoke test SMS with a real booking.
6. The next morning at 9am UTC, the cron fires for any tomorrow-dated bookings.

## Open Questions

None blocking. Items deferred to later specs are listed under Non-Goals.
