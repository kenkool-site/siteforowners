# Reschedule Bookings — Design

**Status:** Approved 2026-04-29. Ready for implementation plan.

**Goal:** Both customer and owner can move a booking to a new date/time without canceling and rebooking. Customer self-serve via a signed link in their confirmation email; owner via a new action on the admin schedule.

## Decisions

- **Initiator:** Both customer and owner (Q1: C).
- **Customer auth:** Stateless HMAC-signed token in the URL — no login (Q2: A).
- **Policy:** Hardcoded defaults — one reschedule per booking, must be ≥24h before original time. Owner can bypass (Q3: B).
- **Deposit:** Transfers automatically. New booking remains `confirmed`, `deposit_amount` stays on the row (Q4: A).
- **Data model:** In-place update of the existing booking row. Add `reschedule_count` column. No audit trail (Q5: A).
- **Customer UI:** Reuse `CustomerBookingFlow` in a new `mode="reschedule"` (Q6: A).
- **Owner UI:** New "Reschedule" button on `BookingActionSheet` opens a modal with a calendar + time-slot picker (Q7: A).
- **Notifications:** Email + SMS to the *other* party. Customer always gets a confirmation regardless of who initiated (Q8: A).

## Architecture

Two endpoints, intentionally split:

- `POST /api/booking/[id]/reschedule` — customer-facing, token-authenticated, all rules enforced.
- `POST /api/admin/bookings/[id]/reschedule` — owner-facing, session-authenticated, 24h cutoff and reschedule_count limits waived. Capacity conflicts go through a force-confirm flow.

This mirrors the existing `/api/create-booking` (customer) vs `/api/admin/bookings/status` (owner) split. Each route owns its auth + validation; they share the booking-row update + notification helpers.

## Data Model

`supabase/migrations/023_add_reschedule.sql`:

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reschedule_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN bookings.reschedule_count IS
  'Number of times this booking has been rescheduled. Customer self-serve
   limit is 1; owner-initiated reschedules also increment this counter.
   Used to enforce the limit and render an "already moved" badge in admin.';
```

That's the only schema change. `booking_date` and `booking_time` are mutated in place. The `bookings.status` column stays untouched on reschedule.

## Token Format

Stateless HMAC, no extra DB column.

```
URL: /reschedule?b=<booking_id>&e=<unix_expiry>&s=<sig>
sig = base64url(HMAC-SHA256(secret, `${booking_id}.${expiry}`))
```

- `secret` is a new `RESCHEDULE_TOKEN_SECRET` env var. Required in prod. The route 500s if it's missing — never silently accept unsigned tokens.
- `expiry` = original booking start time as unix seconds. Once the booking is past, the token is naturally invalid (no separate revocation list).
- Token is built when each customer email is sent: `sendBookingConfirmation`, `sendBookingPendingDepositEmail`, `sendBookingDepositReceivedEmail`. Each pass adds the URL via the existing email helper.
- After a successful reschedule, the next email goes out with a *new* token whose expiry is the new booking start time. Older tokens reference the old (now-past) start time and are implicitly invalid.

Helper module: `src/lib/reschedule-token.ts` exports `signToken({ bookingId, expiry })` and `verifyToken({ booking_id, expiry, signature })`. Pure functions, easy to test.

## Customer Flow

1. Customer clicks "Reschedule" link in any of their booking emails.
2. `/reschedule?b=&e=&s=` page (server component):
   - Verifies HMAC; loads booking via admin client.
   - Checks `status NOT IN ('canceled', 'completed', 'no_show')`.
   - Checks `reschedule_count < 1`.
   - Checks `(start_time - now) >= 24h`.
   - On any failure, renders a friendly fallback page: "Online reschedule isn't available. Call [phone] to make changes." (Single component, branched copy per failure reason.)
3. On success, renders `CustomerBookingFlow` with new props:
   - `mode="reschedule"`
   - `lockedService` (the original service)
   - `lockedCustomer` (name, phone, email)
   - `originalDateTime` displayed at the top
   - `submitLabel="Confirm reschedule"`
   - The component skips the service step, skips the customer-info step, hides the deposit panel and the booking-policies callout.
4. Customer picks a new date/time → submit → `POST /api/booking/[id]/reschedule` body: `{ token: { e, s }, new_date, new_time }`.
5. Server re-verifies token + all four checks above + capacity (excluding the booking-being-rescheduled itself from the conflict pool) + working hours / blocked dates. Updates the row and increments `reschedule_count` in a single statement. Fires notifications.
6. UI redirects to `/reschedule/done?b=` showing a success state similar to the existing post-booking confirmation screen.

## Owner Flow

1. Owner taps a booking on `WeekCalendar`. `BookingActionSheet` opens (existing component).
2. New "Reschedule" button:
   - Always visible (next to "Cancel"); for pending bookings it sits next to "Mark deposit received."
   - When `reschedule_count >= 1`, the button shows a small badge ("Already rescheduled") but the click still opens the modal — owner has authority to bypass.
3. `RescheduleModal` (new component):
   - Bottom sheet on mobile, centered card on desktop.
   - Header: "Move [customer name]'s booking" with the current date/time.
   - Calendar + time-slot picker. Slot fetcher reuses `/api/available-slots` (with `?exclude_booking_id=` so the booking's current slot is shown as available, not blocked by itself).
   - No 24h cutoff. No reschedule_count cap.
4. Submit → `POST /api/admin/bookings/[id]/reschedule` (session-auth, owner-only). Body: `{ new_date, new_time, force?: boolean }`.
5. If a capacity conflict exists and `force` is not set, server returns `409 { error, conflict: { customer_name } }`. Modal shows: "That slot has another booking with [name] — schedule anyway?" with Yes/No. Yes → re-submits with `force: true`.
6. Server still enforces working hours / blocked dates (those are real, not preferences). On success, increments `reschedule_count`, fires customer notification.

## Notifications

| Initiator | Customer gets | Owner gets |
|---|---|---|
| Customer | Email + SMS (if `customer_sms_opt_in`): "Your booking at [biz] has moved to [new_date] at [new_time]. Old time: [old_date] at [old_time]." Add-to-Calendar buttons reuse `/api/booking/[id]/ics` (same id, fresh content). | Email + SMS (if `tenants.sms_phone` set): "🔔 [Customer] rescheduled their [service] from [old] to [new]." |
| Owner | Email + SMS (if `customer_sms_opt_in`): "Your booking at [biz] has been moved by the business. New time: [new_date] at [new_time]." | Nothing — they just did it. |

New email functions in `src/lib/email.ts`:
- `sendBookingRescheduledCustomer(booking, { previousDate, previousTime, initiator })`
- `sendBookingRescheduledOwner(ownerEmail, booking, { previousDate, previousTime })`

New SMS functions in `src/lib/sms.ts`:
- `sendBookingRescheduledCustomerSms`
- `sendBookingRescheduledOwnerSms`

`BookingEmailData` gets two new optional fields: `previousDate?`, `previousTime?` — surfaced only by the reschedule templates. Same for `BookingSmsData`.

The customer reschedule email reuses the existing `renderCalendarButtons` helper. Because the booking_id is unchanged and `/api/booking/[id]/ics` regenerates from the row, the "Add to Apple/Outlook" link always returns the current state — old links from prior emails auto-update.

The customer reschedule email also includes a fresh reschedule link only when `reschedule_count < 1` (after the increment, that means never). Once they've used their one reschedule, the link is omitted to avoid the customer arriving at the "already used your quota" page from an email we just sent.

## Edge Cases

- **Capacity race** between slot pick and submit. Server returns 409; UI re-fetches slots and asks for another pick.
- **Already used quota** (customer tries from an old email). Page renders the friendly fallback with phone CTA.
- **Inside 24h window.** Same fallback. (Owner side has no such check.)
- **Booking canceled/completed/no_show.** 410 page: "This booking is no longer active."
- **Token expired** (booking already past). Same 410.
- **Tampered token.** Constant-time HMAC compare; mismatched signature → 400 Bad Request, no info leak.
- **Missing `RESCHEDULE_TOKEN_SECRET` in prod.** Route 500s on first request, error logged. Add to Vercel env before merge.
- **Owner force-override of capacity.** `force: true` only honored on the admin route after session auth. Working hours / blocked dates still enforced.
- **Deposit on rescheduled booking.** `deposit_amount` snapshot stays on the row. No re-pay. Status remains `confirmed` (or `pending` if it was already pending — reschedule doesn't change status).
- **Owner reschedules a pending booking.** Allowed. The booking stays `pending` at the new time. Customer notification mentions the new time but doesn't restate deposit instructions (those are in the original pending email already).
- **Concurrent reschedule** (customer + owner submitting at the same time). Postgres row-level locking via `UPDATE ... WHERE id = $1 AND reschedule_count = $2` (optimistic). Second submission gets 409; UI says "Booking just changed, refresh."
- **Calendar invite update.** Out of scope. Customer re-clicks Add-to-Calendar in the new email; old calendar entry on their device is theirs to delete. Owner manages their own calendar manually.

## Out of Scope (v1)

- Drag-and-drop reschedule on `WeekCalendar`. Owner uses the action-sheet button.
- Per-tenant configurable reschedule policy (max count, advance window). Hardcoded for now; future spec if a tenant asks.
- iCalendar `METHOD:CANCEL` + `METHOD:REQUEST` update sequence.
- Reschedule via SMS reply.
- Cancel from the reschedule page. Existing phone CTA in confirmation emails covers this.
- Visible "rescheduled" badge on past bookings in admin reports. The `reschedule_count` column is enough for the limit; UI surfacing can come later.

## File Structure

**New files:**
- `supabase/migrations/023_add_reschedule.sql` — `reschedule_count` column.
- `src/lib/reschedule-token.ts` — `signToken`, `verifyToken`, expiry helpers.
- `src/lib/reschedule-token.test.ts` — sign/verify round-trip + tamper detection.
- `src/app/reschedule/page.tsx` — public page; validates token, renders the customer flow.
- `src/app/reschedule/done/page.tsx` — success screen.
- `src/app/api/booking/[id]/reschedule/route.ts` — customer endpoint.
- `src/app/api/admin/bookings/[id]/reschedule/route.ts` — owner endpoint.
- `src/app/site/[slug]/admin/_components/RescheduleModal.tsx` — owner-side picker modal.

**Modified:**
- `src/components/templates/CustomerBookingFlow.tsx` — add `mode="reschedule"` and the locked-prop set.
- `src/lib/email.ts` — two new functions, `BookingEmailData` adds `previousDate?` / `previousTime?`.
- `src/lib/sms.ts` — two new functions, `BookingSmsData` adds the same.
- `src/app/site/[slug]/admin/_components/BookingActionSheet.tsx` — add "Reschedule" button + modal trigger.
- `src/app/api/create-booking/route.ts`, `src/app/api/admin/bookings/status/route.ts` — embed the reschedule URL in customer emails (when applicable).
- `src/app/api/available-slots/route.ts` — accept `?exclude_booking_id=` so a booking doesn't block its own current slot during reschedule preview.

## Testing

- `reschedule-token.test.ts`: sign/verify round-trip, expiry, tamper detection (mutated signature, mutated booking_id, mutated expiry).
- 24h cutoff at exact boundary (booking 24h + 1s away passes; 23h 59m 59s fails).
- `reschedule_count` enforcement (customer endpoint) + bypass (owner endpoint).
- Capacity conflict with the booking-being-rescheduled excluded from the pool.
- Working hours / blocked dates rejection on both endpoints.
- Notification fan-out per initiator (mock `email.ts` / `sms.ts` and assert call shape).
- Force-override path (owner endpoint) — capacity warning returns 409 without `force`, accepts `force: true`, still rejects out-of-hours slot.

## Environment

Add to Vercel before merge:
- `RESCHEDULE_TOKEN_SECRET` — random 32+ byte hex string. Routes 500 if missing.
