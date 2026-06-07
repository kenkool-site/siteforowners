# Square Booking Import

**Date:** 2026-06-06
**Status:** Approved for planning

## Problem

The onboarding import pipeline (`POST /api/import-booking`) has dedicated extractors for Acuity, Booksy, and Vagaro, but **not for Square**. Square is advertised as a supported platform in the wizard UI ("Have a Booksy, Acuity, Vagaro, or Square page?") and is detected for display purposes in `src/lib/admin-bookings.ts`, yet there is no importer — Square URLs fall through to the generic Claude HTML-parsing fallback.

That fallback gets **nothing usable**. A `*.square.site` page is a client-rendered SPA (Square's Weebly stack); the server-fetched HTML contains zero service data — no service names, prices, or durations. So Square prospects either get an empty services list or Claude-invented services, while Acuity/Booksy/Vagaro prospects get their real catalog. This is the "Square import doesn't work like Acuity" gap.

## Goal

Add a dedicated Square importer that pulls the prospect's real service catalog (names, prices, durations) into the preview, matching the quality of the Acuity/Booksy/Vagaro importers. Strictly additive: any failure degrades to today's Claude fallback, so Square can only get better.

## Discovery (how Square exposes the data)

Square Online sites serve their appointment catalog from a **public, unauthenticated JSON endpoint**:

```
GET https://{subdomain}.square.site/app/square-sync/published/users/{user_id}/site/{site_id}/appointments/services/{seller_key}?return_bookable=true
```

Verified against the sample `https://slayedbyshy-106546.square.site/`:
- Returns Square's canonical Catalog schema (`{ items, categories }`) — better structured than the Acuity HTML scrape.
- Reproducible with a plain server-side `curl` (no cookies, no auth, no CSRF) — drops into the pipeline exactly like the Booksy API call.
- Returned 17 items with names, prices, durations, all `available_for_booking: true`.

All four URL parameters are present in the initial page HTML (which the import handler **already fetches** for the Acuity/Vagaro checks):

| Param | Source in static HTML | Sample value |
|---|---|---|
| `subdomain` | the request URL host | `slayedbyshy-106546` |
| `user_id` | `"user":{"id":155720808}` | `155720808` |
| `site_id` | `"site_id":401536933602187772` | `401536933602187772` |
| `seller_key` | `data-seller-key="L0X4205E9K5DZ"` | `L0X4205E9K5DZ` |

So no headless browser is needed at import time — scrape the params from the already-fetched HTML, then make one additional API call.

## Scope

**In scope (MVP):**
- Services: name, price, duration, bookable filtering.
- Detection + graceful fallback to the existing Claude path.

**Out of scope (deferred fast-follow):**
- **Service images** — items carry `image_ids` (catalog object IDs), but the services feed has no resolvable URLs; resolving them needs a second per-item call. Omitted for MVP.
- **Add-ons** — Square models add-ons as separate items/modifiers, not as Acuity-style `addonIDs`. MVP imports them as plain services (the owner prunes in the wizard); no dedicated add-on extraction.

## Architecture

Mirror the Booksy/Vagaro pattern: isolate Square logic in its own lib module, with a thin extractor in the route. (Chosen over inlining in `route.ts`, which is already ~1000 lines, and over Square's OAuth Catalog API, which would break the zero-friction "paste a public URL" onboarding model.)

### New file: `src/lib/square-import.ts`

- `SQUARE_HOST_RE` — matches `*.square.site` / `squareup.com`; rejects other platforms.
- `scrapeSquareParams(html, url): SquareParams | null` — regex-extract `seller_key`, `user_id`, `site_id` from `html`, derive `subdomain` from `url`. Returns `null` if **any** of the four is missing.
- `fetchSquareServices(params): Promise<SquareCatalog>` — GET the square-sync services endpoint with `Accept: application/json` and a browser-like UA. Reuse the pipeline's existing retry/backoff helper if Booksy/Vagaro use one, for parity.
- `mapSquareToBookingCategories(catalog): BookingCategory[]` — pure mapper (Square Catalog → the same `BookingCategory[]` shape Booksy/Acuity emit), with `duration` as a `"{n} min"` string for parity with the other extractors.

### Thin extractor in `route.ts`: `extractSquareData(html, url)`

Orchestrates scrape → fetch → map. Returns `null` on any miss (params absent, fetch failure, or zero services after mapping) so the handler continues to the Claude fallback.

### Detection wiring (POST handler platform chain)

Insert the Square check after Booksy/Vagaro/Acuity and **before** the Claude fallback. Reuses the already-fetched page HTML — the only new network call is the single square-sync request. Then flatten to the return payload's flat `services` array via `servicesFromAcuityCategories` (same as the other structured platforms). Log which path was taken, matching existing platform logging.

### Duration-cap change (the one shared-code edit)

`durationMinutesFromImportLabel` currently hard-caps at 480 min (`route.ts:613`), and every structured platform's durations flow through it via `servicesFromAcuityCategories`. To let Square's authoritative long durations (510/570 min) survive, parameterize the cap:

- `durationMinutesFromImportLabel(duration: string, maxMinutes = 480)` — default preserves the exact current behavior for **all existing callers** (Acuity, Booksy, Vagaro, Claude).
- `servicesFromAcuityCategories(categories: BookingCategory[], maxMinutes = 480)` — threads the cap through.
- The Square branch calls `servicesFromAcuityCategories(squareCategories, 720)` — a 12-hour ceiling that admits full-day braiding appointments while still rejecting garbage values.

This is the only change to shared code; it is backward-compatible by construction (defaulted parameter).

## Data mapping & rules

For each `items[]` entry where `type === "ITEM"`, iterate `item_data.variations[]` and emit one service row per `item_variation_data`:

- **Name** — single-variation items (variation name `"Regular"`) use the item name alone. Multi-variation items append the variation name: `"{item} – {variation}"` (matches Booksy variant handling).
- **Price** — `price_money.amount` is in **cents**; divide by 100 and format as a `"$NN"` string for the pipeline.
- **Duration** — `service_duration` is in **milliseconds**; divide by 60000 and emit as a `"{n} min"` string. The shared `servicesFromAcuityCategories` then snaps it to the pipeline's existing 30-minute granularity (the booking system is 30-min-aligned, and every sample value is already a multiple of 30) and applies the **relaxed 720-min cap** rather than 480. (Square durations are exact and authoritative — unlike the scraped/guessed values the original 480 cap was built for — so the sample's 510- and 570-min braiding services pass through un-truncated.)
- **Categories** — build from the `categories[]` array when present (map `category_id` / `categories[].id` → name). When absent (as in the sample), all services land uncategorized in a single default group; the pipeline already handles this.

**Skip a row when any of:**
- `available_for_booking === false`
- name matches `/deposit|booking fee/i` (deposits are not browsable services)
- `pricing_type !== "FIXED_PRICING"` (variable/no-price items can't render a price)

Output is `BookingCategory[]`, identical in shape to what Booksy/Acuity return — so the downstream return payload, `servicesFromAcuityCategories`/`servicesFromBookingCategories`, and merge logic need no shape changes (only the defaulted cap parameter described above).

## Error handling

Every failure degrades to the existing Claude fallback — never surfaces an error to the user:

- `scrapeSquareParams` → `null` if any of the 4 identifiers is missing.
- `fetchSquareServices` wrapped in try/catch: non-200, timeout, or invalid JSON → `null`.
- Empty result (zero services survive filtering/mapping) → `null`, so we don't publish an empty catalog over a page Claude might partially parse.
- `extractSquareData` returning `null` causes the handler to continue the chain to the Claude fallback.

## Testing

TDD against the real captured sample. Per project convention, tests run via `npx tsx --test`. TypeScript strict — no `any`.

- **Fixture:** save the captured services payload (17 items) as a test fixture, plus a representative HTML snippet of the sample page for param scraping.
- **`scrapeSquareParams`** — extracts all 4 params from the HTML snippet; returns `null` when one is removed.
- **`mapSquareToBookingCategories`** (on the fixture) — asserts: the `$20` deposit item is filtered out; the remaining real services are present; prices are in dollars (cents ÷ 100); duration strings are correct; multi-variation naming is correct.
- **`durationMinutesFromImportLabel`** — `("570 min", 720)` returns 570 (not capped); `("570 min")` still returns 480 (default cap unchanged → proves backward compatibility for other platforms).
- **`SQUARE_HOST_RE`** — matches `square.site` / `squareup.com`; rejects `acuity`/`booksy` URLs.
- **Not unit-tested:** the live network fetch (external dependency); covered by a manual verify against the live sample URL after implementation.

## Success criteria

- Importing `https://slayedbyshy-106546.square.site/` yields ~15 real services with correct names, prices, and full durations (including 510/570-min services), no deposit entries.
- A non-Square URL is unaffected (regex rejects it).
- A Square URL whose endpoint fails or returns nothing falls back to the Claude path with no user-facing error.
