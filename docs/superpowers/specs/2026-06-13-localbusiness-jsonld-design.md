# Per-Tenant LocalBusiness JSON-LD — Design

**Date:** 2026-06-13
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/localbusiness-jsonld`

## Problem

Tenant public sites emit dynamic metadata, Open Graph, Twitter cards, canonicals
(on landing pages), and per-tenant sitemaps — but **no schema.org structured
data**. For local-service businesses (salons, barbershops, restaurants, nail
techs), `LocalBusiness` JSON-LD is the single highest-leverage SEO gap: it is
what powers Google rich results and feeds the local/map pack.

This adds a `LocalBusiness` JSON-LD block to every (non-demo) tenant homepage,
populated entirely from data the page already loads.

## Scope

**In scope (v1):**
- One `LocalBusiness` (or appropriate subtype) JSON-LD block on each tenant site
  homepage (`/site/[slug]`).
- A pure, unit-tested helper that maps existing tenant/preview data to the graph.

**Out of scope (v1):**
- Landing pages (`/l/{service}-{area}`) — homepage only for now.
- `aggregateRating` — deliberately omitted (see Decisions).
- `geo` coordinates — no lat/long data exists; geocoding deferred (YAGNI).
- `priceRange` — no aggregated price data; deferred.
- Structured address parsing (street/city/state/zip) — address stays free-text.
- robots.txt / other SEO gaps — tracked separately.

## Decisions

1. **Omit `aggregateRating`.** We hold a Google Maps `rating`/`review_count`,
   but Google's structured-data guidelines prohibit a business marking up
   ratings collected elsewhere as its own `aggregateRating` on its own site.
   Including it risks a manual penalty. Revisit only if/when a first-party
   review system exists.
2. **Homepage only.** One canonical business entity per tenant. Landing-page
   `Service` nodes can come later.
3. **`HairSalon` for `barbershop`.** schema.org has no `BarberShop` type;
   `HairSalon` is the closest valid LocalBusiness subtype.
4. **Skip geo and priceRange in v1** — data not available; not required by Google
   for valid LocalBusiness markup when a postal address is present.

## Architecture

One pure helper + one render point. No new data fetching.

### Helper — `src/lib/seo-localbusiness.ts`

```
buildLocalBusinessJsonLd(siteData: SiteData, canonicalUrl: string): object | null
```

- Pure function: input is the already-fetched `SiteData` (from `getSiteData()`)
  plus the tenant's canonical URL; output is a plain JS object (the JSON-LD
  graph) or `null`.
- No I/O — fully unit-testable.
- Returns `null` when the tenant is a demo, or when there is no meaningful
  business data to emit.

### Render point — `src/app/site/[slug]/page.tsx`

- Call the helper with the existing `SiteData` and the canonical URL built via
  the existing `tenantUrl(APP_URL, ctx.hostFields, "/")` helper
  (`src/lib/tenant-url.ts`), so the `url` reflects the custom domain / subdomain.
- When the helper returns an object, render:
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
  />
  ```
- When it returns `null`, render nothing.

## Schema type mapping (`@type`)

Source: `preview.business_type` (enum).

| business_type                          | @type        |
| -------------------------------------- | ------------ |
| `salon`, `braids`, `locs`, `locs_and_braids` | `HairSalon`  |
| `barbershop`                           | `HairSalon`  |
| `nails`                                | `NailSalon`  |
| `restaurant`                           | `Restaurant` |

All are valid `LocalBusiness` subtypes (beauty types under
`HealthAndBeautyBusiness`; restaurant under `FoodEstablishment`). Unknown/unset
type falls back to generic `LocalBusiness`.

## Field mapping

All optional fields are **conditionally included** — never emit empty strings,
empty arrays, or `null` (these trip up validators).

| JSON-LD field                 | Source                                                            | Notes |
| ----------------------------- | ---------------------------------------------------------------- | ----- |
| `@context`                    | `"https://schema.org"`                                            | constant |
| `@type`                       | mapping table above                                              | |
| `name`                        | `preview.business_name`                                          | required |
| `description`                 | `generated_copy.en.google_business_description` → `seo_description` → `hero_subheadline` | first non-empty |
| `url`                         | `canonicalUrl`                                                   | tenant canonical host |
| `telephone`                   | `preview.phone`                                                  | omit if empty |
| `image`                       | `preview.images[0]`                                             | omit if absent |
| `logo`                        | `generated_copy.logo`                                           | omit if absent |
| `address`                     | `PostalAddress` { `streetAddress`: `preview.address`, `addressLocality`: `seo_locality`? } | omit whole node if no address text |
| `openingHoursSpecification`   | built from `siteData.bookingHours` (working_hours)              | array; skip closed days |
| `sameAs`                      | non-empty values of `generated_copy.social_links` (IG/FB/TikTok) | omit if none |
| `areaServed`                  | `preview.seo_locality`                                          | omit if absent |

### Opening hours conversion

`bookingHours` is a map of day → `{ open, close }` (or null/closed). Convert to
schema.org `OpeningHoursSpecification` entries:

```json
{
  "@type": "OpeningHoursSpecification",
  "dayOfWeek": "https://schema.org/Monday",
  "opens": "10:00",
  "closes": "19:00"
}
```

- Skip days that are closed / null.
- Map full day names to schema.org day URLs (or bare day names — both valid;
  pick bare day names like `"Monday"` for brevity).
- If no days have hours, omit `openingHoursSpecification` entirely.

## Edge cases / guards

- **Demo tenants** (`siteData.isDemo === true`): helper returns `null` — mirrors
  the existing homepage `robots: { index: false }` behavior so demos never emit
  business structured data.
- **Preview-only tenants** (no custom domain/subdomain): `canonicalUrl` falls
  back to the `/site/{slug}` path via existing `tenantUrl()` logic — acceptable.
- **Missing address**: omit the `address` node rather than emitting an empty
  `PostalAddress`.
- **No meaningful data** (e.g. only a name): still valid to emit name + url; only
  return `null` for demo or genuinely empty records.

## Testing

Unit tests on the pure helper (`src/lib/seo-localbusiness.test.ts` or project
convention):

1. **Type mapping** — each `business_type` produces the correct `@type`;
   unknown falls back to `LocalBusiness`.
2. **Demo → null** — `isDemo: true` returns `null`.
3. **Hours conversion** — open days produce specs; closed/null days are skipped;
   no hours → field omitted.
4. **Field omission** — empty phone/images/logo/social/address are absent from
   output (no empty strings or null values).
5. **Social assembly** — `sameAs` contains only non-empty handles/URLs.
6. **Description fallback chain** — picks google_business_description, then
   seo_description, then hero_subheadline.

No rendering/integration test needed: it is a pure function dropped into a single
`<script>` tag. A manual check against Google's Rich Results Test on a live
tenant is the acceptance check.

## Files touched

- **New:** `src/lib/seo-localbusiness.ts` — the helper.
- **New:** `src/lib/seo-localbusiness.test.ts` — unit tests.
- **Edit:** `src/app/site/[slug]/page.tsx` — call helper, render `<script>`.

No DB migrations. No new dependencies.
