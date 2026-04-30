# Preview Booking Mockup Polish

**Date:** 2026-04-29
**Status:** Approved & implemented (full live-parity revision on 2026-04-29)
**Surface:** Marketing previews at `/preview/[slug]`

## Context

Marketing previews are the lead magnet: a prospect sees a preview of their hypothetical site and is pitched the free trial via the bottom CTA bar. Today the preview already substitutes `MockBookingCalendar` for `CustomerBookingFlow` (gated by `isLive` in `TemplateBooking.tsx`), but the mock cuts the flow short and breaks immersion at exactly the wrong moment.

## Goal

Make the preview's booking flow *feel* like the published site through to a satisfying confirmation, while remaining inert (no API calls, no DB writes, no emails). Persuasion, not deception — a small honest demo footnote stays visible.

## Non-goals

- Mocking the contact form, newsletter signup, or any other interactive surface (out of scope for v1).
- Capturing real leads from preview interactions.
- Real "Add to Calendar" link generation. The success screen makes the same visual claim the live screen does ("calendar invite was sent to {email}") without generating a real ICS.
- Email validation. Live flow doesn't enforce client-side; mock matches.
- Deposit / payment-method flow. Mock skips deposit entirely (live shows it conditionally; mock owners haven't configured one).
- SMS opt-in checkbox. Live offers it; mock skips since no SMS is sent.

## Current state (post-implementation)

The mock now mirrors the live flow's step structure 1:1 in shape:

```
service → details → schedule → success
```

`details` is a single screen that combines service summary, add-ons, running total, calendar grid, and inline time slots — same as live. `schedule` is the customer info form. `success` is the polished confirmation.

## Design

### Files touched

- `src/components/templates/MockBookingCalendar.tsx` — rewritten end to end.
- `src/components/templates/CustomerBookingFlow.tsx` — three `export` keywords added so the mock can reuse `ServiceDetailsPanel`, `RunningTotalBar`, and `WEEKDAYS_FULL`. No behavioral change.

### Reuse over duplication

`ServiceDetailsPanel` and `RunningTotalBar` are imported from `CustomerBookingFlow` so the mock and live screens stay visually identical without manual sync. The remaining ~410 lines of `MockBookingCalendar` are layout-and-state — small enough to maintain, large enough that a second extraction round will only happen if drift becomes visible.

### Step state

```ts
"service" | "details" | "schedule" | "success"
```

Mirrors live `CustomerBookingFlow` exactly.

### Header titles (match live verbatim)

| Step | Title |
|---|---|
| `service` | "Select a Service" |
| `details` | "Pick a Date & Time" |
| `schedule` | "Your Details" |
| `success` | "Booking Confirmed!" |

### `details` step contents (match live order)

1. "Step 1 of 2 — Details" caption.
2. `ServiceDetailsPanel` — service image, name, price, base duration, description.
3. **Add-ons checklist** (only when `selectedService.addOns?.length > 0`):
   - Same checkbox styling, selected-state coloring, and `+duration · +$price` chip layout as live.
   - 720-minute total-duration cap enforced (silent no-op when exceeded), matching live spec.
   - Toggling an add-on clears `selectedTime` so the user re-picks against the new duration.
4. `RunningTotalBar` — total duration + price across base service + selected add-ons.
5. **iOS-Calendar-style date picker:**
   - Single `S M T W T F S` weekday header at the top.
   - 30-day window grouped by month, each month preceded by a bold month label, each grid padded with leading empty cells so the first date lands under the right weekday.
   - Closed days disabled at 25% opacity. Mock working hours are **Mon–Sat 10–19, Sunday closed**.
   - Selected date renders as a filled circle in `colors.primary`.
6. **Inline time slots** (rendered once a date is picked), with auto-scroll-into-view on date change.
7. **Continue button** — sticky on mobile, gated on date + time both selected.

### `schedule` step contents (match live, minus deposit/SMS/notes)

- Back button to `details`, "Step 2 of 2 — Your details" caption.
- Compact summary chip (service · date · time).
- `RunningTotalBar` repeated.
- Inputs: name (required), phone (required), email (optional). No SMS opt-in checkbox, no notes textarea, no deposit panel — preview owners haven't configured those.
- "Confirm Booking" button, disabled until name + phone are non-empty (trimmed). On submit: `setStep("success")`. No fetch.

### `success` step contents

- Animated checkmark + "You're All Set!" header.
- Subtitle: "Your appointment has been booked." (matches live)
- If email entered: "A confirmation with calendar invite was sent to {email}." (matches live verbatim)
- Booking summary card with Service, Add-ons (if any), Date, Time (formatted via `formatTimeRange` against `totalDuration`), and Total ($ amount including add-ons).
- "Done" button.
- Demo footnote at the very bottom: *"Demo preview · no actual booking was made."*

### Mock-only working-hours constant

`MOCK_WORKING_HOURS` is module-scoped at the top of `MockBookingCalendar.tsx` (Mon–Sat 10–19, Sun closed). Used to:
- Disable Sunday cells in the calendar grid (live uses real owner data; mock has none).
- Feed `computeAvailableStarts` for slot generation.

## Edge cases

- **Empty services array:** existing upstream gating (`services && services.length > 0` in `TemplateBooking.tsx:573`) prevents the modal from opening at all; no new handling needed.
- **`initialService` provided:** modal opens directly on `details` step (skipping `service`). Matches live `CustomerBookingFlow` behavior (`initialService ? "details" : "service"`).
- **Service has no add-ons:** the add-ons block silently does not render — `RunningTotalBar` still shows but contributes only the base price.
- **Time becomes invalid after toggling an add-on:** `selectedTime` is cleared on add-on toggle so the customer re-picks against the new duration.
- **Email left blank:** success screen omits the email-confirmation line.
- **Mobile (<400px):** modal is full-height on mobile (`h-full sm:h-auto`), Continue button is sticky-bottom with safe-area padding — same as live.

## Testing

- Static: `npx tsc --noEmit` and `npx next lint --file …MockBookingCalendar.tsx --file …CustomerBookingFlow.tsx` both clean.
- Manual smoke (run `npm run dev` and visit any `/preview/[slug]`):
  1. Open booking; pick a service. Verify it lands on the `details` step.
  2. If the service has add-ons, toggle one or two and watch the `RunningTotalBar` update.
  3. Pick a date — verify Sunday cells are disabled and the time grid auto-scrolls into view.
  4. Pick a time. Verify Continue button enables.
  5. On the `schedule` step, verify the running total still reflects add-ons, and Confirm gates on name + phone.
  6. On `success`, verify the add-ons line, total ($ including add-ons), and email confirmation line all render correctly.
  7. Verify the live `/site/[slug]` flow is untouched — booking still hits `/api/create-booking`.

## Risks

- **Drift from live UX over time:** `ServiceDetailsPanel` and `RunningTotalBar` are now shared, which removes most drift risk. The remaining structural code (calendar grid, add-ons block) is a copy-mirror — if the live one evolves, this needs a manual update. Mitigation: tagging both components as siblings via this spec; a future extraction of the whole `details` body into a shared component is the next move if drift recurs.
- **Public-facing component import:** the mock now imports presentational helpers from a public booking flow file. Tree-shaking handles bundle size; no runtime risk.
