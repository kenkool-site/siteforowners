# Default Service Card Images — Design

**Date:** 2026-06-08
**Status:** Approved (pending spec review)
**Scope:** Service cards only — the built-in `DEFAULT_SERVICES` list

## Problem

When a tenant site has no real service photos (no Google Maps photos, no booking-app
images, no owner uploads), service cards fall back to the built-in `DEFAULT_SERVICES`
list in `src/lib/templates/default-services.ts`. Today each service's image is chosen by
`serviceImage(type, index)`, which reuses the same 6 per-vertical hero stock photos from
`stock-photos.ts` in array order. The result: a card's photo rarely matches its service
name — e.g. "Color Treatment" shows a generic salon interior, "Silk Press" shows a
styling station. The photos read as filler.

## Goal

Every default service card shows a photo that actually depicts **that** service, so the
fallback looks intentional rather than generic.

## Non-Goals (explicitly out of scope)

- **Hero / gallery defaults** (`stock-photos.ts`) — left untouched.
- **Name-based matching for real imported services** — services imported from a booking
  app with names but no photos continue to render as they do today (no synthetic image).
  Only the fixed `DEFAULT_SERVICES` list is curated.
- **New verticals or component/template changes.**

## Approach

**Explicit per-service curated photo.** Replace the index-based `serviceImage(type, index)`
mapping with a hand-picked Pexels image per service.

- Each `DEFAULT_SERVICES` entry keeps its current `name` / `price` and gets a curated
  `image` chosen to depict that specific service, with a `// comment` describing the photo
  (matching the convention in `stock-photos.ts`).
- Export the existing `pexels(id)` helper from `stock-photos.ts` and reuse it so curated
  URLs share the same compression/width params.
- Remove the `serviceImage()` helper (only used here once all entries are explicit).
- `stock-photos.ts` (hero/gallery) is **not** modified.

Source remains Pexels (free, commercial use, no attribution required) — same as today.

### Coverage

44 service entries total: salon (6), barbershop (6), restaurant (6), nails (6),
braids (10), locs (10).

## Curation Criteria

Each curated photo must:

1. **Depict the actual service** — close-up "action" shots of the service beat generic
   interiors (e.g. "Hot Towel Shave" → a real shave; "Gel Manicure" → gel application;
   "Starter Locs" → starter locs).
2. **Be verified live** — returns HTTP 200 at curation time.
3. **Tie-breaker → audience fit** — when two photos match equally well, prefer ones
   reflecting Black / Dominican-owned-shop clientele. Alignment stays the priority.
4. **Render well on a card** — works cropped to the card aspect ratio, decent resolution.

Hard-to-photograph services (e.g. restaurant "Beverages" vs "Daily Specials",
"Loc Consultation") get the closest sensible match and are flagged during review.

## Validation & Review

- **Browser approval (during implementation):** all picks laid out in the visual companion,
  grouped by vertical, each card showing service name + proposed photo. User flags any to
  swap; re-curate and re-show until approved.
- **Live-URL check:** a script `curl`s every curated URL and reports non-200s so no dead
  links ship.
- **Test:** extend/add a test asserting every `DEFAULT_SERVICES` entry has a non-empty,
  well-formed `image`, with URLs unique per vertical. No network calls in the test itself
  (CI must not depend on Pexels availability).
- **TypeScript strict + lint clean.**

## Affected Files

- `src/lib/templates/default-services.ts` — rewrite image assignments; remove `serviceImage()`.
- `src/lib/templates/stock-photos.ts` — export `pexels()` helper. No data changes.
- Test file for default services (extend existing or add `default-services.test.ts`).

## Risks

- **Pexels link rot** over time — mitigated by the curl check at curation and the
  "verified as of <date>" comment convention.
- **Subjective matches** — mitigated by the browser approval loop.
