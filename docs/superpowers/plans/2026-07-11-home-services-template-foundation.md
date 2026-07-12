# Home-Services Template Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, bilingual home-services vertical with the approved Neighborhood Professional homepage, an outdoor-services preset, and a focused founder-only editor while leaving all stylist templates unchanged.

**Architecture:** Introduce `TemplateRouter` as the single render entry point. It sends `home_services` data to a new component tree under `src/components/templates/home-services/` and delegates every existing vertical to the unchanged `TemplateOrchestrator`. Store small home-services presentation data in a validated `generated_copy.home_services_config` object and use URL-based English/Spanish routes for live sites.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript strict mode, Tailwind CSS, next-intl, Supabase JSONB persistence, Node test runner through `tsx`.

## Global Constraints

- Existing stylist templates, booking behavior, and `/booking` routes must remain unchanged.
- Home-services rendering must never import or render booking, calendar, deposit, product, or appointment components.
- All public UI must work at 375 px with at least 44 px interactive targets.
- English is available at `/`; Spanish is available at `/es`.
- Public interface strings live in `messages/en.json` and `messages/es.json`.
- Tenant-specific English and Spanish content lives in `generated_copy`.
- The public home-services site never renders the tenant street address.
- The contractor receives no CMS or lead dashboard; the editor in this plan is founder-only.
- TypeScript stays strict; do not use `any`.
- Do not add a migration in this plan. Estimate and service-area tables belong to Plans 2 and 3.
- Default visual tokens: navy `#0C3658`, green `#13795B`, pale green `#E8F5EE`, pale blue `#F0F6F8`, white `#FFFFFF`.
- Default stock claims must not invent insurance, licenses, ratings, reviews, or years in business.

---

## File Structure

Create:

- `src/lib/home-services/types.ts` — validated home-services config and locale types.
- `src/lib/home-services/types.test.ts` — config parser tests.
- `src/lib/home-services/urls.ts` — phone/message and locale path helpers.
- `src/lib/home-services/urls.test.ts` — URL helper tests.
- `src/lib/home-services/preset-outdoor-services.ts` — initial bilingual outdoor-services data.
- `src/lib/home-services/preset-outdoor-services.test.ts` — preset truthfulness and completeness tests.
- `src/components/templates/TemplateRouter.tsx` — vertical dispatch.
- `src/components/templates/home-services/HomeServicesTemplate.tsx` — homepage composition and localization provider.
- `src/components/templates/home-services/HomeServicesNav.tsx` — public anchors and URL language switch.
- `src/components/templates/home-services/HomeServicesHero.tsx` — hero and primary actions.
- `src/components/templates/home-services/HomeServicesTrustStrip.tsx` — trust points.
- `src/components/templates/home-services/HomeServicesServices.tsx` — service cards without booking.
- `src/components/templates/home-services/HomeServicesGallery.tsx` — before/after and single-image projects.
- `src/components/templates/home-services/HomeServicesWhyUs.tsx` — proof points.
- `src/components/templates/home-services/HomeServicesReviews.tsx` — configured review rendering.
- `src/components/templates/home-services/HomeServicesServiceAreas.tsx` — Plan 1 coverage summary; Plan 3 adds links.
- `src/components/templates/home-services/HomeServicesMobileActionBar.tsx` — sticky Call, Message, Estimate actions.
- `src/components/templates/home-services/HomeServicesFooter.tsx` — address-free footer.
- `src/components/templates/home-services/home-services-theme.ts` — theme resolution.
- `src/app/site/[slug]/es/page.tsx` — crawlable Spanish homepage.
- `src/lib/home-services/homepage-metadata.ts` — canonical and homepage hreflang metadata.
- `src/app/(admin)/clients/[tenantId]/edit/VerticalSiteEditor.tsx` — founder editor dispatch.
- `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` — focused home-services editor.
- `tests/home-services-template-contract.test.mjs` — router/no-booking source contract.

Modify:

- `src/lib/ai/types.ts` — add `home_services`, home-services theme, and config slot.
- `src/lib/templates/default-services.ts` — outdoor service defaults.
- `src/lib/templates/stock-photos.ts` — outdoor stock photos.
- `src/lib/templates/themes.ts` — Neighborhood Professional palette.
- `src/lib/templates/default-hero-videos.ts` — explicit no-video fallback for this vertical.
- `src/lib/ai/prompts.ts` — home-services copy tone.
- `src/components/templates/TemplateOrchestrator.tsx` — export its props interface only.
- `src/components/templates/index.ts` — export `TemplateRouter`.
- `src/app/site/[slug]/SiteClient.tsx` — accept locale and render `TemplateRouter`.
- `src/app/site/[slug]/page.tsx` — pass English locale and home-services metadata.
- `src/app/site/[slug]/booking/page.tsx` — return not found for `home_services`.
- `src/app/(marketing)/preview/[slug]/PreviewClient.tsx` — render `TemplateRouter`.
- `src/app/(admin)/clients/[tenantId]/edit/page.tsx` — render `VerticalSiteEditor`.
- `src/app/(admin)/previews/[slug]/edit/page.tsx` — render `VerticalSiteEditor`.
- `src/app/api/update-site/route.ts` — preserve and validate `home_services_config`.
- `messages/en.json` and `messages/es.json` — home-services interface copy.
- `tests/default-services.test.mjs` — register the new vertical.

---

### Task 1: Home-services domain types, parser, URL helpers, and preset

**Files:**
- Create: `src/lib/home-services/types.ts`
- Create: `src/lib/home-services/types.test.ts`
- Create: `src/lib/home-services/urls.ts`
- Create: `src/lib/home-services/urls.test.ts`
- Create: `src/lib/home-services/preset-outdoor-services.ts`
- Create: `src/lib/home-services/preset-outdoor-services.test.ts`
- Modify: `src/lib/ai/types.ts:1-22,72-98`

**Interfaces:**
- Produces: `HomeServicesLocale`, `HomeServicesConfig`, `parseHomeServicesConfig(raw)`, phone/action URL builders, and `buildOutdoorServicesPreset()`.
- Consumed by: all later tasks in this plan and Plans 2–3.

- [ ] **Step 1: Write failing config and URL tests**

```typescript
// src/lib/home-services/types.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseHomeServicesConfig } from "./types";

test("parseHomeServicesConfig returns safe empty defaults", () => {
  assert.deepEqual(parseHomeServicesConfig(null), {
    trust_points: [],
    gallery_projects: [],
    why_us_points: [],
    coverage_summary_en: "",
    coverage_summary_es: "",
    message_links: {},
    sections: {},
  });
});

test("parseHomeServicesConfig keeps only valid bilingual entries", () => {
  const value = parseHomeServicesConfig({
    trust_points: [{ id: "free", label_en: "Free estimates", label_es: "Estimados gratis" }],
    gallery_projects: "invalid",
    why_us_points: [{ id: "local", title_en: "Local", title_es: "Locales" }],
  });
  assert.equal(value.trust_points.length, 1);
  assert.deepEqual(value.gallery_projects, []);
  assert.equal(value.why_us_points.length, 1);
});
```

```typescript
// src/lib/home-services/urls.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSmsHref,
  buildTelHref,
  buildWhatsAppHref,
  homepagePath,
} from "./urls";

test("phone action URLs normalize a North American number", () => {
  assert.equal(buildTelHref("(832) 555-0147"), "tel:+18325550147");
  assert.equal(buildSmsHref("(832) 555-0147"), "sms:+18325550147");
  assert.equal(buildWhatsAppHref("(832) 555-0147"), "https://wa.me/18325550147");
});

test("invalid numbers do not create public actions", () => {
  assert.equal(buildTelHref("123"), null);
  assert.equal(buildWhatsAppHref(""), null);
});

test("homepage paths are crawlable", () => {
  assert.equal(homepagePath("en"), "/");
  assert.equal(homepagePath("es"), "/es");
});
```

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run:

```bash
npx tsx --test src/lib/home-services/types.test.ts src/lib/home-services/urls.test.ts
```

Expected: FAIL because `types.ts` and `urls.ts` do not exist.

- [ ] **Step 3: Extend shared AI types**

Append these exact union members and config slot without changing the existing
members:

```typescript
// src/lib/ai/types.ts
export type BusinessType =
  | "salon"
  | "barbershop"
  | "restaurant"
  | "nails"
  | "braids"
  | "locs"
  | "locs_and_braids"
  | "home_services";
```

Append `| "home_services_neighborhood"` to the existing `ColorTheme` union.
Add `home_services_config?: unknown;` to the existing `GeneratedCopy` interface
after `social_links`.

Do not add booking fields to `HomeServicesConfig`.

- [ ] **Step 4: Implement the validated config**

```typescript
// src/lib/home-services/types.ts
export type HomeServicesLocale = "en" | "es";

export interface HomeServicesTrustPoint {
  id: string;
  label_en: string;
  label_es: string;
}

export interface HomeServicesGalleryProject {
  id: string;
  before_image?: string;
  after_image?: string;
  image?: string;
  caption_en?: string;
  caption_es?: string;
  service_name?: string;
  area_slug?: string;
}

export interface HomeServicesWhyUsPoint {
  id: string;
  title_en: string;
  title_es: string;
  body_en?: string;
  body_es?: string;
}

export interface HomeServicesConfig {
  trust_points: HomeServicesTrustPoint[];
  gallery_projects: HomeServicesGalleryProject[];
  why_us_points: HomeServicesWhyUsPoint[];
  coverage_summary_en: string;
  coverage_summary_es: string;
  message_links: { whatsapp_e164?: string; sms_e164?: string };
  sections: {
    show_trust?: boolean;
    show_gallery?: boolean;
    show_why_us?: boolean;
    show_reviews?: boolean;
    show_service_areas?: boolean;
    show_estimate?: boolean;
  };
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    : [];

export function parseHomeServicesConfig(raw: unknown): HomeServicesConfig {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const links = source.message_links && typeof source.message_links === "object"
    ? source.message_links as Record<string, unknown>
    : {};
  const sections = source.sections && typeof source.sections === "object"
    ? source.sections as HomeServicesConfig["sections"]
    : {};

  return {
    trust_points: rows(source.trust_points).flatMap((row) => {
      const id = text(row.id);
      const label_en = text(row.label_en);
      const label_es = text(row.label_es);
      return id && label_en && label_es ? [{ id, label_en, label_es }] : [];
    }),
    gallery_projects: rows(source.gallery_projects).flatMap((row) => {
      const id = text(row.id);
      if (!id) return [];
      return [{
        id,
        before_image: text(row.before_image) || undefined,
        after_image: text(row.after_image) || undefined,
        image: text(row.image) || undefined,
        caption_en: text(row.caption_en) || undefined,
        caption_es: text(row.caption_es) || undefined,
        service_name: text(row.service_name) || undefined,
        area_slug: text(row.area_slug) || undefined,
      }];
    }),
    why_us_points: rows(source.why_us_points).flatMap((row) => {
      const id = text(row.id);
      const title_en = text(row.title_en);
      const title_es = text(row.title_es);
      return id && title_en && title_es ? [{
        id,
        title_en,
        title_es,
        body_en: text(row.body_en) || undefined,
        body_es: text(row.body_es) || undefined,
      }] : [];
    }),
    coverage_summary_en: text(source.coverage_summary_en),
    coverage_summary_es: text(source.coverage_summary_es),
    message_links: {
      whatsapp_e164: text(links.whatsapp_e164) || undefined,
      sms_e164: text(links.sms_e164) || undefined,
    },
    sections,
  };
}
```

- [ ] **Step 5: Implement action URL helpers**

```typescript
// src/lib/home-services/urls.ts
import type { HomeServicesLocale } from "./types";

export function normalizeE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  return normalized.length >= 11 && normalized.length <= 15 ? `+${normalized}` : null;
}

export function buildTelHref(raw: string): string | null {
  const phone = normalizeE164(raw);
  return phone ? `tel:${phone}` : null;
}

export function buildSmsHref(raw: string, body?: string): string | null {
  const phone = normalizeE164(raw);
  return phone ? `sms:${phone}${body ? `?body=${encodeURIComponent(body)}` : ""}` : null;
}

export function buildWhatsAppHref(raw: string, body?: string): string | null {
  const phone = normalizeE164(raw);
  return phone
    ? `https://wa.me/${phone.slice(1)}${body ? `?text=${encodeURIComponent(body)}` : ""}`
    : null;
}

export function homepagePath(locale: HomeServicesLocale): "/" | "/es" {
  return locale === "es" ? "/es" : "/";
}
```

- [ ] **Step 6: Write and implement the outdoor preset**

Test exact requirements:

```typescript
// src/lib/home-services/preset-outdoor-services.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildOutdoorServicesPreset } from "./preset-outdoor-services";

test("outdoor preset is bilingual and contains no unsupported claims", () => {
  const preset = buildOutdoorServicesPreset();
  assert.equal(preset.business_type, "home_services");
  assert.equal(preset.services.length, 8);
  assert.ok(preset.generated_copy.en.hero_headline);
  assert.ok(preset.generated_copy.es.hero_headline);
  const serialized = JSON.stringify(preset).toLowerCase();
  for (const claim of ["insured", "licensed", "4.9", "15 years"]) {
    assert.equal(serialized.includes(claim), false);
  }
});
```

Implement `buildOutdoorServicesPreset(): PreviewData` with:

- business name `Greenline Outdoor Services`;
- `home_services` business type;
- `home_services_neighborhood` theme;
- eight services from the approved spec;
- stable `client_id` values derived from lowercase kebab-case service names;
- `price: ""` on every service;
- English and Spanish hero, about, service descriptions, SEO, footer, and Google Business descriptions;
- three truthful trust points: free estimates, residential/commercial, English/Spanish;
- no phone, rating, review, address, insurance, license, or years-in-business claim.

- [ ] **Step 7: Run Task 1 tests**

```bash
npx tsx --test \
  src/lib/home-services/types.test.ts \
  src/lib/home-services/urls.test.ts \
  src/lib/home-services/preset-outdoor-services.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/lib/ai/types.ts src/lib/home-services
git commit -m "feat: add home-services domain foundation"
```

---

### Task 2: Register defaults, stock imagery, theme, and copy tone

**Files:**
- Modify: `src/lib/templates/default-services.ts`
- Modify: `src/lib/templates/stock-photos.ts`
- Modify: `src/lib/templates/themes.ts`
- Modify: `src/lib/templates/default-hero-videos.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `tests/default-services.test.mjs`

**Interfaces:**
- Consumes: `BusinessType = "home_services"`.
- Produces: complete `Record<BusinessType, ServiceItem[]>` service registry and
  corresponding stock-photo/theme registries used by the template.

- [ ] **Step 1: Extend the registry contract test**

Add:

```javascript
test("home-services defaults are registered without booking prices", async () => {
  const types = await readFile("src/lib/ai/types.ts", "utf8");
  const defaults = await readFile("src/lib/templates/default-services.ts", "utf8");
  const stock = await readFile("src/lib/templates/stock-photos.ts", "utf8");
  const themes = await readFile("src/lib/templates/themes.ts", "utf8");

  assert.match(types, /["']home_services["']/);
  assert.match(defaults, /home_services:/);
  assert.match(stock, /home_services:/);
  assert.match(themes, /home_services_neighborhood/);
  assert.doesNotMatch(
    defaults.match(/home_services:[\s\S]*?\n\s*\]\)/)?.[0] ?? "",
    /price:\s*["']\$/,
  );
});
```

- [ ] **Step 2: Run the contract test and verify failure**

```bash
npx tsx --test tests/default-services.test.mjs
```

Expected: FAIL because the registries do not contain `home_services`.

- [ ] **Step 3: Add outdoor defaults and verified Pexels stock IDs**

Add `home_services` to `BASE_STOCK_PHOTOS`:

```typescript
home_services: [
  pexels(34319671),
  pexels(37720375),
  pexels(37601618),
  pexels(12919779),
  pexels(30958777),
],
```

Add the eight approved services to `BASE_SERVICES`. Use `price: ""`. For Plan 1,
assign stock URLs by index rather than introducing binary assets:

```typescript
const homeServiceDefaults: ServiceItem[] = [
  "Sprinkler Installation & Repair",
  "Lawn Mowing & Maintenance",
  "Sod & Grass Installation",
  "Landscaping",
  "Tree Trimming",
  "Yard Cleanup",
  "Mulching",
  "Seasonal Maintenance",
].map((name, index) => ({
  name,
  price: "",
  image: STOCK_PHOTOS.home_services[index % STOCK_PHOTOS.home_services.length],
}));
```

Import `STOCK_PHOTOS`, set `home_services: homeServiceDefaults`, and update the
`Exclude<BusinessType, "locs_and_braids" | "home_services">` expression so the
complete registry type-checks.

- [ ] **Step 4: Add the Neighborhood Professional theme**

Add a `ThemeConfig` with:

```typescript
{
  id: "home_services_neighborhood",
  name: "Neighborhood Professional",
  colors: {
    primary: "#0C3658",
    secondary: "#13795B",
    accent: "#13795B",
    background: "#FFFFFF",
    foreground: "#102A43",
    muted: "#F0F6F8",
  },
  previewSwatch: ["#0C3658", "#13795B", "#F0F6F8"],
}
```

Register it as the first and only `THEMES_BY_VERTICAL.home_services` entry. Add
`home_services: ""` to `DEFAULT_HERO_VIDEO_BY_TYPE` and change
`getDefaultHeroVideoUrl` to `return path || null`; the template then renders its
gradient fallback without requiring a binary video asset.

- [ ] **Step 5: Add a home-services AI tone**

Add to `TONE_GUIDELINES`:

```typescript
home_services:
  "Direct, trustworthy, locally specific, and easy to scan. Emphasize free estimates, reliable communication, visible work, and service areas. Never invent licenses, insurance, years in business, ratings, or guarantees.",
```

- [ ] **Step 6: Run registry and type checks**

```bash
npx tsx --test tests/default-services.test.mjs
npx tsc --noEmit
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 2**

```bash
git add \
  src/lib/templates/default-services.ts \
  src/lib/templates/stock-photos.ts \
  src/lib/templates/themes.ts \
  src/lib/templates/default-hero-videos.ts \
  src/lib/ai/prompts.ts \
  tests/default-services.test.mjs
git commit -m "feat: register outdoor-services defaults"
```

---

### Task 3: Add the central TemplateRouter and home-services shell

**Files:**
- Create: `src/components/templates/TemplateRouter.tsx`
- Create: `src/components/templates/home-services/HomeServicesTemplate.tsx`
- Create: `src/components/templates/home-services/HomeServicesNav.tsx`
- Create: `src/components/templates/home-services/HomeServicesHero.tsx`
- Create: `src/components/templates/home-services/home-services-theme.ts`
- Modify: `src/components/templates/TemplateOrchestrator.tsx:68-90`
- Modify: `src/components/templates/index.ts`
- Modify: `messages/en.json`
- Modify: `messages/es.json`
- Create: `tests/home-services-template-contract.test.mjs`

**Interfaces:**
- Consumes: `TemplateOrchestratorProps`, `HomeServicesConfig`, locale URL helpers.
- Produces: `TemplateRouter(props)` and the public home-services shell.

- [ ] **Step 1: Write the router/no-booking contract test**

```javascript
// tests/home-services-template-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TemplateRouter isolates home services from stylist orchestration", async () => {
  const router = await readFile("src/components/templates/TemplateRouter.tsx", "utf8");
  assert.match(router, /business_type\s*===\s*["']home_services["']/);
  assert.match(router, /<HomeServicesTemplate/);
  assert.match(router, /<TemplateOrchestrator/);
});

test("home-services components contain no booking imports or labels", async () => {
  const files = [
    "HomeServicesTemplate.tsx",
    "HomeServicesNav.tsx",
    "HomeServicesHero.tsx",
  ];
  const source = (await Promise.all(files.map((name) =>
    readFile(`src/components/templates/home-services/${name}`, "utf8")
  ))).join("\n");
  assert.doesNotMatch(source, /TemplateBooking|CustomerBookingFlow|Book Now|bookingMode|deposit/i);
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
npx tsx --test tests/home-services-template-contract.test.mjs
```

Expected: FAIL because `TemplateRouter.tsx` does not exist.

- [ ] **Step 3: Export the orchestrator props and implement router dispatch**

Change only the declaration keyword from
`interface TemplateOrchestratorProps` to
`export interface TemplateOrchestratorProps`. Do not alter its properties.

Create:

```tsx
// src/components/templates/TemplateRouter.tsx
"use client";

import { HomeServicesTemplate } from "./home-services/HomeServicesTemplate";
import {
  TemplateOrchestrator,
  type TemplateOrchestratorProps,
} from "./TemplateOrchestrator";

export function TemplateRouter(props: TemplateOrchestratorProps) {
  if (props.data.business_type === "home_services") {
    return (
      <HomeServicesTemplate
        data={props.data}
        locale={props.locale ?? "en"}
        isLive={props.isLive}
      />
    );
  }
  return <TemplateOrchestrator {...props} />;
}
```

Export `TemplateRouter` from `src/components/templates/index.ts`. Do not remove
the existing exports.

- [ ] **Step 4: Add interface messages and the next-intl provider**

Add the complete `homeServices` key tree shown in Task 5 Step 3 to both message
files, using natural Spanish values in `es.json`.

In `HomeServicesTemplate`, import both message files and wrap the page:

```tsx
const messages = locale === "es" ? esMessages : enMessages;

return (
  <NextIntlClientProvider locale={locale} messages={messages}>
    <HomeServicesPage {...pageProps} />
  </NextIntlClientProvider>
);
```

Section components use `useTranslations("homeServices")`; no public action or
section label is hardcoded.

- [ ] **Step 5: Implement theme resolution**

`getHomeServicesColors(data: PreviewData): ThemeColors` must:

1. Use valid `generated_copy.section_settings.custom_colors` when present,
   matching existing brand-palette behavior.
2. Otherwise use `THEMES_BY_VERTICAL.home_services[0].colors`.
3. Return the approved navy/green palette if either source is missing.

Write a small unit test for the fallback colors before implementation.

- [ ] **Step 6: Implement the navigation and hero shell**

`HomeServicesNav` props:

```typescript
interface HomeServicesNavProps {
  businessName: string;
  locale: HomeServicesLocale;
  showGallery: boolean;
  showReviews: boolean;
  estimateHref: string;
  colors: ThemeColors;
}
```

Requirements:

- logo/name on the left;
- Services, Work, Reviews, and Service Areas links only when corresponding
  sections exist;
- language link to `/es` or `/`;
- Free Estimate link to `#estimate`;
- 44 px controls and a compact mobile menu;
- no booking copy.

`HomeServicesHero` props:

```typescript
interface HomeServicesHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  phoneHref: string | null;
  messageHref: string | null;
  estimateHref: string;
  colors: ThemeColors;
}
```

Requirements:

- render the approved gradient fallback when `heroImage` is absent;
- render only actions with valid destinations;
- label estimate as the primary action;
- use `next/image` when media exists.

- [ ] **Step 7: Compose the initial shell**

`HomeServicesTemplate` must parse `home_services_config`, choose
`generated_copy[locale]`, resolve phone/message URLs, and render:

```tsx
<main id="home" className="min-h-screen bg-white pb-20 md:pb-0">
  <HomeServicesNav
    businessName={data.business_name}
    locale={locale}
    showGallery={false}
    showReviews={false}
    estimateHref="#estimate"
    colors={colors}
  />
  <HomeServicesHero
    businessName={data.business_name}
    headline={copy.hero_headline}
    subheadline={copy.hero_subheadline}
    heroImage={data.images?.[0]}
    phoneHref={phoneHref}
    messageHref={messageHref}
    estimateHref="#estimate"
    colors={colors}
  />
</main>
```

In this task, compose only `HomeServicesNav` and `HomeServicesHero`. Task 4 adds
the remaining sections before the vertical is provisioned to a tenant, so no
empty live sections are committed.

- [ ] **Step 8: Run contract and type tests**

```bash
npx tsx --test tests/home-services-template-contract.test.mjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/components/templates messages tests/home-services-template-contract.test.mjs
git commit -m "feat: route home-services templates separately"
```

---

### Task 4: Build the complete Neighborhood Professional homepage

**Files:**
- Create: `src/components/templates/home-services/HomeServicesTrustStrip.tsx`
- Create: `src/components/templates/home-services/HomeServicesServices.tsx`
- Create: `src/components/templates/home-services/HomeServicesGallery.tsx`
- Create: `src/components/templates/home-services/HomeServicesWhyUs.tsx`
- Create: `src/components/templates/home-services/HomeServicesReviews.tsx`
- Create: `src/components/templates/home-services/HomeServicesServiceAreas.tsx`
- Create: `src/components/templates/home-services/HomeServicesMobileActionBar.tsx`
- Create: `src/components/templates/home-services/HomeServicesFooter.tsx`
- Modify: `src/components/templates/home-services/HomeServicesTemplate.tsx`

**Interfaces:**
- Consumes: `PreviewData`, `HomeServicesConfig`, `ThemeColors`, locale.
- Produces: approved homepage section order and mobile conversion behavior.

- [ ] **Step 1: Add pure display-selection tests**

Create `src/lib/home-services/display.test.ts` and
`src/lib/home-services/display.ts` with:

```typescript
export function localizedText(
  locale: HomeServicesLocale,
  value: { en?: string; es?: string },
): string {
  return locale === "es" ? value.es?.trim() || "" : value.en?.trim() || "";
}

export function hasProjectMedia(project: HomeServicesGalleryProject): boolean {
  return Boolean(
    project.image ||
    project.before_image ||
    project.after_image,
  );
}
```

Test Spanish selection, missing Spanish returning an empty string, and gallery
media detection.

- [ ] **Step 2: Implement service and trust sections**

`HomeServicesServices` renders `data.services` in source order, uses localized
`service_descriptions`, never displays `price`, and links each card to:

```text
#estimate?service=<encoded service name>
```

Task 2 turns this into functional prefill; Plan 1 only preserves the query.

`HomeServicesTrustStrip` renders nothing when the list is empty. Otherwise use a
single-column mobile grid and up to four columns on desktop.

- [ ] **Step 3: Implement gallery and why-us sections**

Gallery behavior:

- before + after: labeled two-panel figure;
- one of before/after: single completed-work image;
- `image`: single completed-work image;
- no valid media: omit the item;
- localized caption; no fabricated location.

Why-us behavior:

- title and optional body from the selected locale;
- omit rows missing selected-locale title;
- use simple icons from `lucide-react`, not stock badges.

- [ ] **Step 4: Implement review and coverage sections**

Read Google reviews from the existing `generated_copy.google_reviews` shape used
by `TemplateOrchestrator`. Render no section when there are no reviews.

For Plan 1, `HomeServicesServiceAreas` displays only
`coverage_summary_en`/`coverage_summary_es`. It must not create city links; Plan
3 owns published service-area records and routing.

- [ ] **Step 5: Implement footer and sticky mobile actions**

The footer receives business name, phone, hours, social links, and coverage
summary. Do not accept an address prop.

The mobile action bar:

- fixed to the bottom only below `md`;
- includes Call and Message only when valid;
- always includes Free Estimate when the estimate section is enabled;
- uses `pb-[env(safe-area-inset-bottom)]`;
- gives every action `min-h-11`;
- adds matching bottom padding to the page.

- [ ] **Step 6: Replace shell sections in approved order**

Compose:

```tsx
<HomeServicesNav />
<HomeServicesHero />
<HomeServicesTrustStrip />
<HomeServicesServices />
<HomeServicesGallery />
<HomeServicesWhyUs />
<HomeServicesReviews />
<HomeServicesServiceAreas />
<section id="estimate" aria-labelledby="estimate-heading">
  <DirectEstimateCard phoneHref={phoneHref} messageHref={messageHref} />
</section>
<HomeServicesFooter />
<HomeServicesMobileActionBar />
```

`DirectEstimateCard` is a local component that says to call or message for a free
estimate; it is not a fake form.

- [ ] **Step 7: Run tests and lint edited files**

```bash
npx tsx --test src/lib/home-services/display.test.ts tests/home-services-template-contract.test.mjs
npx tsc --noEmit
npm run lint
```

Expected: PASS with no new diagnostics.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/components/templates/home-services src/lib/home-services/display*
git commit -m "feat: build neighborhood professional homepage"
```

---

### Task 5: Add crawlable English and Spanish homepages

**Files:**
- Create: `src/lib/home-services/homepage-metadata.ts`
- Create: `src/lib/home-services/homepage-metadata.test.ts`
- Create: `src/app/site/[slug]/es/page.tsx`
- Modify: `src/app/site/[slug]/page.tsx`
- Modify: `src/app/site/[slug]/SiteClient.tsx`
- Modify: `src/app/site/[slug]/booking/page.tsx`
- Modify: `src/app/(marketing)/preview/[slug]/PreviewClient.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `TemplateRouter`, tenant URL helpers, bilingual generated copy.
- Produces: live `/` and `/es` routes and reciprocal homepage metadata.

- [ ] **Step 1: Write metadata tests**

Test:

```typescript
const result = buildHomeServicesHomepageAlternates(
  { subdomain: "greenline", custom_domain: null },
  "https://siteforowners.com",
  "es",
);
assert.equal(result.canonical, "https://greenline.siteforowners.com/es");
assert.equal(result.languages?.en, "https://greenline.siteforowners.com/");
assert.equal(result.languages?.es, "https://greenline.siteforowners.com/es");
assert.equal(result.languages?.["x-default"], "https://greenline.siteforowners.com/");
```

- [ ] **Step 2: Implement metadata helper**

Use `tenantUrl()` for all URLs. Build title/description from
`generated_copy[locale].seo_title` and `.seo_description`. Do not fall back to
English for a published Spanish page.

- [ ] **Step 3: Add translation messages**

Add the same key structure to both files:

```json
"homeServices": {
  "nav": {
    "services": "Services",
    "work": "Our Work",
    "reviews": "Reviews",
    "serviceAreas": "Service Areas"
  },
  "actions": {
    "call": "Call",
    "message": "Message",
    "freeEstimate": "Free Estimate"
  },
  "sections": {
    "services": "Services",
    "work": "Our Work",
    "whyUs": "Why Choose Us",
    "reviews": "Customer Reviews",
    "serviceAreas": "Areas We Serve",
    "estimate": "Request a Free Estimate"
  }
}
```

Use natural Spanish equivalents in `es.json`; do not copy English values.

- [ ] **Step 4: Thread locale through SiteClient and TemplateRouter**

Add required prop:

```typescript
locale: "en" | "es";
```

English route passes `"en"`; Spanish passes `"es"`. Update all non-live preview
calls to pass their existing selected locale. Stylist live behavior remains
English until a separate stylist localization project changes it.

Extend `SiteData` in `src/app/site/[slug]/getSiteData.ts` with:

```typescript
tenantHostFields: {
  custom_domain: string | null;
  subdomain: string | null;
  preview_slug: string;
};
```

Populate it from the existing tenant query and use it for canonical and
alternate URLs.

- [ ] **Step 5: Create the Spanish route**

`src/app/site/[slug]/es/page.tsx` must:

- load the same `SiteData`;
- require `business_type === "home_services"`;
- require Spanish hero headline, subheadline, SEO title, and SEO description;
- call `notFound()` otherwise;
- generate reciprocal metadata;
- render `SiteClient locale="es"`.

Use the same demo/live gating and JSON-LD safety as the English route.

- [ ] **Step 6: Guard the booking route**

After loading data:

```typescript
if (siteData.preview.business_type === "home_services") {
  notFound();
}
```

This prevents a contractor site from exposing a dead calendar entry point.

- [ ] **Step 7: Run locale and route checks**

```bash
npx tsx --test src/lib/home-services/homepage-metadata.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS; build emits both `/site/[slug]` and `/site/[slug]/es`.

- [ ] **Step 8: Commit Task 5**

```bash
git add \
  src/lib/home-services/homepage-metadata* \
  "src/app/site/[slug]" \
  "src/app/(marketing)/preview/[slug]/PreviewClient.tsx" \
  messages
git commit -m "feat: publish bilingual home-services homepages"
```

---

### Task 6: Add the focused founder-only editor

**Files:**
- Create: `src/app/(admin)/clients/[tenantId]/edit/VerticalSiteEditor.tsx`
- Create: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx`
- Modify: `src/app/(admin)/clients/[tenantId]/edit/page.tsx`
- Modify: `src/app/(admin)/previews/[slug]/edit/page.tsx`
- Modify: `src/app/api/update-site/route.ts`
- Create: `tests/home-services-editor-contract.test.mjs`

**Interfaces:**
- Consumes: `PreviewData`, `HomeServicesConfig`, `/api/update-site`.
- Produces: founder-only editing without booking/product/deposit controls.

- [ ] **Step 1: Write editor contract test**

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home-services editor excludes stylist operational controls", async () => {
  const source = await readFile(
    "src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx",
    "utf8",
  );
  assert.doesNotMatch(source, /DepositEditor|BookingHoursEditor|booking provider|Acuity|Booksy/i);
  assert.match(source, /English/);
  assert.match(source, /Español/);
  assert.match(source, /HomeServicesConfig/);
});
```

- [ ] **Step 2: Add a vertical editor router**

```tsx
"use client";

export function VerticalSiteEditor(props: SiteEditorProps) {
  return props.preview.business_type === "home_services"
    ? <HomeServicesSiteEditor {...props} />
    : <SiteEditor {...props} />;
}
```

Export `SiteEditorProps` from the existing file without changing its behavior.
Replace page-level `SiteEditor` imports with `VerticalSiteEditor`.

- [ ] **Step 3: Implement focused state and save payload**

The editor manages:

- business name and phone;
- selected theme;
- English and Spanish hero, about, SEO, footer, and service descriptions;
- services;
- trust points;
- why-us points;
- coverage summaries;
- gallery projects;
- message-link destinations;
- section visibility;
- gallery media through the existing `GalleryEditor`;
- gallery video through the existing `GalleryVideoEditor`;
- about/secondary image through the existing `AboutImagePicker`;
- hero video through the existing `/api/upload-hero-video` signed-upload flow.

Save:

```typescript
await fetch("/api/update-site", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    slug: preview.slug,
    updates: {
      business_name: draft.business_name,
      phone: draft.phone,
      color_theme: draft.color_theme,
      services: draft.services,
      generated_copy: {
        ...draft.generated_copy,
        home_services_config: draft.home_services_config,
      },
    },
  }),
});
```

Keep each editor section in a small local component; do not copy the 1,997-line
stylist editor.

- [ ] **Step 4: Validate merge behavior in `/api/update-site`**

Write a pure helper test for:

```typescript
mergeGeneratedCopy(existing, incoming)
```

It must preserve existing `social_links`, `section_settings`, and
`home_services_config` when omitted; replace each key only when explicitly
provided. Create `src/lib/generated-copy-merge.ts` and test the helper there
before importing it into the route.

- [ ] **Step 5: Add a live bilingual preview**

The editor preview uses `TemplateRouter`, with an editor-only EN/ES tab. This
state toggle is acceptable because it previews content; public language changes
remain URL links.

- [ ] **Step 6: Run editor tests and build**

```bash
npx tsx --test \
  tests/home-services-editor-contract.test.mjs \
  src/lib/generated-copy-merge.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add \
  "src/app/(admin)" \
  src/app/api/update-site/route.ts \
  src/lib/generated-copy-merge* \
  tests/home-services-editor-contract.test.mjs
git commit -m "feat: add focused home-services editor"
```

---

### Task 7: Regression and mobile verification

**Files:**
- Modify only files required by discovered failures.

**Interfaces:**
- Consumes: complete Plan 1 implementation.
- Produces: verified vertical isolation and launch-ready foundation for Plan 2.

- [ ] **Step 1: Run all unit and contract tests**

```bash
/bin/zsh -lc "npx tsx --test $(rg --files src -g '*.test.ts' | tr '\n' ' ') tests/*.test.mjs"
```

Expected: all tests PASS.

- [ ] **Step 2: Run type, lint, and production build**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify at 375 px**

Run the existing dev server or start:

```bash
npm run dev
```

For an outdoor preset tenant, verify:

- `/` renders English and `/es` renders Spanish;
- language links navigate, not toggle hidden client state;
- Call and Message use valid destinations;
- the mobile action bar does not cover content;
- no horizontal overflow;
- no booking, products, deposits, prices, or address;
- empty review/gallery sections disappear.

- [ ] **Step 4: Verify stylist regressions**

Open one stylist tenant and verify:

- original template variant renders;
- Book Now and booking modal work;
- `/booking` still auto-opens;
- founder stylist editor still exposes its original controls.

- [ ] **Step 5: Resolve verification findings in the owning task**

If verification finds a defect, return to the task that introduced it, add a
failing regression test, implement the fix, rerun that task's checks, and use
that task's explicit commit command. If no defect is found, do not create an
empty commit.

## Plan 1 Exit Criteria

- `home_services` is a first-class typed vertical.
- Outdoor preset and defaults are bilingual and do not invent claims.
- Live `/` and `/es` pages render the approved template.
- Home-services code contains no booking dependencies.
- Founder editing is focused and bilingual.
- Stylist sites and `/booking` behavior are unchanged.
- Plan 2 can consume `HomeServicesConfig`, `TemplateRouter`, and the estimate
  section boundary without redesign.
