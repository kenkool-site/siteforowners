# Per-Tenant LocalBusiness JSON-LD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit schema.org `LocalBusiness` JSON-LD on every (non-demo) tenant site homepage, populated from data the page already loads.

**Architecture:** One pure, unit-tested helper (`buildLocalBusinessJsonLd`) maps the already-fetched `SiteData` + canonical URL to a JSON-LD object (or `null`). The homepage server component (`site/[slug]/page.tsx`) computes the canonical URL in `getSiteData()` and renders the object in a `<script type="application/ld+json">` tag.

**Tech Stack:** Next.js 14 (App Router) Server Components, TypeScript strict, `node:test` + `tsx` for unit tests.

---

## File Structure

- **Create:** `src/lib/seo-localbusiness.ts` — the pure helper + `@type` mapping. One responsibility: data → JSON-LD object.
- **Create:** `src/lib/seo-localbusiness.test.ts` — unit tests (`node:test`).
- **Modify:** `src/app/site/[slug]/page.tsx` — extend `getSiteData()` to fetch host fields + compute `canonicalUrl`; render the `<script>` in the default export.

No migrations, no new dependencies.

---

## Reference: existing shapes (do not change)

From `src/lib/ai/types.ts`:

```typescript
export type BusinessType = 'salon' | 'barbershop' | 'restaurant' | 'nails' | 'braids' | 'locs';

export interface SocialLinks { instagram?: string; facebook?: string; tiktok?: string; }

export interface PreviewData {
  business_name: string;
  business_type: BusinessType;
  phone?: string;
  address?: string;
  seo_locality?: string | null;
  images?: string[];
  generated_copy?: GeneratedCopy; // .en.google_business_description, .en.seo_description, .en.hero_subheadline, .logo?, .social_links?
  // ...other fields
}
```

From `src/app/site/[slug]/page.tsx`:

```typescript
type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

interface SiteData {
  preview: PreviewData;
  bookingHours: BookingHoursMap;
  // ...
  isDemo: boolean;
}
```

Note: `generated_copy.logo` and `generated_copy.social_links` exist in stored data but `GeneratedCopy` in types.ts only declares `social_links`. Access `logo` defensively via a cast (see Task 1) — do not edit the shared type in this plan.

From `src/lib/tenant-url.ts`: `tenantUrl(appUrl, { custom_domain, subdomain, preview_slug }, path)`.

---

## Task 1: Create the `@type` mapping + helper skeleton (returns null cases)

**Files:**
- Create: `src/lib/seo-localbusiness.ts`
- Test: `src/lib/seo-localbusiness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/seo-localbusiness.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalBusinessJsonLd } from "./seo-localbusiness";
import type { PreviewData } from "@/lib/ai/types";

function siteData(preview: Partial<PreviewData>, overrides: Record<string, unknown> = {}) {
  return {
    preview: { business_name: "Acme", business_type: "salon", services: [], color_theme: "salon_gold", ...preview } as PreviewData,
    bookingHours: null,
    isDemo: false,
    ...overrides,
  } as Parameters<typeof buildLocalBusinessJsonLd>[0];
}

test("returns null for demo tenants", () => {
  const out = buildLocalBusinessJsonLd(siteData({}, { isDemo: true }), "https://acme.com/");
  assert.equal(out, null);
});

test("returns null when there is no business name", () => {
  const out = buildLocalBusinessJsonLd(siteData({ business_name: "  " }), "https://acme.com/");
  assert.equal(out, null);
});

test("emits @context, name, and url for a minimal valid business", () => {
  const out = buildLocalBusinessJsonLd(siteData({ business_name: "Acme Salon" }), "https://acme.com/") as Record<string, unknown>;
  assert.equal(out["@context"], "https://schema.org");
  assert.equal(out.name, "Acme Salon");
  assert.equal(out.url, "https://acme.com/");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: FAIL — cannot find module `./seo-localbusiness`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/seo-localbusiness.ts`:

```typescript
import type { BusinessType, PreviewData, SocialLinks } from "@/lib/ai/types";

type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

/** Minimal shape this helper consumes from getSiteData(). */
export interface LocalBusinessInput {
  preview: PreviewData;
  bookingHours: BookingHoursMap;
  isDemo: boolean;
}

/** Map our business_type enum to the most specific valid schema.org LocalBusiness subtype. */
function schemaType(businessType: BusinessType | undefined): string {
  switch (businessType) {
    case "nails":
      return "NailSalon";
    case "restaurant":
      return "Restaurant";
    case "salon":
    case "barbershop":
    case "braids":
    case "locs":
      return "HairSalon"; // schema.org has no BarberShop type
    default:
      return "LocalBusiness";
  }
}

export function buildLocalBusinessJsonLd(
  input: LocalBusinessInput,
  canonicalUrl: string,
): Record<string, unknown> | null {
  if (input.isDemo) return null;

  const { preview } = input;
  const name = preview.business_name?.trim();
  if (!name) return null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType(preview.business_type),
    name,
    url: canonicalUrl,
  };

  return jsonLd;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo-localbusiness.ts src/lib/seo-localbusiness.test.ts
git commit -m "feat: LocalBusiness JSON-LD helper skeleton with type mapping"
```

---

## Task 2: Type mapping coverage

**Files:**
- Modify: `src/lib/seo-localbusiness.test.ts`
- (implementation already complete in Task 1 — this task locks behavior with tests)

- [ ] **Step 1: Write the failing/confirming test**

Append to `src/lib/seo-localbusiness.test.ts`:

```typescript
test("maps each business_type to the correct schema.org @type", () => {
  const cases: [PreviewData["business_type"], string][] = [
    ["salon", "HairSalon"],
    ["barbershop", "HairSalon"],
    ["braids", "HairSalon"],
    ["locs", "HairSalon"],
    ["nails", "NailSalon"],
    ["restaurant", "Restaurant"],
  ];
  for (const [type, expected] of cases) {
    const out = buildLocalBusinessJsonLd(siteData({ business_type: type }), "https://x.com/") as Record<string, unknown>;
    assert.equal(out["@type"], expected, `business_type ${type}`);
  }
});

test("falls back to LocalBusiness for an unknown type", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({ business_type: "spaceship" as unknown as PreviewData["business_type"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(out["@type"], "LocalBusiness");
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: PASS (5 tests). If a mapping fails, fix `schemaType()` in `src/lib/seo-localbusiness.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seo-localbusiness.test.ts
git commit -m "test: cover LocalBusiness @type mapping for all business types"
```

---

## Task 3: Add description, telephone, image, and logo (with omission rules)

**Files:**
- Modify: `src/lib/seo-localbusiness.ts`
- Modify: `src/lib/seo-localbusiness.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/seo-localbusiness.test.ts`:

```typescript
test("description prefers google_business_description, then seo_description, then hero_subheadline", () => {
  const withGbp = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: { google_business_description: "GBP desc", seo_description: "SEO desc", hero_subheadline: "Hero" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(withGbp.description, "GBP desc");

  const withSeo = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: { google_business_description: "  ", seo_description: "SEO desc", hero_subheadline: "Hero" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(withSeo.description, "SEO desc");

  const withHero = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: { google_business_description: "", seo_description: "", hero_subheadline: "Hero" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(withHero.description, "Hero");
});

test("omits telephone, image, logo, and description when absent or empty", () => {
  const out = buildLocalBusinessJsonLd(siteData({ phone: "  ", images: [] }), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("telephone" in out));
  assert.ok(!("image" in out));
  assert.ok(!("logo" in out));
  assert.ok(!("description" in out));
});

test("includes telephone, image, and logo when present", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({
      phone: "+1 718 555 0100",
      images: ["https://cdn/x.jpg", "https://cdn/y.jpg"],
      generated_copy: { en: {}, logo: "https://cdn/logo.png" } as unknown as PreviewData["generated_copy"],
    }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.equal(out.telephone, "+1 718 555 0100");
  assert.equal(out.image, "https://cdn/x.jpg");
  assert.equal(out.logo, "https://cdn/logo.png");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: FAIL — description/telephone/image/logo are undefined.

- [ ] **Step 3: Write the implementation**

In `src/lib/seo-localbusiness.ts`, add a helper above `buildLocalBusinessJsonLd` and extend the builder. Replace the `return jsonLd;` block:

```typescript
/** First non-empty trimmed string, or undefined. */
function firstNonEmpty(...values: (string | undefined | null)[]): string | undefined {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}
```

Then, before `return jsonLd;`, add:

```typescript
  const en = preview.generated_copy?.en as Record<string, string> | undefined;
  const description = firstNonEmpty(
    en?.google_business_description,
    en?.seo_description,
    en?.hero_subheadline,
  );
  if (description) jsonLd.description = description;

  const telephone = preview.phone?.trim();
  if (telephone) jsonLd.telephone = telephone;

  const image = preview.images?.[0]?.trim();
  if (image) jsonLd.image = image;

  // logo lives in stored generated_copy but is not declared on GeneratedCopy.
  const logo = (preview.generated_copy as { logo?: string } | undefined)?.logo?.trim();
  if (logo) jsonLd.logo = logo;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo-localbusiness.ts src/lib/seo-localbusiness.test.ts
git commit -m "feat: add description/telephone/image/logo to LocalBusiness JSON-LD"
```

---

## Task 4: Add address (PostalAddress) and areaServed

**Files:**
- Modify: `src/lib/seo-localbusiness.ts`
- Modify: `src/lib/seo-localbusiness.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/seo-localbusiness.test.ts`:

```typescript
test("emits PostalAddress with streetAddress and addressLocality from seo_locality", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({ address: "123 Main St, Brooklyn", seo_locality: "Brooklyn, NY" }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.deepEqual(out.address, {
    "@type": "PostalAddress",
    streetAddress: "123 Main St, Brooklyn",
    addressLocality: "Brooklyn, NY",
  });
  assert.equal(out.areaServed, "Brooklyn, NY");
});

test("omits addressLocality when there is no seo_locality, and omits address node entirely when no address text", () => {
  const withAddr = buildLocalBusinessJsonLd(siteData({ address: "123 Main St" }), "https://x.com/") as Record<string, unknown>;
  assert.deepEqual(withAddr.address, { "@type": "PostalAddress", streetAddress: "123 Main St" });
  assert.ok(!("areaServed" in withAddr));

  const noAddr = buildLocalBusinessJsonLd(siteData({ address: "  ", seo_locality: null }), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("address" in noAddr));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: FAIL — address/areaServed undefined.

- [ ] **Step 3: Write the implementation**

In `src/lib/seo-localbusiness.ts`, before `return jsonLd;`, add:

```typescript
  const street = preview.address?.trim();
  const locality = preview.seo_locality?.trim();
  if (street) {
    const postal: Record<string, string> = { "@type": "PostalAddress", streetAddress: street };
    if (locality) postal.addressLocality = locality;
    jsonLd.address = postal;
  }
  if (locality) jsonLd.areaServed = locality;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo-localbusiness.ts src/lib/seo-localbusiness.test.ts
git commit -m "feat: add PostalAddress and areaServed to LocalBusiness JSON-LD"
```

---

## Task 5: Add sameAs (social links)

**Files:**
- Modify: `src/lib/seo-localbusiness.ts`
- Modify: `src/lib/seo-localbusiness.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/seo-localbusiness.test.ts`:

```typescript
test("sameAs contains only non-empty social links, in IG/FB/TikTok order", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({ generated_copy: { en: {}, social_links: { instagram: "https://instagram.com/acme", facebook: "  ", tiktok: "https://tiktok.com/@acme" } } as unknown as PreviewData["generated_copy"] }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.deepEqual(out.sameAs, ["https://instagram.com/acme", "https://tiktok.com/@acme"]);
});

test("omits sameAs when there are no social links", () => {
  const out = buildLocalBusinessJsonLd(siteData({}), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("sameAs" in out));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: FAIL — sameAs undefined.

- [ ] **Step 3: Write the implementation**

In `src/lib/seo-localbusiness.ts`, add the `SocialLinks` import if not already imported (it is, from Task 1), then before `return jsonLd;` add:

```typescript
  const social = preview.generated_copy?.social_links as SocialLinks | null | undefined;
  if (social) {
    const sameAs = [social.instagram, social.facebook, social.tiktok]
      .map((v) => v?.trim())
      .filter((v): v is string => !!v);
    if (sameAs.length) jsonLd.sameAs = sameAs;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo-localbusiness.ts src/lib/seo-localbusiness.test.ts
git commit -m "feat: add sameAs social links to LocalBusiness JSON-LD"
```

---

## Task 6: Add openingHoursSpecification

**Files:**
- Modify: `src/lib/seo-localbusiness.ts`
- Modify: `src/lib/seo-localbusiness.test.ts`

Note: `bookingHours` is `Record<day, { open, close } | null>`; a `null` value means closed. Day keys are capitalized full names (e.g. `"Monday"`), matching the booking_settings shape. Emit schema.org bare day names.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/seo-localbusiness.test.ts`:

```typescript
test("builds openingHoursSpecification from bookingHours, skipping closed days", () => {
  const out = buildLocalBusinessJsonLd(
    siteData({}, {
      bookingHours: {
        Monday: { open: "10:00", close: "19:00" },
        Tuesday: null,
        Wednesday: { open: "09:00", close: "17:00" },
      },
    }),
    "https://x.com/",
  ) as Record<string, unknown>;
  assert.deepEqual(out.openingHoursSpecification, [
    { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "10:00", closes: "19:00" },
    { "@type": "OpeningHoursSpecification", dayOfWeek: "Wednesday", opens: "09:00", closes: "17:00" },
  ]);
});

test("omits openingHoursSpecification when no hours or all closed", () => {
  const none = buildLocalBusinessJsonLd(siteData({}, { bookingHours: null }), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("openingHoursSpecification" in none));

  const allClosed = buildLocalBusinessJsonLd(siteData({}, { bookingHours: { Monday: null, Sunday: null } }), "https://x.com/") as Record<string, unknown>;
  assert.ok(!("openingHoursSpecification" in allClosed));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: FAIL — openingHoursSpecification undefined.

- [ ] **Step 3: Write the implementation**

In `src/lib/seo-localbusiness.ts`, before `return jsonLd;` add:

```typescript
  if (input.bookingHours) {
    const specs: Record<string, string>[] = [];
    for (const [day, hours] of Object.entries(input.bookingHours)) {
      if (!hours) continue;
      const opens = hours.open?.trim();
      const closes = hours.close?.trim();
      if (!opens || !closes) continue;
      specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens, closes });
    }
    if (specs.length) jsonLd.openingHoursSpecification = specs;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo-localbusiness.ts src/lib/seo-localbusiness.test.ts
git commit -m "feat: add openingHoursSpecification to LocalBusiness JSON-LD"
```

---

## Task 7: Wire the helper into the homepage

**Files:**
- Modify: `src/app/site/[slug]/page.tsx`

- [ ] **Step 1: Extend `getSiteData()` to fetch host fields and compute the canonical URL**

In `src/app/site/[slug]/page.tsx`:

First, add an import near the top (after the existing imports):

```typescript
import { tenantUrl } from "@/lib/tenant-url";
import { buildLocalBusinessJsonLd } from "@/lib/seo-localbusiness";
```

And the APP_URL constant (matching the landing page convention), after the imports:

```typescript
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";
```

Add `canonicalUrl` to the `SiteData` interface:

```typescript
interface SiteData {
  preview: PreviewData;
  bookingHours: BookingHoursMap;
  blockedDates: string[];
  tenantId: string | null;
  checkoutMode: "mockup" | "pickup";
  bookingMode: BookingModePolicy;
  depositSettings?: DepositSettings;
  isDemo: boolean;
  canonicalUrl: string;
}
```

In `getSiteData()`, change the tenant select to include host fields:

```typescript
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, checkout_mode, booking_mode, is_demo, custom_domain, subdomain")
    .eq("preview_slug", slug)
    .maybeSingle();
```

Then compute `canonicalUrl` just before the `return`, and add it to the returned object:

```typescript
  const canonicalUrl = tenantUrl(
    APP_URL,
    {
      custom_domain: (tenant?.custom_domain as string | null) ?? null,
      subdomain: (tenant?.subdomain as string | null) ?? null,
      preview_slug: slug,
    },
    "/",
  );

  return { preview: preview as PreviewData, bookingHours, blockedDates, tenantId, checkoutMode, bookingMode, depositSettings, isDemo, canonicalUrl };
```

- [ ] **Step 2: Render the JSON-LD in the default export**

In the default `SitePage` component, compute the JSON-LD and render a `<script>` tag alongside the existing tracking script:

```tsx
  const result = await getSiteData(params.slug);
  if (!result) notFound();
  const jsonLd = buildLocalBusinessJsonLd(result, result.canonicalUrl);
  return (
    <>
      <Script src="/track.js" strategy="afterInteractive" />
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <SiteClient
        data={result.preview}
        bookingHours={result.bookingHours}
        blockedDates={result.blockedDates}
        tenantId={result.tenantId}
        checkoutMode={result.checkoutMode}
        bookingMode={result.bookingMode}
        depositSettings={result.depositSettings}
        isDemo={result.isDemo}
      />
    </>
  );
```

- [ ] **Step 3: Verify the type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors. (If the project uses a different type-check script, e.g. `npm run typecheck`, run that instead.)

- [ ] **Step 4: Run the full lib test suite**

Run: `npx tsx --test src/lib/seo-localbusiness.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/site/[slug]/page.tsx
git commit -m "feat: render LocalBusiness JSON-LD on tenant site homepage"
```

---

## Task 8: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and load a tenant homepage**

Run: `npm run dev`
Open a real tenant site (e.g. `http://localhost:3000/site/<slug>` for a published, non-demo tenant). View source and confirm a single `<script type="application/ld+json">` block is present with the expected `@type`, `name`, `url`, and any populated fields.

- [ ] **Step 2: Confirm demo tenants emit nothing**

Load a demo tenant's site (`is_demo = true`). Confirm there is **no** `application/ld+json` block.

- [ ] **Step 3: Validate with Google's Rich Results Test**

Paste the rendered HTML (or the deployed URL) into https://search.google.com/test/rich-results and confirm the LocalBusiness item is detected with no errors. Note any warnings (e.g. missing recommended `priceRange`/`geo`) — these are expected and deferred per the spec.

- [ ] **Step 4: Record the outcome**

No commit. Report verification results (which fields appeared, any validator warnings) back for review.

---

## Self-Review Notes

- **Spec coverage:** type mapping (T1–T2), description/telephone/image/logo (T3), address/areaServed (T4), sameAs (T5), opening hours (T6), demo→null guard (T1), homepage render + canonical URL (T7), validation (T8). All spec sections covered.
- **Omitted-by-design:** `geo`, `priceRange`, `aggregateRating` — not implemented, matching the spec's v1 scope.
- **Type consistency:** helper is named `buildLocalBusinessJsonLd` and the input type `LocalBusinessInput` throughout; `SiteData` is structurally compatible with `LocalBusinessInput` (superset), so passing `result` directly type-checks.
- **`logo` access:** read defensively via cast since `GeneratedCopy` doesn't declare it; the shared type is intentionally not modified here.
