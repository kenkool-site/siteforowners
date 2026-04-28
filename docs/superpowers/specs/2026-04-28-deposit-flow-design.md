# Spec 5: Deposit Flow & Booking Status — Design

**Date:** 2026-04-28
**Status:** Approved (pending written review)

## Goal

Let owners optionally require a deposit before a booking is confirmed. Deposits are paid off-platform (Cash App, Zelle, Venmo, etc.) — the system does not process payment. When deposit is enabled:

1. Customer books normally; system marks the booking `pending` instead of `confirmed`.
2. System surfaces the deposit amount and payment instructions prominently on the booking flow and in confirmation messages.
3. Owner sees pending bookings in a dedicated section of the schedule and marks each as paid manually once the funds arrive.
4. Customer receives notifications at each transition (booking placed → deposit received → confirmed; or canceled).

The whole feature is opt-in per tenant. Tenants without deposit configured see today's flow unchanged.

## Non-goals

- **In-platform payment processing.** All deposit transfers happen via the owner's existing payment apps. No Stripe integration in this spec.
- **Refund flow.** When an owner cancels a paid pending booking, refund logistics are off-platform (owner uses the same channel the customer paid through).
- **Auto-cancel of stale pending bookings.** Manual management for v1; the dedicated pending list makes stale ones easy to spot. Add a 24/48h auto-cancel cron in a follow-up spec if owners ask.
- **Reschedule via tokenized link.** Deferred to Spec 6.
- **Per-service deposit amounts.** Single tenant-wide deposit configuration only (with fixed/percent toggle). Per-service granularity can land later if a tenant needs it.
- **Follow-up reminder ("you still owe a deposit") notifications.** The initial notification carries the ask aggressively; reminders deferred.

## Architecture overview

Spec 5 lives within the existing booking surfaces — no new tables, no new infra. Four columns are added to `booking_settings` (deposit toggle + mode + value + instructions), one column added to `bookings` (`deposit_amount` snapshot). The `status` column gains a new conventional value `'pending'` — no schema change, since `status` is a free-form `text` column with no CHECK constraint (the allowed values are enforced in code at `/api/admin/bookings/status` and `/api/create-booking`).

The customer booking flow gets a new `pending` confirmation variant and a prominent deposit panel on Step 2. The admin schedule gets a yellow "Pending" badge inline + a "Pending payments" pill that expands a list of pending bookings with a "Mark deposit received" action. The existing `/api/admin/bookings/status` endpoint just learns the `pending → confirmed` transition.

Three new notification messages reuse the existing email + SMS pipeline. The follow-up reminder cron is out of scope.

## Data model

### `booking_settings` (3 new columns)

```sql
deposit_required     boolean       DEFAULT false
deposit_mode         text          -- 'fixed' | 'percent', NULL when not required
deposit_value        numeric(10,2) -- dollars when mode='fixed'; integer 1-100 when mode='percent'
deposit_instructions text          -- e.g. "Cash App: $letstrylocs · Zelle: (555) 123-4567"
```

### `bookings` (1 new column + status enum extended)

```sql
deposit_amount numeric(10,2)  -- snapshot of computed deposit at booking creation; NULL when no deposit required
```

The `status` column currently uses a check or convention of `'confirmed' | 'canceled' | 'completed' | 'no_show'`. We extend the allowed values to include `'pending'`. Default stays `'confirmed'`.

### Validation rules

| Rule | Enforcement |
|---|---|
| `deposit_required = true` requires `deposit_mode`, `deposit_value`, and `deposit_instructions` (non-empty) | Server-side in the settings save endpoint; field-level error responses |
| `deposit_mode = 'fixed'` → `deposit_value > 0` | Server-side |
| `deposit_mode = 'percent'` → `deposit_value` is integer 1–100 | Server-side |
| `deposit_instructions` ≤ 1000 chars | Server-side, silent truncation |
| `deposit_amount` is recomputed server-side at booking creation; never trusted from the client | Server-side in `/api/create-booking` |
| Status transitions: `pending → confirmed`, `pending → canceled`, `confirmed → canceled \| completed \| no_show`. Reverse transitions rejected | Server-side in `/api/admin/bookings/status` |

### Deposit computation

```ts
function computeDeposit(
  settings: BookingSettings,
  baseServicePrice: number,
  addOnTotal: number,
): number {
  if (!settings.deposit_required) return 0;
  if (settings.deposit_mode === "fixed") return settings.deposit_value;
  // percent mode: apply to base + add-ons total, round to cents
  const total = baseServicePrice + addOnTotal;
  return Math.round(total * (settings.deposit_value / 100) * 100) / 100;
}
```

`baseServicePrice` is parsed from the existing `service_price text` field via `parseFloat(s.replace(/[^0-9.]/g, ""))`. If the parse yields `0` or `NaN` (e.g. service price is `"Free"` or `"From $X"`), the system falls back to treating `deposit_value` as a flat dollar amount even in percent mode and logs a console warning. Owner who picks percent mode is shown a soft warning at save time if any service has a non-numeric price; the save still succeeds.

### Migration

`021_add_deposit_settings.sql` — `ALTER TABLE booking_settings ADD COLUMN IF NOT EXISTS ...` for the four new columns; `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2)`. The `status` column has no CHECK constraint to update — `'pending'` is just a new conventional value enforced in code.

## Owner UI

### Settings — deposit configuration

A new "Deposit" section on the Services admin page, between the Booking Policies editor and the services list. Mirrors the same collapsed-when-empty pattern (`+ Require a deposit` prompt → expanded form → Done ▴).

Form contents:

- Checkbox: "Require deposit"
- Radio: Fixed amount / Percentage
- Value field: `$` input for fixed; `%` input for percent (swaps based on radio)
- Textarea: `deposit_instructions` (e.g., "Cash App: $letstrylocs · Zelle: (555) 123-4567")

Save uses the existing global Save button on the Services admin page (same payload as services + categories + booking_policies). Founder-side `SiteEditor` mirrors all the same fields in its Services section so founder edits round-trip the same DB columns.

### Schedule — pending visibility

When `pending` bookings exist for the tenant, a small primary-color pill appears at the top of `/admin/schedule`:

```
🕐 3 pending payments ▾
```

Tap → expands an inline section listing the pending bookings sorted oldest-first. Each row:

```
┌──────────────────────────────────────────┐
│ Mariam K.  ·  Tue Apr 28, 11:00 AM       │
│ Loc Removal  ·  Deposit: $240            │
│ Pending since 2h ago                     │
│ [ Mark deposit received ]   [ Cancel ]   │
└──────────────────────────────────────────┘
```

Same pending bookings also render inline in the regular day-by-day schedule with a yellow `border-l-4` and a "Pending" badge so the slot is visible in context. Tapping a pending booking in either place opens the same booking-detail UI.

### Booking detail (existing modal/sheet)

For `pending` bookings, the primary action is a green "Mark deposit received" button (replaces the usual Confirmed/Completed/No-show menu). Tap → confirmation prompt → status flips to `confirmed` → customer gets the email + SMS confirmation. A secondary "Cancel" action remains available.

For `confirmed` bookings, the existing Confirmed/Completed/No-show/Canceled options stay unchanged.

**No new admin route.** The pending list is an inline-expanded section within `/admin/schedule`.

## Customer UI

### Step 2 — prominent deposit panel

When the tenant has `deposit_required = true`, Step 2 of the booking modal renders an amber deposit panel **above** the Confirm button (in place of where the small policies callout sits today):

```
┌─────────────────────────────────────────┐
│ ⚠ $240 deposit required (non-refundable) │
│ Pay before your booking is confirmed:   │
│                                         │
│ Cash App: $letstrylocs                  │
│ Zelle: (555) 123-4567                   │
│                                         │
│ You'll get a confirmation once we       │
│ receive payment.                        │
└─────────────────────────────────────────┘
```

Existing `booking_policies` callout stays accessible as a small drawer link below this panel for general (non-deposit) policy text. The Confirm button copy shifts: "Confirm & I'll pay deposit" instead of "Confirm booking" — explicit acknowledgment of the off-platform action.

### Pending confirmation screen

After submit on a deposit-required booking, the modal renders a `pending` variant of the confirm step (instead of the green "Booking Confirmed!" success):

```
       ⏳ (amber circle)

   Almost there!
   Pay your deposit to lock in this slot.

   ┌──────────────────────────┐
   │ Deposit due       $240   │
   │                          │
   │ Cash App: $letstrylocs   │
   │ Zelle: (555) 123-4567    │
   └──────────────────────────┘

   Pending booking:
   Loc Removal · Tue Apr 28 · 11:00 AM

   We'll text and email you once your deposit
   is received and your booking is confirmed.

   [ Got it ]
```

When deposit is NOT required, the existing green "Booking Confirmed!" screen stays exactly as today.

## Notifications

Three new notification triggers, each producing both an email and (if customer opted in via the existing SMS opt-in checkbox) an SMS.

### 1. Booking placed (deposit required)

- **Email subject:** `⏳ Pay $240 to secure your booking at Letstrylocs`
- **Email body:** Friendly intro, deposit amount, payment instructions, "your booking is pending until we receive payment", booking details.
- **SMS:** `Hi Mariam! Your booking at Letstrylocs on Tue Apr 28 @ 11:00 AM is pending. Pay $240 to confirm: Cash App $letstrylocs or Zelle (555) 123-4567. Reply STOP to opt out.`

### 2. Deposit received (status → confirmed)

- **Email subject:** `✓ Deposit received — booking confirmed`
- **Email body:** Confirmation language, booking details, the existing .ics calendar attachment.
- **SMS:** `✓ Got it! Your deposit is received and your booking at Letstrylocs is confirmed for Tue Apr 28 @ 11:00 AM. See you then!`

### 3. Booking canceled

- **Email subject:** `Your booking at Letstrylocs has been canceled`
- **Email body:** Brief cancellation note, original booking details, owner contact info.
- **SMS:** `Your booking at Letstrylocs for Tue Apr 28 @ 11:00 AM has been canceled. Questions? Reply or call (555) 123-4567.`

Cancellation fires whether the customer paid or not — the owner handles refund logistics off-platform via the same channel the deposit came through.

The existing booking-placed notification (which fires on auto-confirmed bookings without deposit) is unchanged.

## Edge cases

- **Toggle changes don't affect existing bookings.** Owner enabling/disabling deposit, or changing amount/percent, applies only to bookings created after the change. Existing pending bookings keep their snapshotted `deposit_amount` and stay pending until the owner explicitly resolves them.
- **Capacity check still runs on pending bookings.** Otherwise two customers could each book the same slot while waiting on deposits. Slot is reserved on creation; owner cancels stale ones to free slots.
- **Defense in depth on status:** `/api/create-booking` always sets `status = 'pending'` server-side when the tenant has `deposit_required = true`, regardless of any client-supplied value.
- **Recompute server-side:** the deposit amount stored on a booking is computed by the server from the tenant's current settings + the actual booking's base + add-ons. Never trusted from the client.
- **Service price unparseable in percent mode:** falls back to treating `deposit_value` as a flat dollar amount for that service. Logged as a warning. Owner sees a soft warning at settings-save time if any service has a non-numeric price.
- **`deposit_instructions` length:** server-side cap at 1000 chars (silent truncation, matches existing pattern for `booking_policies`).
- **Backward compat:** tenants without `deposit_required` configured (NULL or false) see no UI changes. Bookings with `status = 'confirmed'` and `deposit_amount = NULL` continue to work — the column is nullable.

## File scope

### New files

| File | Responsibility |
|---|---|
| `siteforowners/supabase/migrations/021_add_deposit_settings.sql` | Schema migration |
| `siteforowners/src/lib/deposit.ts` | `computeDeposit()` helper + parsePrice helper |
| `siteforowners/src/lib/deposit.test.ts` | Unit tests for deposit computation + price parsing |
| `siteforowners/src/lib/validation/deposit-settings.ts` | Pure validator for `{ deposit_required, deposit_mode, deposit_value, deposit_instructions }` |
| `siteforowners/src/lib/validation/deposit-settings.test.ts` | Unit tests |
| `siteforowners/src/app/site/[slug]/admin/services/DepositEditor.tsx` | Owner-side deposit configuration component |
| `siteforowners/src/app/site/[slug]/admin/schedule/_components/PendingPaymentsList.tsx` | Pending payments pill + expanded list (inline within ScheduleClient) |

### Modified files

| File | Why |
|---|---|
| `siteforowners/src/lib/ai/types.ts` | Add `BookingSettings` deposit fields (or extend the local types where booking_settings is read) |
| `siteforowners/src/app/api/admin/services/route.ts` | Read + persist deposit settings alongside services + categories + booking_policies |
| `siteforowners/src/app/api/update-site/route.ts` | Allowlist new fields for founder-side save |
| `siteforowners/src/app/api/admin/bookings/status/route.ts` | Allow `pending → confirmed` transition; trigger deposit-received notification |
| `siteforowners/src/app/api/create-booking/route.ts` | Server-side check tenant deposit settings; compute `deposit_amount`; set status to `'pending'` when required; trigger pending-with-deposit notification |
| `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx` | Mount `DepositEditor`; include in save payload |
| `siteforowners/src/app/site/[slug]/admin/services/page.tsx` | Load deposit settings alongside services + categories + booking_policies |
| `siteforowners/src/app/site/[slug]/admin/schedule/ScheduleClient.tsx` | Mount `PendingPaymentsList`; pending badge in inline schedule rows |
| `siteforowners/src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` | Founder-side parity for deposit fields |
| `siteforowners/src/components/templates/CustomerBookingFlow.tsx` | Step 2 deposit panel (when settings.deposit_required); pending confirmation screen variant; CTA copy update |
| `siteforowners/src/components/templates/TemplateOrchestrator.tsx` | Pass deposit settings through to CustomerBookingFlow |
| `siteforowners/src/lib/email.ts` | Three new email templates (pending, deposit-received, canceled) |
| `siteforowners/src/lib/sms.ts` | Three new SMS templates; `BookingSmsData` extended with `depositAmount`, `depositInstructions` |

## Testing strategy

### Unit

- `computeDeposit`: fixed mode, percent mode (rounds to cents), percent-mode fallback to fixed when basePrice unparseable, deposit-not-required → 0.
- `parsePrice("$250")` → 250; `parsePrice("Free")` → 0; `parsePrice("From $50")` → 50.
- `validateDepositSettings`: required-fields check, percent value range, instructions length cap.
- Status transition validator: allowed (`pending → confirmed`, etc.) returns ok; disallowed (`confirmed → pending`) rejects.

### Integration

- POST `/api/create-booking` against a deposit-required tenant → booking row has `status = 'pending'` and snapshotted `deposit_amount`. Notification queue fires the pending email + SMS templates.
- POST `/api/admin/bookings/status` with `{ id, toStatus: 'confirmed' }` against a pending booking → status updates, customer gets the deposit-received email + SMS.
- Toggle `deposit_required` off, then create another booking → status is `'confirmed'` directly with `deposit_amount = NULL`. Pre-existing pending bookings unchanged.

### E2E (manual smoke on the spec branch)

1. Owner enables deposit (fixed $40), sets payment instructions.
2. Customer books a service → sees amber deposit panel on Step 2; submits → sees pending confirmation screen with payment instructions.
3. Customer receives the "pay $40" email + SMS.
4. Owner sees the "1 pending payments" pill on `/admin/schedule`; expands; taps "Mark deposit received".
5. Customer receives the "deposit received — confirmed" email + SMS.
6. Booking moves out of the pending list and shows in the regular schedule with the standard Confirmed treatment.
7. Owner switches deposit mode to 20% percent; customer books a $250 service → deposit panel shows `$50`; same flow.
8. Owner cancels a pending booking → customer gets cancellation notification.

## Open questions

None remaining — implementation plan can be drafted directly from this document.
