# `/booking` entry point for tenant sites

**Date:** 2026-06-14
**Branch:** `feat/tenant-booking-route`
**Status:** Approved design

## Problem

Google Business Profile lets a business set a custom "Booking" link (e.g.
`https://www.novarabeautyluxe.com/booking`). We want every tenant site to expose
a stable `/booking` URL the founder can paste into GBP for each client.

Today that URL 404s. The custom-domain middleware
(`src/middleware.ts`) already rewrites `www.novarabeautyluxe.com/booking` →
`/site/{preview_slug}/booking`, but no such route exists.

## Goal

A request to `/booking` on a tenant domain lands on the tenant's homepage and
**immediately opens the in-site booking calendar at the service-list step** —
identical to clicking the general "Book Now" CTA on the site.

## Scope

**In scope**
- A `/booking` route under `src/app/site/[slug]/`.
- Auto-opening the in-site booking flow (the calendar modal) on load.

**Out of scope (YAGNI)**
- `external_only` tenants. This feature is for **in-site booking only**. For
  `external_only` tenants there is no in-site calendar, so `/booking` simply
  renders the homepage and the auto-open no-ops. Those clients point GBP at
  their provider directly, not at `/booking`.
- Per-tenant on/off toggle. Every tenant gets `/booking` automatically.
- Database changes, GBP API integration, new analytics events. The existing
  booking funnel tracking still fires when the modal opens.

## Behavior detail

The in-site booking flow (`CustomerBookingFlow`) starts at the `"service"` step
(the "Select a Service" list) when no service is preselected, and jumps straight
to the date/time step only when a service *is* preselected
(`CustomerBookingFlow.tsx:210-211`).

`/booking` must replicate the **general "Book Now" CTA**, i.e. open the calendar
with **no** preselected service so the customer lands on the service list. The
implementation must therefore NOT set a pending/initial service.

- `in_site_only` → opens calendar at the service-list step. ✅ primary case.
- `both` → opens the in-site calendar directly at the service-list step. We
  intentionally **skip** the "in-site vs external" choice dialog that the
  homepage CTA shows in `both` mode, because this entry point is explicitly for
  in-site booking.
- `external_only` → no in-site calendar exists; route renders the homepage and
  the auto-open effect no-ops.

## Architecture

### 1. New route — `src/app/site/[slug]/booking/page.tsx` (server component)

Renders the same homepage as `/site/[slug]`, passing a new `autoOpenBooking`
flag down to the client tree.

To avoid duplicating the ~60-line tenant data loader, **extract** the existing
`getSiteData()` function out of `src/app/site/[slug]/page.tsx` into a shared
module `src/app/site/[slug]/getSiteData.ts` (exporting `getSiteData` and the
`SiteData` type). Both the homepage route and the `/booking` route import it.
This is the only refactor to existing code and is confined to a mechanical move.

Metadata for the `/booking` route:
- `robots: { index: false, follow: true }` — utility entry point, keep it out of
  the index to avoid duplicate-content with `/`.
- `alternates.canonical` → the tenant homepage via `tenantUrl()` (tenant pages
  otherwise inherit the root layout's canonical → siteforowners.com).

### 2. Thread `autoOpenBooking?: boolean`

Prop drilled through the existing render chain, defaulting to `false` so the
homepage route is unchanged:

`booking/page.tsx` → `SiteClient` → `TemplateOrchestrator` → `TemplateBooking`.

### 3. `TemplateBooking` — auto-open effect

Add one `useEffect` that runs once on mount: when `autoOpenBooking` is true and
in-site booking is available, call `setShowBookingCalendar(true)` **without**
setting `pendingServiceName` (so the flow opens at the service-list step).

"In-site booking available" is the existing condition already used for the
calendar: `effectiveMode === "in_site_only" || effectiveMode === "both" ||
showInternalBooking`. Extract this predicate into a small pure helper for
testability (see Testing). The existing `handleHash` / `handleClick` handlers
are left unchanged.

## Components & responsibilities

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `getSiteData.ts` | Load tenant + preview data for a slug | Supabase admin client |
| `site/[slug]/page.tsx` | Render homepage (autoOpenBooking=false) | `getSiteData`, `SiteClient` |
| `site/[slug]/booking/page.tsx` | Render homepage with autoOpenBooking=true + noindex/canonical | `getSiteData`, `SiteClient` |
| `SiteClient` / `TemplateOrchestrator` | Forward `autoOpenBooking` prop | — |
| `TemplateBooking` | On mount, auto-open in-site calendar at service step | `shouldAutoOpenInSiteCalendar` |
| `shouldAutoOpenInSiteCalendar` | Pure decision: should `/booking` open the calendar? | — |

## Testing

**Unit (TDD, written first):** `shouldAutoOpenInSiteCalendar(effectiveMode, showInternalBooking)`
- `in_site_only` → true
- `both` → true
- `external_only` (no internal booking) → false
- `external_only` but `showInternalBooking` true → true (defensive)

**Manual:**
- `/booking` on an `in_site_only` tenant → calendar opens at "Select a Service".
- `/booking` on an `external_only` tenant → homepage renders, no modal.
- Existing homepage "Book Now" CTA and per-service buttons unchanged.

## Rollout

Pure additive route + one prop. No migration. Once merged, the founder pastes
`https://www.{client-domain}/booking` into each client's GBP Booking field.
