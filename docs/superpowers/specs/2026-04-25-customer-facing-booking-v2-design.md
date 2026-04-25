# Customer-Facing Booking v2 — Design

**Date:** 2026-04-25
**Status:** Draft (awaiting user review)
**Scope:** Spec 1 of 2 in the "Booking & Scheduling v2" initiative.
Spec 2 (admin calendar redesign + Twilio SMS) will follow after this ships.

---

## Problem

The in-site booking flow has two limitations that block real-world salon use:

1. **No multi-hour services.** Every booking is treated as a single slot of `slot_duration` (currently global per tenant, default 60 min). A 3-hour braid cannot be booked correctly: the .ics ends after 1 hour, conflict checks only look at the exact start slot, and the customer never sees the real time range.
2. **External booking apps replace in-site booking.** Tenants who use Acuity/Booksy/Vagaro lose the in-site flow entirely. There is no way to offer in-site as the primary booking path while still honoring an existing customer base on Acuity.

## Goals

- Owners can offer multi-hour services (1–8h) priced and scheduled by service.
- Tenants can offer **both** in-site (primary) and external (quiet secondary link) booking entry points.
- Founder controls per-tenant booking mode via the existing `SiteEditor`.
- Existing tenant behavior is preserved through the migration — no client wakes up with a different booking UI.

## Non-Goals

Out of scope for this spec; deferred or owned by Spec 2:

- Hour-range availability blocking ("away Friday 2–5 PM") — Spec 2.
- SMS notifications via Twilio — Spec 2.
- Buffer time between bookings (`buffer_minutes` stays in the schema, default 0, not surfaced in UI).
- 30-minute booking granularity.
- Multi-stylist / per-resource calendars.

---

## Data Model

Three changes, all backward-compatible.

### 1. `previews.services[*].duration_minutes`

Add `duration_minutes: number` to each service item in the `previews.services` JSONB array. Default `60`. Range enforced in app code: 60, 120, 180, 240, 300, 360, 420, 480 (whole hours, 1–8 h).

### 2. `tenants.booking_mode`

```sql
ALTER TABLE tenants
  ADD COLUMN booking_mode text NOT NULL DEFAULT 'in_site_only'
  CHECK (booking_mode IN ('in_site_only', 'external_only', 'both'));
```

Migration backfill — `booking_url` lives at `previews.generated_copy ->> 'booking_url'`, not on `tenants`. We backfill via the `preview_slug` link:

```sql
UPDATE tenants t
   SET booking_mode = 'external_only'
  FROM previews p
 WHERE p.slug = t.preview_slug
   AND COALESCE(p.generated_copy ->> 'booking_url', '') <> '';
```

This preserves today's behavior: every tenant currently using an external provider stays on `external_only`. The founder explicitly opts a tenant into `both` from the SiteEditor when they want dual mode.

### 3. `bookings.duration_minutes`

```sql
ALTER TABLE bookings
  ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60;
```

Stored on the booking row, not derived from the service. Reasons:

- **Historical integrity.** Editing a service's duration must not retroactively change the duration of past bookings.
- **Conflict-check simplicity.** A query over `bookings` has all the data it needs without joining back to the service definition.

### What stays unchanged

- `booking_settings.slot_duration` remains as the global slot grid (always 60 in v1). It is no longer used to compute end times — the booking's own `duration_minutes` is authoritative.
- `bookings.booking_time` stays as a string (`"10:00 AM"`). End time is `start + duration_minutes`, computed at read time.
- `booking_settings.buffer_minutes` is unused in code today and stays unused in v1.

---

## Availability & Conflict Logic

A new module `src/lib/availability.ts` owns the rules. Pure functions, fully unit-testable, no I/O.

### Booking interval representation

A booking occupies the half-open interval `[start_hour, start_hour + duration_hours)`. All ranges in this spec are half-open.

### Conflict definition

Two bookings conflict iff their intervals overlap:

```
overlap(a, b) = a.start < b.end AND b.start < a.end
```

`max_per_slot` allows N concurrent bookings per overlapping hour. A new booking is rejected iff there exists at least one hour `h` in the new booking's range where the count of confirmed bookings overlapping `h` would exceed `max_per_slot`.

### Available start times

For a service of duration `N` hours on date `D`:

```
computeAvailableStarts(D, N, workingHours, existingBookings, maxPerSlot, blockedDates):
  if D in blockedDates: return []
  let { open, close } = workingHours[D.weekday]
  if open is null: return []  // closed
  let valid = []
  for h in [open, open + 1, ..., close - N]:
    let candidate = [h, h + N)
    let conflict = false
    for hour in candidate:
      let overlapping = existingBookings.filter(b => b.contains(hour))
      if overlapping.length >= maxPerSlot:
        conflict = true; break
    if not conflict: valid.push(h)
  return valid
```

The time picker only shows valid start hours. A 3-hour service in a shop that closes at 5 PM will not show 4 PM. A 3-hour service starting at 1 PM is not shown if a booking already exists at 2 PM.

### Endpoint integration

`/api/create-booking` runs the same conflict check server-side before insert. Client-side filtering is for UX only; the server is authoritative.

---

## UI Changes

### `TemplateBooking.tsx` (focused changes, no rewrite)

Current file: 1000 lines. We touch ~6 spots.

- New prop `bookingMode: 'in_site_only' | 'external_only' | 'both'`.
- Service-selection step shows duration on each card: `"3 hours · $180"`.
- Time-selection step replaces the mock generator at [TemplateBooking.tsx:78-94](../../../src/components/templates/TemplateBooking.tsx#L78-L94) with a call to `computeAvailableStarts`.
- Confirm step shows the full time range: `"Sat, Apr 25 · 10:00 AM – 1:00 PM (3 hours)"`.
- Entry CTA branches on `bookingMode`:
  - `in_site_only`: solid pink primary button only.
  - `both`: primary button + quiet underlined link beneath it (Layout A from brainstorm).
  - `external_only`: today's behavior (embed/redirect to external).

### Dual-mode entry copy (Layout A)

```
[ Book instantly on this website → ]      ← solid primary button
   Already using Acuity? You can still book there ↗   ← quiet underlined link
```

The provider name in the secondary link reads from `bookingMode.providerName` (already detected by [admin-bookings.ts:getBookingMode](../../../src/lib/admin-bookings.ts)).

### Per-service Book buttons

Files: [BoldServices.tsx](../../../src/components/templates/services/BoldServices.tsx), [VibrantServices.tsx](../../../src/components/templates/services/VibrantServices.tsx), [ClassicServices.tsx](../../../src/components/templates/services/ClassicServices.tsx), [ElegantServices.tsx](../../../src/components/templates/services/ElegantServices.tsx), [WarmServices.tsx](../../../src/components/templates/services/WarmServices.tsx).

Branch on `bookingMode`:
- `in_site_only` or `both`: invoke `onSelectService(deepLinkUrl)` to open the in-site modal with that service preselected (existing plumbing).
- `external_only`: open the service's `bookingDeepLink` directly in a new tab (today's behavior).

### `TemplateOrchestrator.tsx`

Threads `bookingMode` from tenant data down to `TemplateBooking` and into the services component so per-service buttons can branch correctly.

### `SiteEditor` ([SiteEditor.tsx](../../../src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx))

Two additions:

1. **Booking mode** — a 3-button radio group: "In-site only" / "External only" / "Both."
2. **Per-service duration** — a number input with `+/-` step buttons on each service row, range 1–8 hours, label "Duration."

### `ServiceBookingModal.tsx`

No changes required. It already wraps the embedded external flow. In `external_only` and `both` modes, the per-service Book button still uses it for the Acuity case.

---

## API Changes

### `/api/create-booking` ([route.ts](../../../src/app/api/create-booking/route.ts))

Request body adds `duration_minutes: number`. Server-side:

1. Validate `duration_minutes` is in `[60, 480]` and a multiple of 60.
2. Run the conflict check against `bookings` for the same `(tenant_id, booking_date)`, honoring `max_per_slot` per overlapping hour.
3. Insert the booking row with `duration_minutes`.
4. Compute end time as `start + duration_minutes` for the .ics — replacing the hardcoded 1h fallback at [route.ts:104-117](../../../src/app/api/create-booking/route.ts#L104-L117).

### Read paths

`getTodayBookings` / `getUpcomingBookings` ([admin-bookings.ts](../../../src/lib/admin-bookings.ts)) return `duration_minutes` so admin views can show the time range. The existing `BookingRow` component renders it as `"10:00 AM – 1:00 PM"`.

`getBookingMode` ([admin-bookings.ts:22](../../../src/lib/admin-bookings.ts#L22)) is rewritten to be the single source of truth. Today it returns a 2-state union derived from `previews.generated_copy.booking_url`. New shape:

```ts
export type BookingMode =
  | { mode: 'in_site_only' }
  | { mode: 'external_only'; url: string; providerName: string }
  | { mode: 'both'; url: string; providerName: string };
```

Implementation:

1. Look up the tenant by `preview_slug` and read `booking_mode`.
2. If mode is `external_only` or `both`, also read the URL from `previews.generated_copy.booking_url` and run `detectProvider`.
3. If mode says external/both but no URL is present, fall back to `in_site_only` (defensive — should not happen post-migration, but possible during transition).

All call sites — [admin/schedule/page.tsx:35](../../../src/app/site/[slug]/admin/schedule/page.tsx#L35), admin home (per memory 1950), `TemplateOrchestrator` — switch to the discriminated `mode` field instead of `external: boolean`.

---

## Migration

`supabase/migrations/015_service_duration_and_booking_mode.sql`:

```sql
-- 1. tenants.booking_mode
ALTER TABLE tenants
  ADD COLUMN booking_mode text NOT NULL DEFAULT 'in_site_only'
  CHECK (booking_mode IN ('in_site_only', 'external_only', 'both'));

UPDATE tenants t
   SET booking_mode = 'external_only'
  FROM previews p
 WHERE p.slug = t.preview_slug
   AND COALESCE(p.generated_copy ->> 'booking_url', '') <> '';

-- 2. bookings.duration_minutes
ALTER TABLE bookings
  ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60;

-- 3. previews.services[*].duration_minutes backfill
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

Rollback is straightforward: drop the two columns and re-run the JSONB backfill in reverse (strip the field).

---

## Testing

### New unit tests

`src/lib/availability.test.ts`:
- 1h, 2h, 3h, 8h services — start times computed correctly across full open–close range.
- Service longer than the working day returns `[]`.
- Existing booking blocks all overlapping start hours but no others.
- `max_per_slot = 2` correctly allows two concurrent bookings, rejects the third.
- Blocked date returns `[]`.
- Closed weekday returns `[]`.

`src/app/api/create-booking/route.test.ts` (extend existing test if present, otherwise add):
- Multi-hour booking inserts `duration_minutes`.
- Conflict rejected with 409 when overlapping booking exists.
- .ics end time matches start + duration.

### Existing tests

`src/lib/admin-bookings.test.ts` and `src/lib/defaults/businessHours.test.ts` should remain green; no API surface change for those modules.

### Manual smoke

- Tenant with `booking_mode='in_site_only'`: only the primary button renders, no Acuity link.
- Tenant with `booking_mode='both'`: primary button + quiet link.
- Tenant with `booking_mode='external_only'`: today's embed behavior.
- 3h service shows correct time range on confirm and in the email/.ics.
- Mobile (375 px) renders Layout A correctly: full-width primary, centered quiet link.

---

## Files Touched

| File | Change |
|------|--------|
| `supabase/migrations/015_service_duration_and_booking_mode.sql` | New |
| `src/lib/availability.ts` | New — pure functions for `computeAvailableStarts` and conflict check |
| `src/lib/availability.test.ts` | New |
| `src/components/templates/TemplateBooking.tsx` | Add `bookingMode` prop, replace mock slot generator, branch entry CTA, show duration & range |
| `src/components/templates/TemplateOrchestrator.tsx` | Wire `bookingMode` through to TemplateBooking and services |
| `src/components/templates/services/BoldServices.tsx` | Branch per-service Book button on `bookingMode` |
| `src/components/templates/services/VibrantServices.tsx` | Same |
| `src/components/templates/services/ClassicServices.tsx` | Same |
| `src/components/templates/services/ElegantServices.tsx` | Same |
| `src/components/templates/services/WarmServices.tsx` | Same |
| `src/app/api/create-booking/route.ts` | Accept `duration_minutes`, conflict check honoring it, .ics end time |
| `src/lib/admin-bookings.ts` | Return `duration_minutes` from booking reads |
| `src/lib/admin-tenant.ts` | Extend Tenant type with `booking_mode` |
| `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` | Booking-mode radio + per-service duration input |

## Open Questions

None blocking. Items deferred to Spec 2 are listed under Non-Goals.
