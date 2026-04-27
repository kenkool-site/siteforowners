# Spec 4: Booking Polish — Design

**Date:** 2026-04-27
**Status:** Approved (pending written review)

## Goal

Improve the customer booking experience and the owner's services management with four tightly-scoped additions:

1. **Service categories** — owner-defined groups so the public services list is browsable
2. **Per-service add-ons** — optional extras that customers can tack onto a booking (extra time + extra price)
3. **Booking modal redesign** — split into a 2-screen flow so customers see service details and pick add-ons before choosing a time
4. **Stable IDs in ServiceRow** — preserve client-side state across renames

Hour-range blocking ("Closed Wed 2-5pm") is **deferred to Spec 5**.

## Non-goals

- Drag-to-reorder UI for categories (use up/down arrows instead — drag deferred to a later polish pass)
- Tenant-wide add-ons pool (per-service only — see [§ Add-ons](#add-ons))
- Persisted category collapse state across page loads (component-local only)
- Migration script for backfilling `client_id` on existing services (lazy backfill on first edit)
- Booking modal redesign on the operator-side admin schedule (this spec only touches the customer-facing modal)

## Architecture overview

Spec 4 lives entirely within existing surfaces — no new database tables, no new infra, no migration. Two fields are added to the existing `previews.data` JSONB:

- `previews.categories?: string[]` — owner-managed list (top-level)
- `previews.services[].category?`, `previews.services[].add_ons?`, `previews.services[].client_id?` — per-service additions

The booking modal is rewritten as a 2-screen state machine. Each of the 5 service templates (Bold, Vibrant, Classic, Elegant, Warm) gets a small category-grouping pass.

Backward compatible end-to-end: a tenant with no categories defined renders today's flat list; a service with no add-ons renders today's modal.

## Data model

### Top-level (in `previews.data`)

```ts
{
  categories?: string[];   // owner-managed ordered list
  services: ServiceItem[]; // existing
}
```

### ServiceItem additions

```ts
interface ServiceItem {
  // existing fields:
  name: string;
  price: string;
  description?: string;
  duration_minutes?: number;
  image?: string;
  bookingDeepLink?: string;

  // new:
  client_id?: string;              // UUID, stable across renames
  category?: string;               // must match one of previews.categories if set
  add_ons?: AddOn[];               // max 5 per service
}

interface AddOn {
  name: string;                    // ≤ 80 chars (server truncates silently)
  price_delta: number;             // ≥ 0
  duration_delta_minutes: number;  // ≥ 0, multiple of 30
}
```

### Constraints

- `previews.categories` — max 10 entries, each ≤ 60 chars, deduplicated, non-empty after trim
- `service.category` — if present, must exist in `previews.categories` (server validates and returns field error if not)
- `service.add_ons` — max 5 per service
- `add_on.name` — truncated to 80 chars server-side (matches existing service-name pattern)
- `add_on.duration_delta_minutes` — must be a non-negative multiple of 30 (matches the 30-min granularity established in v2 booking)
- `add_on.price_delta` — must be a non-negative number (parsed via `parseFloat`, max 2 decimals)
- Total booking duration (base + sum of selected add-on `duration_delta_minutes`) is capped at 12h (existing constraint via `wouldExceedCapacity`)

### Server-side cascade rules

When a category is **renamed** (the owner changes "Knotless Braids" to "Knotless"):
- The PATCH request body contains both the new `categories` array AND the existing `services[]` array
- The client must update both before sending — server treats the request as a single atomic update
- Server validates: every `service.category` value must exist in the new `categories` array

When a category is **deleted**:
- Client confirms with the owner ("3 services use this category. Remove it?")
- Client nullifies `category` on referencing services before sending
- Server again validates atomically

This keeps server logic simple (validate-then-write) and pushes the "what will be affected" UX to the client where it belongs.

## Owner UI

### Categories panel (services admin page)

Rendered above the services list on `/site/[slug]/admin/services`:

```
┌─ Categories ─────────────────────────────────────┐
│  [Knotless Braids ↑↓ ✎ ×]  [Touch ups ↑↓ ✎ ×]    │
│  [Natural Styles ↑↓ ✎ ×]   [+ Add category]      │
└──────────────────────────────────────────────────┘
```

- Each chip shows: name, up/down arrows for reorder, edit icon (inline rename), × to remove
- "+ Add category" appends a new pill in inline-edit mode
- Renaming opens an inline text input with Enter to commit, Esc to cancel; commits update both `categories` and any `services[].category` referring to the old name
- Removing prompts a confirmation dialog stating the count of affected services
- Hidden entirely if owner has not yet added their first category (the "+ Add category" button is shown standalone with brief help text: "Group your services so customers can browse them.")

### ServiceRow additions

Inside the existing expanded view (below price/duration, above description):

**Category dropdown:**
- Renders only if `previews.categories.length > 0`
- Options: `(no category)` + each defined category
- If owner has zero categories, replaced with hint: "Tip: add categories above to group services"

**Add-ons editor:**
- New "Add-ons" subsection below description
- Each add-on row: `[name input]  [+min select]  [+price input]  [×]`
- `+min select` options: 0, 30, 60, 90, 120 (multiples of 30 only, matching the 30-min slot grid established in v2 booking)
- `+price input` is a numeric field with currency prefix (matches existing service price input)
- "+ Add add-on" button below; disabled when 5 rows are present
- Empty add-ons array does not render the subsection header (clean state)

### Stable IDs

The existing `normalizeService` helper in `ServicesClient.tsx` is extended to assign `client_id: crypto.randomUUID()` to any service missing one. The helper runs at two points only:
- **On initial load** — when API data first arrives, the array is normalized and the result is set into component state. UUIDs are assigned once and reused for every subsequent render.
- **On save response merge** — when the API echoes back the persisted services, the same normalize pass re-asserts UUIDs (in case any were generated client-side and need to be persisted).

New services created in the editor get a `client_id` at the moment of creation (in the "+ Add service" handler). Existing services without one are assigned a UUID on first load; the UUID persists once the owner saves. React keys throughout `ServicesClient` and `ServiceRow` use `service.client_id` (guaranteed present after normalize).

No migration job needed — backfill is opportunistic.

## Public site rendering

Each of the 5 templates uses a shared `groupServices` helper:

```ts
type Group = { label: string | null; services: ServiceItem[] };

function groupServices(services: ServiceItem[], categories?: string[]): Group[] {
  if (!categories?.length) return [{ label: null, services }];

  const groups: Group[] = categories.map(c => ({
    label: c,
    services: services.filter(s => s.category === c),
  }));

  const uncategorized = services.filter(
    s => !s.category || !categories.includes(s.category)
  );
  if (uncategorized.length) groups.push({ label: "Other", services: uncategorized });

  return groups.filter(g => g.services.length); // hide empty groups
}
```

### Per-template header treatment

Each template renders its category header in its own aesthetic:

- **Bold:** uppercase tracking-wide divider, primary-color underline
- **Vibrant:** large gradient-tinted heading
- **Classic:** serif italic with thin centered rule
- **Elegant:** ultra-thin uppercase, letterspaced, subtle
- **Warm:** small rounded pill label

Each header is a `<button>` with a chevron toggle for collapse/expand. Default state: **expanded**. Collapsed state is component-local React state (no localStorage, no URL param).

The "Other" bucket follows the same template aesthetic but uses a muted color variant to visually de-emphasize it.

### Fallback (no categories)

If `previews.categories` is undefined or empty, `groupServices` returns a single group with `label: null`. Templates render this as the existing flat list — no header, no chevron, identical to today's behavior.

## Booking modal redesign

State machine inside `BookingModal`:

```ts
type Step = "details" | "schedule";

interface ModalState {
  step: Step;
  service: ServiceItem;
  selectedAddOns: AddOn[];   // by reference (or by client-side index)
  selectedDate: Date | null;
  selectedSlot: string | null;
  contact: { name: string; email: string; phone: string };
}
```

### Screen 1 — Details + Date

Top-to-bottom:

1. **Step indicator + close** — "Step 1 of 2 — Details" + ×
2. **Service details panel** — image (if present), name, base price, base duration, full description (no clamping)
3. **Add-ons section** (renders only if `service.add_ons.length > 0`) — checkbox list
4. **Running total bar** — "Total: 2h 30m · $275" (recomputes live as add-ons toggle)
5. **Date picker** — existing component, unchanged
6. **Continue → CTA** — disabled until a date is picked

### Screen 2 — Time + Contact

Top-to-bottom:

1. **Step indicator + back link + close** — "← Back · Step 2 of 2"
2. **Compact summary header** — service name + selected date + total in a single tinted bar
3. **Time slots grid** — uses **total duration** (base + selected add-on `duration_delta_minutes`)
4. **Contact form** — name, email, phone (existing fields)
5. **Confirm booking CTA**

### Behavior

- **Add-on toggle re-filters slots in place.** When the user returns to Screen 2 after toggling an add-on on Screen 1, the slot grid is recomputed. If the previously-selected slot no longer fits, it auto-deselects with an inline notice: "Time deselected — pick a new one."
- **Empty time grid** shows: "No times available with the selected add-ons. Try removing one or picking another date."
- **Back navigation** preserves all state (add-ons, date, slot if still valid, contact form values).
- **No add-ons configured** → Screen 1 omits the section entirely (no empty header, no zero-add-on placeholder).
- **Sticky CTA on mobile.** Continue / Confirm CTA pins to the bottom so it remains tap-reachable above the keyboard.

### Mobile-specific

- Modal occupies full viewport on mobile (no surrounding chrome) — feels native, not popup
- Time slot grid is 3 columns on mobile, 4 on desktop; tap targets ≥ 44px
- Calendar collapses to single-month view; arrow buttons (no swipe — keep simple) move between months

### Booking submission payload

The POST to `/api/bookings/create` is extended:

```ts
{
  // existing:
  service_name: string;
  date: string;
  start_time: string;
  contact: { name, email, phone };
  duration_minutes: number;   // already exists — now reflects total

  // new:
  selected_add_ons?: AddOn[];   // omitted if none selected
  total_price?: number;          // omitted if no add-ons (price field on service is the source)
}
```

These fields persist in the booking record so:
- SMS templates render add-ons in the operator notification
- Admin schedule shows the total duration block, not just the base
- The customer confirmation email can list selected add-ons (separate spec — out of scope here)

## Validation rules summary

| Field | Constraint | On violation |
|---|---|---|
| `categories[]` | max 10 entries, each ≤ 60 chars, deduplicated | Server returns 400 with field error |
| `service.category` | must exist in `categories[]` if set | Server returns 400 with field error |
| `service.add_ons` | max 5 per service | Server truncates to 5, surfaces warning |
| `add_on.name` | ≤ 80 chars | Server truncates silently (matches existing pattern) |
| `add_on.duration_delta_minutes` | ≥ 0, multiple of 30 | Server returns 400 with field error |
| `add_on.price_delta` | ≥ 0, max 2 decimals | Server returns 400 with field error |
| Total duration | ≤ 12h (base + add-ons) | Client prevents add-on selection that would exceed |

## Edge cases

- **Renaming a category that conflicts** — owner tries to rename "Touch ups" to "Knotless Braids" (which exists). Client validates uniqueness inline before commit.
- **Service with category that no longer exists** — defensive: server treats as uncategorized in `groupServices` (the `!categories.includes(s.category)` clause). Should not happen if cascade is correct, but harmless if it does.
- **Add-on selected at booking time, then deleted by owner** — booking record snapshots the add-ons in `selected_add_ons`, so the booking remains valid and the operator schedule reflects what was actually agreed.
- **Owner deletes all categories with services still referencing them** — confirmation dialog ("X services will become uncategorized"); on confirm, all references are nullified.
- **Mobile keyboard covering CTA** — sticky positioning + `safe-area-inset-bottom` padding on the CTA container.

## Testing strategy

### Unit

- `groupServices` helper: empty categories → flat group; categories with all services categorized → no Other; mixed → ordered groups + Other; categories with stale references → falls into Other
- AddOn validation: negative values, non-multiples-of-30, name truncation
- Category cascade on rename: services with old name updated to new
- Total duration computation: base + sum of selected add-ons

### Integration

- POST `/api/admin/services` with categories + add-ons + stale `service.category` → 400 with field error
- POST `/api/admin/services` with category rename + service references → atomic update succeeds, services reflect new name
- POST `/api/bookings/create` with add-ons → booking record contains `selected_add_ons` and total duration

### E2E (manual, on smoke-test branch)

1. Owner creates 3 categories, assigns services to each, renames one — verify public page reflects rename
2. Owner adds 2 add-ons to a service (one with +30min, one with +60min)
3. Customer opens booking modal → sees Screen 1 with both add-ons
4. Customer selects both add-ons → total updates → Continue
5. Screen 2 slot grid filtered by total duration — verify late-day slots removed
6. Customer hits ← Back, deselects an add-on, hits Continue — slot grid expands back
7. Customer confirms — operator receives SMS with add-ons listed
8. Owner views admin schedule — booking block reflects total duration

## File scope

### New
- `siteforowners/src/components/templates/services/groupServices.ts` — shared grouping helper
- `siteforowners/src/components/booking/BookingModal/Screen1Details.tsx`
- `siteforowners/src/components/booking/BookingModal/Screen2Schedule.tsx`
- (May restructure existing `BookingModal.tsx` into a state-machine container that renders one of the two screens)

### Modified
- `siteforowners/src/lib/ai/types.ts` — extend `ServiceItem`, add `AddOn`, add `categories` field
- `siteforowners/src/app/api/admin/services/route.ts` — validate categories + add-ons + cascade renames
- `siteforowners/src/app/api/bookings/create/route.ts` — accept and persist `selected_add_ons`, compute total duration
- `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx` — render categories panel, normalize `client_id`
- `siteforowners/src/app/site/[slug]/admin/_components/ServiceRow.tsx` — category dropdown, add-ons editor
- `siteforowners/src/components/templates/services/{Bold,Vibrant,Classic,Elegant,Warm}Services.tsx` — render category headers
- `siteforowners/src/components/booking/BookingModal.tsx` — convert to state machine

### Tests
- `siteforowners/src/components/templates/services/groupServices.test.ts`
- `siteforowners/src/lib/validation/categories.test.ts`
- `siteforowners/src/lib/validation/add-ons.test.ts`
- Integration tests in existing `services-api.test.ts`, `bookings-api.test.ts`

## Open questions for the owner (Kenneth)

None remaining — all decisions captured above. The implementation plan can be drafted directly from this document.
