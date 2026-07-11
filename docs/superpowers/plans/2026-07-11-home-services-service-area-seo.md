# Home-Services Service-Area SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish useful English and Spanish city pages for home-services tenants, with safe founder-managed content, reciprocal locale metadata, private-address-free structured data, and sitemap inclusion only for eligible pages.

**Architecture:** Store service areas in a dedicated tenant-scoped table with independent locale content and publish flags. Shared pure helpers decide eligibility, paths, metadata, and structured data; all routes and sitemap generation use the same rules. New routes are guarded by `business_type === "home_services"` so stylist routing and `/l/*` SEO pages remain unchanged.

**Tech Stack:** Next.js 14 App Router metadata APIs, TypeScript strict mode, Supabase PostgreSQL/RLS, schema.org JSON-LD, React 18, Node test runner through `tsx`.

## Prerequisites

Complete:

1. `docs/superpowers/plans/2026-07-11-home-services-template-foundation.md`
2. `docs/superpowers/plans/2026-07-11-home-services-estimate-messaging.md`

This plan consumes `TemplateRouter`, `HomeServicesTemplate`, tenant locale
routes, `HomeServicesConfig`, gallery project IDs, service IDs, and estimate
prefill behavior.

## Global Constraints

- English homepage: `/`; Spanish homepage: `/es`.
- English area page: `/service-areas/{slug}`.
- Spanish area page: `/es/service-areas/{slug}`.
- Every new locale/area route returns not found for non-home-services tenants.
- A locale is publishable only when its publish flag is true and it has a
  headline, at least 120 characters of useful body copy, SEO title, and SEO
  description.
- Unpublished/incomplete pages return not found and never enter the sitemap.
- English and Spanish publish independently.
- Each published page has a self-canonical and reciprocal `hreflang` only for
  published peer locales; `x-default` points to English.
- No home-services JSON-LD contains `streetAddress`.
- `areaServed` comes from published service-area records.
- Structured data omits unknown values and never invents claims.
- Existing stylist homepage, `/booking`, `/l/*`, LocalBusiness schema, and
  sitemap behavior remain unchanged.
- Founder CRUD is simple and separate from contractor-facing UI.
- Duplicate `(tenant_id, slug)` returns HTTP 409 with a clear founder error.
- Do not add bulk AI page generation or city-name substitution.

---

## File Structure

Create:

- `supabase/migrations/034_home_service_areas.sql` — area table, indexes, RLS.
- `src/lib/home-services/service-area-types.ts` — database/domain types.
- `src/lib/home-services/service-area-slug.ts` — deterministic slug helper.
- `src/lib/home-services/service-area-slug.test.ts` — slug tests.
- `src/lib/home-services/publish-eligibility.ts` — locale blockers and publish decision.
- `src/lib/home-services/publish-eligibility.test.ts` — eligibility tests.
- `src/lib/home-services/service-area-paths.ts` — locale path helpers.
- `src/lib/home-services/service-area-paths.test.ts` — path tests.
- `src/lib/home-services/load-service-areas.ts` — server-only tenant-scoped loaders.
- `src/lib/home-services/service-area-page-context.ts` — shared route context loader.
- `src/lib/home-services/area-validation.ts` — founder payload validation.
- `src/lib/home-services/area-validation.test.ts` — field/publish validation.
- `src/lib/seo-hreflang.ts` — reusable alternates helper.
- `src/lib/seo-hreflang.test.ts` — reciprocal locale tests.
- `src/lib/seo-home-services-jsonld.ts` — LocalBusiness and OfferCatalog builders.
- `src/lib/seo-home-services-jsonld.test.ts` — privacy and area tests.
- `src/lib/seo-home-services-metadata.ts` — homepage/area metadata builder.
- `src/app/site/[slug]/service-areas/[areaSlug]/page.tsx` — English area route.
- `src/app/site/[slug]/es/service-areas/[areaSlug]/page.tsx` — Spanish area route.
- `src/components/templates/home-services/ServiceAreaPage.tsx` — shared localized page.
- `src/app/api/admin/home-service-areas/route.ts` — founder GET/POST.
- `src/app/api/admin/home-service-areas/[id]/route.ts` — founder PATCH/DELETE.
- `src/app/(admin)/clients/[tenantId]/edit/HomeServiceAreasEditor.tsx` — focused area editor.
- `tests/home-services-area-routes.test.mjs` — route guards.
- `tests/home-services-sitemap.test.mjs` — sitemap branch contract.

Modify:

- `src/app/site/[slug]/getSiteData.ts` — expose tenant host fields and skip booking queries for home services.
- `src/app/site/[slug]/page.tsx` — use shared home-services alternates/JSON-LD.
- `src/app/site/[slug]/es/page.tsx` — use shared home-services alternates/JSON-LD.
- `src/app/site/[slug]/sitemap/route.ts` — business-type branch and published area URLs.
- `src/components/templates/home-services/HomeServicesServiceAreas.tsx` — replace summary-only display with published links.
- `src/components/templates/home-services/HomeServicesNav.tsx` — preserve matching area on locale switch through page props.
- `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` — mount area editor.

---

### Task 1: Add tenant-scoped service-area persistence

**Files:**
- Create: `supabase/migrations/034_home_service_areas.sql`
- Create: `src/lib/home-services/service-area-types.ts`

**Interfaces:**
- Produces: `home_service_areas` and `HomeServiceArea`.
- Consumed by: every later task.

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/034_home_service_areas.sql
CREATE TABLE IF NOT EXISTS home_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  city text NOT NULL,
  state_region text NOT NULL,
  slug text NOT NULL,
  headline_en text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  seo_title_en text NOT NULL DEFAULT '',
  seo_description_en text NOT NULL DEFAULT '',
  published_en boolean NOT NULL DEFAULT false,
  headline_es text NOT NULL DEFAULT '',
  body_es text NOT NULL DEFAULT '',
  seo_title_es text NOT NULL DEFAULT '',
  seo_description_es text NOT NULL DEFAULT '',
  published_es boolean NOT NULL DEFAULT false,
  service_client_ids text[] NOT NULL DEFAULT '{}',
  nearby_area_ids uuid[] NOT NULL DEFAULT '{}',
  linked_project_ids text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS home_service_areas_tenant_order_idx
  ON home_service_areas (tenant_id, sort_order, city);

CREATE INDEX IF NOT EXISTS home_service_areas_published_en_idx
  ON home_service_areas (tenant_id, sort_order)
  WHERE published_en = true;

CREATE INDEX IF NOT EXISTS home_service_areas_published_es_idx
  ON home_service_areas (tenant_id, sort_order)
  WHERE published_es = true;

ALTER TABLE home_service_areas ENABLE ROW LEVEL SECURITY;
```

No anon/authenticated policies are added.

- [ ] **Step 2: Define exact domain types**

```typescript
// src/lib/home-services/service-area-types.ts
import type { HomeServicesLocale } from "./types";

export interface HomeServiceAreaRow {
  id: string;
  tenant_id: string;
  city: string;
  state_region: string;
  slug: string;
  headline_en: string;
  body_en: string;
  seo_title_en: string;
  seo_description_en: string;
  published_en: boolean;
  headline_es: string;
  body_es: string;
  seo_title_es: string;
  seo_description_es: string;
  published_es: boolean;
  service_client_ids: string[];
  nearby_area_ids: string[];
  linked_project_ids: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface HomeServiceAreaLocaleContent {
  headline: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  published: boolean;
}

export function areaLocaleContent(
  area: HomeServiceAreaRow,
  locale: HomeServicesLocale,
): HomeServiceAreaLocaleContent {
  return locale === "es"
    ? {
        headline: area.headline_es,
        body: area.body_es,
        seoTitle: area.seo_title_es,
        seoDescription: area.seo_description_es,
        published: area.published_es,
      }
    : {
        headline: area.headline_en,
        body: area.body_en,
        seoTitle: area.seo_title_en,
        seoDescription: area.seo_description_en,
        published: area.published_en,
      };
}
```

- [ ] **Step 3: Apply and verify the migration**

Use the same development migration process as Plan 2. Verify:

```sql
SELECT relrowsecurity
FROM pg_class
WHERE relname = 'home_service_areas';
```

Expected: `true`.

- [ ] **Step 4: Commit Task 1**

```bash
git add supabase/migrations/034_home_service_areas.sql src/lib/home-services/service-area-types.ts
git commit -m "feat: add home-service area records"
```

---

### Task 2: Implement slugs, paths, and publish eligibility

**Files:**
- Create: `src/lib/home-services/service-area-slug.ts`
- Create: `src/lib/home-services/service-area-slug.test.ts`
- Create: `src/lib/home-services/service-area-paths.ts`
- Create: `src/lib/home-services/service-area-paths.test.ts`
- Create: `src/lib/home-services/publish-eligibility.ts`
- Create: `src/lib/home-services/publish-eligibility.test.ts`

**Interfaces:**
- Produces: deterministic slugs, public paths, and one shared eligibility decision.
- Consumed by: admin API, routes, language switch, sitemap, metadata.

- [ ] **Step 1: Write failing slug/path tests**

```typescript
test("builds stable city-state slugs", () => {
  assert.equal(buildServiceAreaSlug("Missouri City", "TX"), "missouri-city-tx");
  assert.equal(buildServiceAreaSlug("  Sugar Land ", "Texas"), "sugar-land-texas");
});

test("builds locale-specific area paths", () => {
  assert.equal(serviceAreaPath("en", "richmond-tx"), "/service-areas/richmond-tx");
  assert.equal(serviceAreaPath("es", "richmond-tx"), "/es/service-areas/richmond-tx");
});
```

- [ ] **Step 2: Implement slug and path helpers**

```typescript
import { slugifyTopic } from "@/lib/slugify-topic";

export function buildServiceAreaSlug(city: string, stateRegion: string): string {
  return slugifyTopic(`${city.trim()} ${stateRegion.trim()}`);
}

export function serviceAreaPath(
  locale: HomeServicesLocale,
  slug: string,
): string {
  return locale === "es"
    ? `/es/service-areas/${slug}`
    : `/service-areas/${slug}`;
}
```

Reject an empty generated slug in API validation.

- [ ] **Step 3: Write publish-eligibility tests**

Cover independently:

- publish flag false;
- missing headline;
- body length 119;
- body length 120;
- missing SEO title;
- missing SEO description;
- English complete while Spanish incomplete;
- Spanish complete while English incomplete.
- Spanish homepage missing hero or SEO copy;
- complete Spanish homepage content.

- [ ] **Step 4: Implement a blocker list as the source of truth**

```typescript
export const MIN_SERVICE_AREA_BODY_CHARS = 120;

export type ServiceAreaPublishBlocker =
  | "not_marked_published"
  | "missing_headline"
  | "body_too_short"
  | "missing_seo_title"
  | "missing_seo_description";

export function listServiceAreaPublishBlockers(
  area: HomeServiceAreaRow,
  locale: HomeServicesLocale,
): ServiceAreaPublishBlocker[] {
  const content = areaLocaleContent(area, locale);
  const blockers: ServiceAreaPublishBlocker[] = [];
  if (!content.published) blockers.push("not_marked_published");
  if (!content.headline.trim()) blockers.push("missing_headline");
  if (content.body.trim().length < MIN_SERVICE_AREA_BODY_CHARS) blockers.push("body_too_short");
  if (!content.seoTitle.trim()) blockers.push("missing_seo_title");
  if (!content.seoDescription.trim()) blockers.push("missing_seo_description");
  return blockers;
}

export function isServiceAreaLocalePublished(
  area: HomeServiceAreaRow,
  locale: HomeServicesLocale,
): boolean {
  return listServiceAreaPublishBlockers(area, locale).length === 0;
}
```

In the same module, add:

```typescript
export function isHomepageLocalePublished(
  preview: PreviewData,
  locale: HomeServicesLocale,
): boolean {
  const copy = preview.generated_copy?.[locale];
  return Boolean(
    copy?.hero_headline.trim() &&
    copy.hero_subheadline.trim() &&
    copy.seo_title.trim() &&
    copy.seo_description.trim(),
  );
}
```

- [ ] **Step 5: Run Task 2 tests**

```bash
npx tsx --test \
  src/lib/home-services/service-area-slug.test.ts \
  src/lib/home-services/service-area-paths.test.ts \
  src/lib/home-services/publish-eligibility.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add \
  src/lib/home-services/service-area-slug* \
  src/lib/home-services/service-area-paths* \
  src/lib/home-services/publish-eligibility*
git commit -m "feat: define service-area publishing rules"
```

---

### Task 3: Add validated founder CRUD and simple editing

**Files:**
- Create: `src/lib/home-services/area-validation.ts`
- Create: `src/lib/home-services/area-validation.test.ts`
- Create: `src/app/api/admin/home-service-areas/route.ts`
- Create: `src/app/api/admin/home-service-areas/[id]/route.ts`
- Create: `src/app/(admin)/clients/[tenantId]/edit/HomeServiceAreasEditor.tsx`
- Modify: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`

**Interfaces:**
- Consumes: table, slug helper, blocker list, founder admin cookie.
- Produces: tenant-scoped CRUD and a compact founder editor.

- [ ] **Step 1: Write payload-validation tests**

Test:

- city/state required and capped at 100 characters;
- slug generated when absent;
- manual slug normalized;
- body capped at 5,000;
- SEO title capped at 70;
- SEO description capped at 170;
- publish true rejected with blocker list when locale content is incomplete;
- service/project/nearby IDs accept arrays of non-empty strings only.

- [ ] **Step 2: Implement payload validation**

```typescript
export type AreaValidationResult =
  | { ok: true; value: HomeServiceAreaWrite }
  | { ok: false; errors: { field: string; reason: string }[] };

export function parseHomeServiceAreaWrite(
  raw: unknown,
  existing?: HomeServiceAreaRow,
): AreaValidationResult {
  // Normalize strings and arrays.
  // Use buildServiceAreaSlug when slug is absent.
  // Construct a candidate row and reject enabled publish flags with blockers.
}
```

Do not silently turn invalid publish flags off; return field errors so the
founder understands why publication is blocked.

- [ ] **Step 3: Implement founder-authenticated GET and POST**

Use the exact admin cookie check from `/api/update-site`:

```typescript
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionCookie = request.cookies.get("admin_session")?.value;
if (!adminPassword || sessionCookie !== adminPassword) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

GET requires `tenantId` and returns rows ordered by `sort_order, city`.

POST requires `{ tenantId, area }`, validates that the tenant's preview is
`home_services`, and inserts with server-supplied `tenant_id`.

Map PostgreSQL unique violation `23505` to HTTP 409:

```json
{ "error": "A service area with this URL slug already exists." }
```

- [ ] **Step 4: Implement PATCH and DELETE**

Both routes must:

- require founder auth;
- load by both `id` and body/query `tenantId`;
- return 404 on cross-tenant IDs;
- validate the merged candidate for PATCH;
- set `updated_at` explicitly;
- return 409 for duplicate slug.

DELETE is permanent but requires `{ tenantId, confirm: true }`.

- [ ] **Step 5: Build the simple editor**

UI:

- collapsed list rows with city/state and EN/ES status badges;
- Add area;
- English and Español tabs;
- headline, body, SEO title, SEO description;
- services multi-select by `ServiceItem.client_id`;
- nearby areas selector excluding itself;
- project selector by gallery project ID;
- slug preview and optional edit;
- publish toggle that shows blocker messages;
- Save and Delete.

Do not add maps, keyword scoring, AI bulk generation, tables, or analytics.

- [ ] **Step 6: Run tests and build**

```bash
npx tsx --test src/lib/home-services/area-validation.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add \
  src/lib/home-services/area-validation* \
  src/app/api/admin/home-service-areas \
  "src/app/(admin)/clients/[tenantId]/edit"
git commit -m "feat: manage bilingual service areas"
```

---

### Task 4: Add shared tenant loaders and SEO builders

**Files:**
- Create: `src/lib/home-services/load-service-areas.ts`
- Create: `src/lib/seo-hreflang.ts`
- Create: `src/lib/seo-hreflang.test.ts`
- Create: `src/lib/seo-home-services-metadata.ts`
- Create: `src/lib/seo-home-services-jsonld.ts`
- Create: `src/lib/seo-home-services-jsonld.test.ts`
- Modify: `src/app/site/[slug]/getSiteData.ts`

**Interfaces:**
- Produces: published area loaders, alternates, metadata, LocalBusiness and OfferCatalog JSON-LD.
- Consumed by: homepages, area routes, sitemap.

- [ ] **Step 1: Add tenant host fields to shared site data**

Extend `SiteData`:

```typescript
tenantHostFields: {
  custom_domain: string | null;
  subdomain: string | null;
  preview_slug: string;
};
```

For `home_services`, skip the `booking_settings` query and return neutral booking
defaults. Existing verticals keep the current query and values.

- [ ] **Step 2: Implement tenant-scoped loaders**

```typescript
export async function loadHomeServiceAreas(
  tenantId: string,
): Promise<HomeServiceAreaRow[]>;

export async function loadPublishedHomeServiceArea(
  tenantId: string,
  slug: string,
  locale: HomeServicesLocale,
): Promise<HomeServiceAreaRow | null>;
```

Never query by slug without tenant ID.
Implement `loadHomeServiceAreas` with
`.from("home_service_areas").select("*").eq("tenant_id", tenantId)
.order("sort_order").order("city")`.

Implement `loadPublishedHomeServiceArea` with tenant ID and slug equality,
`.maybeSingle()`, then return the row only when
`isServiceAreaLocalePublished(row, locale)` is true.

- [ ] **Step 3: Write and implement hreflang tests**

```typescript
const alternates = buildHomeServicesAlternates({
  canonical: "https://example.com/es/service-areas/richmond-tx",
  en: "https://example.com/service-areas/richmond-tx",
  es: "https://example.com/es/service-areas/richmond-tx",
});
assert.equal(alternates.languages?.["x-default"], "https://example.com/service-areas/richmond-tx");
```

When Spanish is unpublished, omit `es` but keep English and `x-default`.

- [ ] **Step 4: Write JSON-LD privacy tests**

Test:

- `@type` is `HomeAndConstructionBusiness`;
- no serialized `streetAddress` even when `preview.address` is populated;
- `areaServed` includes only published city/state names;
- services become an `OfferCatalog`;
- missing phone/services omitted;
- demo tenant returns `null`.

- [ ] **Step 5: Implement home-services JSON-LD**

```typescript
export function buildHomeServicesLocalBusinessJsonLd(input: {
  preview: PreviewData;
  canonicalUrl: string;
  locale: HomeServicesLocale;
  serviceAreas: HomeServiceAreaRow[];
  isDemo: boolean;
}): Record<string, unknown> | null;

export function buildHomeServicesOfferCatalogJsonLd(input: {
  preview: PreviewData;
  canonicalUrl: string;
  locale: HomeServicesLocale;
}): Record<string, unknown> | null;
```

Build objects explicitly. Do not call the stylist helper and delete its address
afterward.

- [ ] **Step 6: Implement metadata builder**

Inputs:

```typescript
interface HomeServicesMetadataInput {
  title: string;
  description: string;
  canonicalUrl: string;
  englishUrl: string;
  spanishUrl: string | null;
  businessName: string;
  image?: string;
}
```

Return title, description, canonical, language alternates, Open Graph, and
Twitter metadata. Use the same business-name/share-title convention as the
existing homepage.

- [ ] **Step 7: Run SEO tests**

```bash
npx tsx --test \
  src/lib/seo-hreflang.test.ts \
  src/lib/seo-home-services-jsonld.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add \
  src/lib/home-services/load-service-areas.ts \
  src/lib/seo-hreflang* \
  src/lib/seo-home-services-* \
  "src/app/site/[slug]/getSiteData.ts"
git commit -m "feat: build home-services local SEO data"
```

---

### Task 5: Publish English and Spanish service-area routes

**Files:**
- Create: `src/components/templates/home-services/ServiceAreaPage.tsx`
- Create: `src/lib/home-services/service-area-page-context.ts`
- Create: `src/app/site/[slug]/service-areas/[areaSlug]/page.tsx`
- Create: `src/app/site/[slug]/es/service-areas/[areaSlug]/page.tsx`
- Create: `tests/home-services-area-routes.test.mjs`

**Interfaces:**
- Consumes: site data, published area loader, metadata/JSON-LD, estimate prefill.
- Produces: localized city pages and guarded routes.

- [ ] **Step 1: Write route contract test**

```javascript
for (const file of [
  "src/app/site/[slug]/service-areas/[areaSlug]/page.tsx",
  "src/app/site/[slug]/es/service-areas/[areaSlug]/page.tsx",
]) {
  const source = await readFile(file, "utf8");
  assert.match(source, /business_type\s*!==\s*["']home_services["']/);
  assert.match(source, /notFound\(\)/);
  assert.match(source, /loadPublishedHomeServiceArea/);
  assert.match(source, /generateMetadata/);
}
```

- [ ] **Step 2: Implement one shared route loader**

Create a server helper local to the home-services route area:

```typescript
export async function loadServiceAreaPageContext(
  previewSlug: string,
  areaSlug: string,
  locale: HomeServicesLocale,
): Promise<ServiceAreaPageContext | null> {
  // getSiteData
  // require home_services and tenantId
  // load all areas and target published area
  // resolve selected services, projects, nearby areas
  // derive canonical and alternate locale URLs
}
```

Peer locale URL is `null` when that locale is not eligible.

- [ ] **Step 3: Implement `ServiceAreaPage`**

Render:

1. Home-services navigation with locale link when peer exists.
2. City headline/body.
3. Services selected by `service_client_ids`.
4. Projects selected by `linked_project_ids`.
5. Configured reviews when available.
6. Nearby eligible area links.
7. Estimate form prefilled with source area.
8. Address-free footer and mobile actions.

Do not duplicate the entire homepage component.

- [ ] **Step 4: Implement both routes and metadata**

Both routes:

- call the shared loader in page and `generateMetadata`;
- call `notFound()` for missing/ineligible context;
- use selected-locale content only;
- serialize JSON-LD with existing safe serializer;
- set a self-canonical;
- add reciprocal language alternates only when published.

- [ ] **Step 5: Run route contract, typecheck, and build**

```bash
npx tsx --test tests/home-services-area-routes.test.mjs
npx tsc --noEmit
npm run build
```

Expected: PASS and both dynamic routes appear in build output.

- [ ] **Step 6: Commit Task 5**

```bash
git add \
  src/components/templates/home-services/ServiceAreaPage.tsx \
  "src/app/site/[slug]" \
  tests/home-services-area-routes.test.mjs
git commit -m "feat: publish bilingual service-area pages"
```

---

### Task 6: Link areas from homepages and branch the sitemap

**Files:**
- Modify: `src/components/templates/home-services/HomeServicesServiceAreas.tsx`
- Modify: `src/components/templates/home-services/HomeServicesTemplate.tsx`
- Modify: `src/app/site/[slug]/page.tsx`
- Modify: `src/app/site/[slug]/es/page.tsx`
- Modify: `src/app/site/[slug]/sitemap/route.ts`
- Create: `tests/home-services-sitemap.test.mjs`

**Interfaces:**
- Consumes: published areas, path helper, shared eligibility.
- Produces: linked homepage cards, full locale metadata, correct sitemap branch.

- [ ] **Step 1: Pass published areas into the template**

Extend `TemplateRouterProps` with optional:

```typescript
homeServiceAreas?: HomeServiceAreaRow[];
```

English homepage receives areas eligible in English; Spanish receives areas
eligible in Spanish. Previews without a tenant receive `[]`.

- [ ] **Step 2: Replace summary-only area rendering**

Render each eligible city as a link from `serviceAreaPath(locale, slug)`. Keep the
coverage summary above the list. If no area records are eligible, render only
the summary; if both are empty, omit the section.

- [ ] **Step 3: Update homepage metadata and JSON-LD**

English and Spanish homepages use:

- shared metadata builder;
- reciprocal homepage URLs when Spanish homepage content is complete;
- `areaServed` from published areas;
- no address.

Existing stylist metadata remains in its current branch.

- [ ] **Step 4: Write sitemap branch contract**

Test source and pure URL generation:

- stylist branch still calls `listLandingPages`;
- home-services branch does not call `/l/*`;
- English and Spanish homepages included only when publishable;
- each area locale included only when `isServiceAreaLocalePublished`;
- URLs use `tenantUrl()` and `serviceAreaPath()`.

- [ ] **Step 5: Implement sitemap branching**

Implement this exact business-type branch while preserving the current stylist
branch body:

```typescript
if (preview.business_type !== "home_services") {
  return existingStylistSitemap(preview, tenant);
}

const areas = await loadHomeServiceAreas(tenant.id);
const paths = [
  "/",
  ...(isHomepageLocalePublished(preview, "es") ? ["/es"] : []),
  ...areas.flatMap((area) => [
    ...(isServiceAreaLocalePublished(area, "en") ? [serviceAreaPath("en", area.slug)] : []),
    ...(isServiceAreaLocalePublished(area, "es") ? [serviceAreaPath("es", area.slug)] : []),
  ]),
];
```

Return XML with escaped URLs and existing cache headers.

- [ ] **Step 6: Run sitemap tests and build**

```bash
npx tsx --test tests/home-services-sitemap.test.mjs
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add \
  src/components/templates/home-services \
  "src/app/site/[slug]/page.tsx" \
  "src/app/site/[slug]/es/page.tsx" \
  "src/app/site/[slug]/sitemap/route.ts" \
  tests/home-services-sitemap.test.mjs
git commit -m "feat: link and index published service areas"
```

---

### Task 7: Full SEO, privacy, and regression verification

**Files:**
- Modify only files required by discovered failures.

**Interfaces:**
- Consumes: complete service-area implementation.
- Produces: verified crawlability and no stylist regressions.

- [ ] **Step 1: Run all automated checks**

```bash
/bin/zsh -lc "npx tsx --test $(rg --files src -g '*.test.ts' | tr '\n' ' ') tests/*.test.mjs"
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify locale publication behavior**

Create:

- one area published in both languages;
- one English-only area;
- one incomplete area with publish flags false.

Verify:

- valid routes return 200;
- missing locale routes return 404;
- language switch appears only for published peers;
- incomplete area never appears in homepage links or sitemap.

- [ ] **Step 3: Verify metadata**

Inspect rendered head for:

- self-canonical;
- English/Spanish alternate links;
- `x-default` to English;
- localized title/description;
- matching Open Graph URL;
- no canonical inherited from `siteforowners.com`.

- [ ] **Step 4: Verify structured data privacy**

Use a tenant whose internal `preview.address` is populated. Confirm every
home-services homepage and area JSON-LD:

- contains no street address;
- lists only published `areaServed` cities;
- lists real configured services;
- contains no fabricated rating/review/license fields.

- [ ] **Step 5: Verify sitemap separation**

Home-services sitemap:

- includes `/`, eligible `/es`, and eligible area URLs;
- includes no `/l/*`.

Stylist sitemap:

- still includes existing `/l/*` pages;
- includes no home-service area URLs.

- [ ] **Step 6: Verify founder simplicity**

At 375 px and desktop, confirm founder area editing can:

- add one city;
- write both locales;
- understand publish blockers;
- publish one locale independently;
- handle duplicate slug 409;
- delete with confirmation.

Confirm no contractor dashboard or public editor link was added.

- [ ] **Step 7: Resolve verification findings in the owning task**

For each defect, add a failing regression test to the task that introduced the
behavior, implement the fix, rerun that task's checks, and use that task's
explicit commit command. Do not create an empty verification commit.

## Plan 3 Exit Criteria

- Every published city page has meaningful selected-locale content.
- English and Spanish routes are independently crawlable and reciprocal.
- Incomplete locales return 404 and never enter the sitemap.
- Home-services JSON-LD never exposes private street addresses.
- Founder CRUD is simple, tenant-scoped, and duplicate-safe.
- Home-services and stylist sitemap/SEO behavior remain isolated.
