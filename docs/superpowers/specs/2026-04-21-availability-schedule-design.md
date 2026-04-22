# Editable Availability Schedule

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

The site footer displays business hours pulled from Google Maps via `previews.hours`. For tenants without Google Maps data, the footer renders nothing — there is no fallback, no editor in the admin UI, and no way to toggle the section on or off.

## Goal

Add an editable availability schedule to the SiteEditor so admins can:

- Edit the hours that appear on the public site
- Show or hide the hours section
- Fall back to a sensible default schedule when no Google Maps data exists
- Restore Google Maps hours after manual edits
- Have booking-system hours take precedence on the public site when present

## Behavior

### Display Precedence (footer)

When rendering the footer, hours are resolved in this order (highest priority wins):

1. `booking_settings.working_hours` (if a booking_settings row exists for the tenant)
2. `previews.hours` (from Google Maps import or manual edits in SiteEditor)
3. **Default schedule** (Mon–Fri 10:00 AM – 7:00 PM, Sat 10:00 AM – 5:00 PM, Sun closed)

### Visibility Toggle

A new key `show_hours` lives in `previews.generated_copy.section_settings` (alongside existing `show_services`, `show_booking`).

- Defaults to `true` (footer always shows hours unless explicitly hidden)
- When `false`, the footer renders no hours block regardless of source data
- Existing rows without `show_hours` are treated as `true` in code — no migration backfill required

### Google Maps Override

When the import flow runs (`/api/import-maps`), the parsed Google hours are written to **two** columns:

- `previews.hours` (existing — what the editor mutates and what the footer reads)
- `previews.imported_hours` (new — immutable snapshot of the original Google import)

Manual edits in SiteEditor only mutate `previews.hours`. The "Reset to Google Maps" button in the editor copies `imported_hours` back into `hours`. The button is hidden when `imported_hours` is null.

## Components

### 1. Database

**New column:**

```sql
ALTER TABLE previews ADD COLUMN imported_hours jsonb;
```

Same shape as `previews.hours`: `{ "Monday": { "open": "10:00 AM", "close": "7:00 PM" }, "Sunday": { "closed": true } }`.

No migration needed for `section_settings.show_hours` — it lives inside an existing JSONB column and missing values are treated as `true`.

### 2. Helper Module

**File:** `src/lib/defaults/businessHours.ts`

Exports:

- `DEFAULT_HOURS: BusinessHours` — the Mon–Fri 10–7 / Sat 10–5 / Sun closed constant
- `resolveDisplayHours(bookingHours, previewHours): BusinessHours` — applies the precedence rule and returns the hours to render
- `getHoursSource(bookingHours, previewHours, importedHours): "booking" | "google" | "custom" | "default"` — used by the SiteEditor source indicator label

### 3. Import Flow Update

**File:** `src/app/api/import-maps/route.ts`

When the Google Maps import succeeds and writes parsed hours, also write the same value to `imported_hours`. Re-importing overwrites both fields — admins lose manual edits if they re-import (acceptable; matches existing re-import semantics).

### 4. TemplateFooter

**File:** `src/components/templates/TemplateFooter.tsx`

Replace the existing `data.hours ? renderHours() : null` check with:

- Read `section_settings.show_hours` (default `true`)
- If false → render no hours block
- Otherwise call `resolveDisplayHours(bookingHours, data.hours)` and render the result

The footer needs access to `booking_settings.working_hours`. Either:

- Pass it through `PreviewData` (preferred — the page that loads the preview already touches Supabase and can fetch booking_settings in the same load)
- Or have the footer accept a separate `bookingHours` prop

The page-level loader at `src/app/site/[slug]/page.tsx` is responsible for the join.

### 5. SiteEditor Hours Section

**File:** `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` (new section, separate from the existing booking-settings hours editor)

UI elements:

- **Header**: "Business Hours" with a toggle switch labeled "Show on website" (writes to `section_settings.show_hours`)
- **Per-day editor**: seven rows (Mon–Sun), each with an open time input, close time input, and "Closed" checkbox. Reuses the same JSX pattern as the existing booking-settings hours editor (extract a shared `<HoursEditor>` component to avoid duplication)
- **Source indicator**: small text label below the header, e.g.:
  - "From Google Maps" (when `previews.hours` matches `imported_hours` exactly)
  - "Custom" (when `previews.hours` differs from `imported_hours`, or `imported_hours` is null but `previews.hours` is set)
  - "Default" (when `previews.hours` is null)
  - The override notice (below) handles the booking-precedence case separately; the source label always reflects what's stored in `previews.hours`.
- **"Reset to Google Maps" button**: visible only when `imported_hours` is not null. On click, sets local state to `imported_hours` (admin must still click Save to persist).
- **"Reset to defaults" button**: always visible. On click, sets local state to `DEFAULT_HOURS`.
- **Override notice**: if `booking_settings.working_hours` exists, render an info banner above the editor: "Your booking schedule is currently displayed on the site. Changes here will only show if you disable booking hours." with a link to the booking settings tab. The editor remains usable (so admins can pre-stage changes).

Saves to `previews.hours` via the same API the SiteEditor already uses to persist preview field changes. The toggle saves to `previews.generated_copy.section_settings.show_hours` via the same path. The implementation plan will identify the exact endpoint (and extend it if it doesn't currently accept `hours` / `section_settings` updates).

## Data Flow

```
Google Maps import
  → /api/import-maps
  → previews.hours = parsed
  → previews.imported_hours = parsed (snapshot)

Admin edit
  → SiteEditor Hours section
  → /api/<existing preview update>
  → previews.hours = new value
  → previews.imported_hours unchanged

Public site render
  → src/app/site/[slug]/page.tsx loads preview + booking_settings
  → TemplateFooter receives both
  → resolveDisplayHours(booking, preview) → renders
```

## Out of Scope

- Unifying `previews.hours` and `booking_settings.working_hours` into a single column (kept separate per existing architecture; precedence handles the relationship)
- A dedicated "Availability" hero section beyond the footer (footer-only for this iteration)
- Time-zone handling (existing system is timezone-naive; not changing that here)
- Per-business-type defaults (single default for all)
- Holiday/exception schedules (single weekly recurring schedule only)

## Testing

- Unit tests for `resolveDisplayHours` covering all precedence combinations and the empty/null cases
- Unit tests for `getHoursSource` covering all four source labels
- Manual verification:
  - Tenant with Google Maps data → footer shows Maps hours
  - Tenant without Google Maps data → footer shows defaults
  - Toggle off → footer shows no hours block
  - Edit hours, save, reload → edited hours appear in footer
  - Edit hours, click "Reset to Google Maps" → original Maps hours restored
  - Tenant with `booking_settings.working_hours` set → footer shows booking hours, editor shows override notice
