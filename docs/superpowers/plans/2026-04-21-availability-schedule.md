# Editable Availability Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable availability schedule editor in SiteEditor with a show/hide toggle, sensible defaults so the footer is never blank, and Google-Maps override semantics with a "reset to original" capability.

**Architecture:** Pure helper module (`businessHours.ts`) handles precedence (booking_settings → previews.hours → DEFAULT_HOURS). New `imported_hours` column on `previews` snapshots the Google import so admins can revert. New `show_hours` key in `section_settings` controls footer visibility. SiteEditor gets a new "Display Hours" section using a shared per-day editor pattern. TemplateFooter resolves and renders hours via the helper.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (PostgreSQL JSONB), Tailwind CSS. Tests use Node's built-in `node:test` runner via `tsx` (no new dev dependency required).

**Spec:** `docs/superpowers/specs/2026-04-21-availability-schedule-design.md`

**Working directory:** All paths relative to `/Users/aws/Downloads/web-project/siteforowners`. Run all commands from that directory unless noted.

---

## File Map

**Create:**
- `supabase/migrations/006_add_imported_hours.sql` — adds `imported_hours jsonb` column to `previews`
- `src/lib/defaults/businessHours.ts` — `DEFAULT_HOURS`, `resolveDisplayHours`, `getHoursSource`, `parseGoogleHoursString`
- `src/lib/defaults/businessHours.test.ts` — unit tests for the helpers

**Modify:**
- `src/lib/ai/types.ts` — add `imported_hours?: BusinessHours` to `PreviewData`
- `src/app/api/generate-copy/route.ts:286` — also write `imported_hours` on insert
- `src/app/api/update-site/route.ts` — accept `imported_hours` and `section_settings.show_hours` updates
- `src/app/api/preview-data/route.ts` — return `imported_hours`
- `src/app/site/[slug]/page.tsx` — fetch `booking_settings.working_hours`, pass to client
- `src/app/site/[slug]/SiteClient.tsx` — accept and forward `bookingHours` prop
- `src/components/templates/TemplateOrchestrator.tsx` — accept `bookingHours` prop, add `show_hours` to `SectionSettings`, pass `bookingHours` and resolved visibility to footer
- `src/components/templates/TemplateFooter.tsx` — accept `bookingHours`, use `resolveDisplayHours`, respect `show_hours` toggle
- `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` — new "Display Hours" section UI; populate hours on Google Maps enrich; include hours/imported_hours/show_hours in save payload

---

## Task 1: Add `imported_hours` column to `previews` table

**Files:**
- Create: `supabase/migrations/006_add_imported_hours.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/006_add_imported_hours.sql`:

```sql
-- Snapshot of hours as originally imported from Google Maps.
-- Mutated only by the Google Maps import flow.
-- Used by SiteEditor's "Reset to Google Maps" button to restore the original.
ALTER TABLE previews ADD COLUMN IF NOT EXISTS imported_hours jsonb;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run via your existing Supabase CLI workflow (e.g. `supabase db push`) or paste the SQL into the Supabase dashboard SQL editor for the project.

Verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'previews' AND column_name = 'imported_hours';
```
Expected: one row returned with `imported_hours`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_add_imported_hours.sql
git commit -m "feat: add imported_hours column to previews"
```

---

## Task 2: Create the businessHours helper module with tests

**Files:**
- Create: `src/lib/defaults/businessHours.ts`
- Test: `src/lib/defaults/businessHours.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/defaults/businessHours.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOURS,
  resolveDisplayHours,
  getHoursSource,
  parseGoogleHoursString,
} from "./businessHours";

test("DEFAULT_HOURS: weekdays 10am-7pm, Saturday 10am-5pm, Sunday closed", () => {
  assert.deepEqual(DEFAULT_HOURS.Monday, { open: "10:00 AM", close: "7:00 PM" });
  assert.deepEqual(DEFAULT_HOURS.Friday, { open: "10:00 AM", close: "7:00 PM" });
  assert.deepEqual(DEFAULT_HOURS.Saturday, { open: "10:00 AM", close: "5:00 PM" });
  assert.deepEqual(DEFAULT_HOURS.Sunday, { open: "", close: "", closed: true });
});

test("resolveDisplayHours: booking hours win when present", () => {
  const booking = { Monday: { open: "8:00 AM", close: "6:00 PM" } };
  const preview = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  const result = resolveDisplayHours(booking, preview);
  assert.deepEqual(result.Monday, { open: "8:00 AM", close: "6:00 PM" });
});

test("resolveDisplayHours: preview hours used when no booking hours", () => {
  const preview = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  const result = resolveDisplayHours(null, preview);
  assert.deepEqual(result.Monday, { open: "9:00 AM", close: "5:00 PM" });
});

test("resolveDisplayHours: defaults used when neither source has data", () => {
  const result = resolveDisplayHours(null, null);
  assert.deepEqual(result, DEFAULT_HOURS);
});

test("resolveDisplayHours: empty objects fall through to defaults", () => {
  const result = resolveDisplayHours({}, {});
  assert.deepEqual(result, DEFAULT_HOURS);
});

test("resolveDisplayHours: booking_settings null day means closed", () => {
  // booking_settings stores closed days as null. Convert to {closed: true}.
  const booking = {
    Monday: { open: "9:00 AM", close: "5:00 PM" },
    Sunday: null,
  };
  const result = resolveDisplayHours(booking, null);
  assert.deepEqual(result.Sunday, { open: "", close: "", closed: true });
  assert.deepEqual(result.Monday, { open: "9:00 AM", close: "5:00 PM" });
});

test("getHoursSource: 'google' when previews.hours equals imported_hours", () => {
  const hours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  assert.equal(getHoursSource(null, hours, hours), "google");
});

test("getHoursSource: 'custom' when previews.hours differs from imported_hours", () => {
  const previewHours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  const importedHours = { Monday: { open: "10:00 AM", close: "6:00 PM" } };
  assert.equal(getHoursSource(null, previewHours, importedHours), "custom");
});

test("getHoursSource: 'custom' when previews.hours set but imported_hours null", () => {
  const previewHours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  assert.equal(getHoursSource(null, previewHours, null), "custom");
});

test("getHoursSource: 'default' when previews.hours is null", () => {
  assert.equal(getHoursSource(null, null, null), "default");
});

test("getHoursSource: 'booking' when booking_settings exists (regardless of preview hours)", () => {
  const booking = { Monday: { open: "8:00 AM", close: "6:00 PM" } };
  const previewHours = { Monday: { open: "9:00 AM", close: "5:00 PM" } };
  assert.equal(getHoursSource(booking, previewHours, null), "booking");
});

test("parseGoogleHoursString: parses semicolon-separated weekday descriptions", () => {
  const input =
    "Monday: 10:00 AM – 7:00 PM; Tuesday: 10:00 AM – 7:00 PM; Sunday: Closed";
  const result = parseGoogleHoursString(input);
  assert.deepEqual(result.Monday, { open: "10:00 AM", close: "7:00 PM" });
  assert.deepEqual(result.Sunday, { open: "", close: "", closed: true });
});

test("parseGoogleHoursString: returns empty object for null/empty input", () => {
  assert.deepEqual(parseGoogleHoursString(null), {});
  assert.deepEqual(parseGoogleHoursString(""), {});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/lib/defaults/businessHours.test.ts`

Expected: FAIL with "Cannot find module './businessHours'" (or equivalent).

- [ ] **Step 3: Write the helper module**

Create `src/lib/defaults/businessHours.ts`:

```typescript
import type { BusinessHours } from "@/lib/ai/types";

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type Day = (typeof DAY_ORDER)[number];

export const DEFAULT_HOURS: BusinessHours = {
  Monday: { open: "10:00 AM", close: "7:00 PM" },
  Tuesday: { open: "10:00 AM", close: "7:00 PM" },
  Wednesday: { open: "10:00 AM", close: "7:00 PM" },
  Thursday: { open: "10:00 AM", close: "7:00 PM" },
  Friday: { open: "10:00 AM", close: "7:00 PM" },
  Saturday: { open: "10:00 AM", close: "5:00 PM" },
  Sunday: { open: "", close: "", closed: true },
};

// booking_settings.working_hours stores closed days as `null` (not `{closed:true}`).
// Normalize to BusinessHours shape used by display layer.
type BookingHoursShape = Record<string, { open: string; close: string } | null> | null | undefined;

function normalizeBookingHours(booking: BookingHoursShape): BusinessHours | null {
  if (!booking || Object.keys(booking).length === 0) return null;
  const out: BusinessHours = {};
  for (const day of DAY_ORDER) {
    const v = booking[day];
    if (v === null) {
      out[day] = { open: "", close: "", closed: true };
    } else if (v) {
      out[day] = { open: v.open, close: v.close };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function isHoursEmpty(hours: BusinessHours | null | undefined): boolean {
  if (!hours) return true;
  return Object.keys(hours).length === 0;
}

/**
 * Precedence: booking_settings.working_hours → previews.hours → DEFAULT_HOURS.
 * Returns the hours map to render in the footer.
 */
export function resolveDisplayHours(
  bookingHours: BookingHoursShape,
  previewHours: BusinessHours | null | undefined
): BusinessHours {
  const normalizedBooking = normalizeBookingHours(bookingHours);
  if (normalizedBooking) return normalizedBooking;
  if (!isHoursEmpty(previewHours)) return previewHours as BusinessHours;
  return DEFAULT_HOURS;
}

export type HoursSource = "booking" | "google" | "custom" | "default";

/**
 * Identifies which source the displayed hours come from. Used by the
 * SiteEditor to render a "Source: ..." badge next to the editor.
 */
export function getHoursSource(
  bookingHours: BookingHoursShape,
  previewHours: BusinessHours | null | undefined,
  importedHours: BusinessHours | null | undefined
): HoursSource {
  if (normalizeBookingHours(bookingHours)) return "booking";
  if (isHoursEmpty(previewHours)) return "default";
  if (importedHours && JSON.stringify(previewHours) === JSON.stringify(importedHours)) {
    return "google";
  }
  return "custom";
}

/**
 * Parse the semicolon-separated weekday descriptions returned by the
 * Google Places API into the BusinessHours shape stored in previews.hours.
 *
 * Input example:
 *   "Monday: 10:00 AM – 7:00 PM; Tuesday: 10:00 AM – 7:00 PM; Sunday: Closed"
 */
export function parseGoogleHoursString(input: string | null | undefined): BusinessHours {
  if (!input) return {};
  const out: BusinessHours = {};
  const segments = input.split(";").map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const colonIdx = seg.indexOf(":");
    if (colonIdx === -1) continue;
    const day = seg.slice(0, colonIdx).trim();
    const value = seg.slice(colonIdx + 1).trim();
    if (!DAY_ORDER.includes(day as Day)) continue;
    if (/^closed$/i.test(value)) {
      out[day] = { open: "", close: "", closed: true };
      continue;
    }
    // Split on en-dash, em-dash, or hyphen with surrounding spaces.
    const parts = value.split(/\s*[–—-]\s*/);
    if (parts.length >= 2) {
      out[day] = { open: parts[0].trim(), close: parts[1].trim() };
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/lib/defaults/businessHours.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/defaults/businessHours.ts src/lib/defaults/businessHours.test.ts
git commit -m "feat: add businessHours helper with precedence and parsing"
```

---

## Task 3: Extend `PreviewData` type with `imported_hours`

**Files:**
- Modify: `src/lib/ai/types.ts:62-82`

- [ ] **Step 1: Add the field**

In `src/lib/ai/types.ts`, find the `PreviewData` interface and add `imported_hours` immediately after `hours`:

```typescript
export interface PreviewData {
  id?: string;
  slug?: string;
  business_name: string;
  business_type: BusinessType;
  phone?: string;
  color_theme: ColorTheme;
  services: ServiceItem[];
  products?: ProductItem[];
  booking_url?: string;
  hours?: BusinessHours;
  imported_hours?: BusinessHours;
  address?: string;
  images?: string[];
  rating?: number;
  review_count?: number;
  generated_copy?: GeneratedCopy;
  template_variant?: string;
  group_id?: string;
  variant_label?: string;
  is_selected?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/types.ts
git commit -m "feat: add imported_hours to PreviewData type"
```

---

## Task 4: Write `imported_hours` on preview creation in `generate-copy`

**Files:**
- Modify: `src/app/api/generate-copy/route.ts:286`

- [ ] **Step 1: Add `imported_hours` to the insert payload**

Find the `previewRows = templates.map(...)` block (around line 271). Add `imported_hours: hours || null` directly below the existing `hours: hours || null` line:

```typescript
return {
  slug: generateSlug(business_name),
  business_name,
  business_type,
  phone,
  color_theme: theme.id,
  services: services.filter((s) => s.name.trim()),
  products: products?.filter((p) => p.name.trim()) || [],
  booking_url,
  address,
  images,
  hours: hours || null,
  imported_hours: hours || null,
  rating: rating || null,
  review_count: review_count || null,
  generated_copy: {
    en: variant.en,
    es: variant.es,
    ...(customPalettes ? { custom_colors: customPalettes[i % customPalettes.length] } : {}),
    ...(brand_colors && brand_colors.length > 0 ? { brand_colors } : {}),
    ...(logo ? { logo } : {}),
    ...(booking_categories ? { booking_categories } : {}),
    ...(google_reviews && google_reviews.length > 0 ? { google_reviews } : {}),
  },
  template_variant: tmpl,
  group_id: groupId,
  variant_label: variantLabels[i] || String.fromCharCode(65 + i),
};
```

The `hours` parameter the wizard sends is already the parsed JSON object (from the Maps import flow in `src/app/(marketing)/preview/page.tsx`), so writing it to both columns captures the original Google snapshot.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/generate-copy/route.ts
git commit -m "feat: snapshot Google Maps hours into imported_hours on insert"
```

---

## Task 5: Allow `imported_hours` and `show_hours` updates in `update-site`

**Files:**
- Modify: `src/app/api/update-site/route.ts:35`

- [ ] **Step 1: Whitelist `imported_hours` updates**

In `src/app/api/update-site/route.ts`, find the line `if (updates.hours !== undefined) allowed.hours = updates.hours;` and add immediately after it:

```typescript
if (updates.imported_hours !== undefined) allowed.imported_hours = updates.imported_hours;
```

The existing `section_settings` merge logic at lines 54-56 already handles arbitrary keys including `show_hours`, so no further changes are needed for the toggle.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/update-site/route.ts
git commit -m "feat: allow imported_hours updates via update-site"
```

---

## Task 6: Return `imported_hours` from `preview-data`

**Files:**
- Modify: `src/app/api/preview-data/route.ts:53`

- [ ] **Step 1: Add the field to the returned shape**

In `src/app/api/preview-data/route.ts`, find `hours: preview.hours || null,` and add immediately after it:

```typescript
imported_hours: preview.imported_hours || null,
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/preview-data/route.ts
git commit -m "feat: return imported_hours from preview-data"
```

---

## Task 7: Add `show_hours` to `SectionSettings` and pass `bookingHours` through TemplateOrchestrator

**Files:**
- Modify: `src/components/templates/TemplateOrchestrator.tsx:95-149`

- [ ] **Step 1: Extend `SectionSettings` and add `bookingHours` prop**

In `src/components/templates/TemplateOrchestrator.tsx`:

1. Find the `SectionSettings` interface (line 95-109) and add `show_hours?: boolean;`:

```typescript
export interface SectionSettings {
  show_gallery?: boolean;
  show_about?: boolean;
  show_about_image?: boolean;
  show_services?: boolean;
  show_products?: boolean;
  show_booking?: boolean;
  show_contact?: boolean;
  show_map?: boolean;
  show_testimonials?: boolean;
  show_rating?: boolean;
  show_hours?: boolean;
  disable_animations?: boolean;
  about_image_url?: string | null;
  template_override?: string | null;
}
```

2. Find the `TemplateOrchestratorProps` interface (above the function, look near the top of the file) and add a `bookingHours?` prop. Then update the function signature to destructure it:

```typescript
interface TemplateOrchestratorProps {
  data: PreviewData;
  locale?: "en" | "es";
  isLive?: boolean;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
}

export function TemplateOrchestrator({
  data,
  locale: initialLocale = "en",
  isLive = false,
  bookingHours = null,
}: TemplateOrchestratorProps) {
```

(If the existing `TemplateOrchestratorProps` interface differs from the snippet above, preserve its other fields and just add `bookingHours`.)

3. Below the `showRating` line (around line 149), add:

```typescript
const showHours = ss.show_hours !== false;
```

4. Find the `<TemplateFooter ... />` JSX and pass through the new props. Add `bookingHours={bookingHours}` and `showHours={showHours}`:

```tsx
<TemplateFooter
  businessName={data.business_name}
  tagline={copy?.footer_tagline}
  address={data.address}
  phone={data.phone}
  hours={data.hours}
  bookingHours={bookingHours}
  showHours={showHours}
  colors={colors}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: TS errors will appear in `TemplateFooter.tsx` (props `bookingHours`, `showHours` not yet defined). That's expected — we fix it in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/TemplateOrchestrator.tsx
git commit -m "feat: thread bookingHours and show_hours through orchestrator"
```

---

## Task 8: Update `TemplateFooter` to use the helper and respect the toggle

**Files:**
- Modify: `src/components/templates/TemplateFooter.tsx`

- [ ] **Step 1: Update the props and rendering**

Replace the entire contents of `src/components/templates/TemplateFooter.tsx` with:

```typescript
import type { ThemeColors } from "@/lib/templates/themes";
import type { BusinessHours } from "@/lib/ai/types";
import { readableColors } from "@/lib/templates/contrast";
import { resolveDisplayHours } from "@/lib/defaults/businessHours";

interface TemplateFooterProps {
  businessName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  hours?: BusinessHours;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  showHours?: boolean;
  colors: ThemeColors;
}

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function TemplateFooter({
  businessName,
  tagline,
  address,
  phone,
  hours,
  bookingHours = null,
  showHours = true,
  colors,
}: TemplateFooterProps) {
  const rc = readableColors(colors);
  const displayHours = showHours ? resolveDisplayHours(bookingHours, hours) : null;
  return (
    <footer
      className="px-6 py-16"
      style={{ backgroundColor: colors.foreground }}
    >
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3">
        {/* Brand */}
        <div>
          <h3
            className="mb-3 text-xl font-bold"
            style={{ color: rc.textOnFg }}
          >
            {businessName}
          </h3>
          {tagline && (
            <p className="text-sm opacity-60" style={{ color: rc.textOnFg }}>
              {tagline}
            </p>
          )}
        </div>

        {/* Contact */}
        <div>
          <h4
            className="mb-3 text-sm font-semibold uppercase tracking-wider"
            style={{ color: rc.primaryOnFg }}
          >
            Contact
          </h4>
          {address && (
            <p className="mb-2 text-sm opacity-70" style={{ color: rc.textOnFg }}>
              {address}
            </p>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="text-sm font-medium hover:underline"
              style={{ color: rc.primaryOnFg }}
            >
              {phone}
            </a>
          )}
        </div>

        {/* Hours */}
        {displayHours && (
          <div>
            <h4
              className="mb-3 text-sm font-semibold uppercase tracking-wider"
              style={{ color: rc.primaryOnFg }}
            >
              Hours
            </h4>
            <div className="space-y-1">
              {DAY_ORDER.map((day) => {
                const h = displayHours[day];
                if (!h) return null;
                return (
                  <div
                    key={day}
                    className="flex justify-between text-sm opacity-70"
                    style={{ color: rc.textOnFg }}
                  >
                    <span>{day.slice(0, 3)}</span>
                    <span>{h.closed ? "Closed" : `${h.open} – ${h.close}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        className="mx-auto mt-12 max-w-5xl border-t pt-6 text-center text-xs opacity-40"
        style={{
          borderColor: rc.textOnFg + "20",
          color: rc.textOnFg,
        }}
      >
        &copy; {new Date().getFullYear()} {businessName}. Powered by{" "}
        <a
          href="https://siteforowners.com"
          className="underline hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
        >
          SiteForOwners
        </a>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/TemplateFooter.tsx
git commit -m "feat: footer uses resolveDisplayHours and respects show_hours toggle"
```

---

## Task 9: Load `booking_settings.working_hours` in the public site page

**Files:**
- Modify: `src/app/site/[slug]/page.tsx`
- Modify: `src/app/site/[slug]/SiteClient.tsx`

- [ ] **Step 1: Inspect SiteClient to know its current props**

Run: `cat src/app/site/[slug]/SiteClient.tsx | head -40`

Note the prop signature so the next step preserves it.

- [ ] **Step 2: Update the page to fetch booking_settings and pass through**

In `src/app/site/[slug]/page.tsx`, replace `getSiteData` and `SitePage` with:

```typescript
type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

async function getSiteData(
  slug: string
): Promise<{ preview: PreviewData; bookingHours: BookingHoursMap } | null> {
  const supabase = createAdminClient();
  const { data: preview, error } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !preview) return null;

  // Find the tenant that owns this preview, if any, then load booking hours.
  let bookingHours: BookingHoursMap = null;
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("preview_slug", slug)
    .maybeSingle();

  if (tenant?.id) {
    const { data: bs } = await supabase
      .from("booking_settings")
      .select("working_hours")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    bookingHours = (bs?.working_hours as BookingHoursMap) ?? null;
  }

  return { preview: preview as PreviewData, bookingHours };
}

export default async function SitePage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await getSiteData(params.slug);
  if (!result) notFound();
  return <SiteClient data={result.preview} bookingHours={result.bookingHours} />;
}
```

Leave `generateMetadata` and `revalidate` unchanged.

- [ ] **Step 3: Update SiteClient to accept and forward `bookingHours`**

In `src/app/site/[slug]/SiteClient.tsx`, update the prop type and pass `bookingHours` into `<TemplateOrchestrator />`. Example (adapt to current shape):

```typescript
"use client";
import { TemplateOrchestrator } from "@/components/templates/TemplateOrchestrator";
import type { PreviewData } from "@/lib/ai/types";

interface SiteClientProps {
  data: PreviewData;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
}

export function SiteClient({ data, bookingHours = null }: SiteClientProps) {
  return <TemplateOrchestrator data={data} bookingHours={bookingHours} />;
}
```

If `SiteClient.tsx` does more than this (locale picker, layout wrappers, etc.), preserve all existing behavior and only add the `bookingHours` prop and pass-through.

- [ ] **Step 4: Verify TypeScript compiles and the dev server renders without errors**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000/site/<any-existing-slug>` and confirm the page renders. Stop the dev server with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add src/app/site/[slug]/page.tsx src/app/site/[slug]/SiteClient.tsx
git commit -m "feat: load booking_settings.working_hours for public site"
```

---

## Task 10: Add the "Display Hours" section to SiteEditor

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

- [ ] **Step 1: Add state for display hours, imported snapshot, and the toggle**

In `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`, add these imports at the top of the file (with the other imports):

```typescript
import {
  DEFAULT_HOURS,
  getHoursSource,
} from "@/lib/defaults/businessHours";
import type { BusinessHours } from "@/lib/ai/types";
```

Then near the other `useState` declarations (around lines 50-105), add:

```typescript
// Display hours (footer). Separate from booking_settings.working_hours.
const initialDisplayHours: BusinessHours =
  (preview.hours as BusinessHours) ||
  DEFAULT_HOURS;
const [displayHours, setDisplayHours] = useState<BusinessHours>(initialDisplayHours);
const [importedHours, setImportedHours] = useState<BusinessHours | null>(
  (preview.imported_hours as BusinessHours) || null
);
const [showHoursOnSite, setShowHoursOnSite] = useState<boolean>(
  existingSettings.show_hours !== false
);
```

- [ ] **Step 2: Include hours fields in the save payload**

In `handleSave` (around line 161), update the body to include `hours`, `imported_hours`, and `show_hours`. Find this block:

```typescript
body: JSON.stringify({
  slug,
  updates: {
    business_name: businessName,
    phone,
    address,
    booking_url: bookingUrl || null,
    services: services.filter((s) => s.name.trim()),
    products: products.filter((p) => p.name.trim()),
    images,
    generated_copy: {
      en: { ... },
      section_settings: {
        ...sectionSettings,
        about_image_url: sectionSettings.about_image_url || null,
        template_override: sectionSettings.template_override || null,
      },
    },
  },
}),
```

Modify it to:

```typescript
body: JSON.stringify({
  slug,
  updates: {
    business_name: businessName,
    phone,
    address,
    booking_url: bookingUrl || null,
    services: services.filter((s) => s.name.trim()),
    products: products.filter((p) => p.name.trim()),
    images,
    hours: displayHours,
    imported_hours: importedHours,
    generated_copy: {
      en: {
        hero_headline: headline,
        hero_subheadline: subheadline,
        about_paragraphs: aboutParagraphs,
        footer_tagline: footerTagline,
      },
      section_settings: {
        ...sectionSettings,
        show_hours: showHoursOnSite,
        about_image_url: sectionSettings.about_image_url || null,
        template_override: sectionSettings.template_override || null,
      },
    },
  },
}),
```

- [ ] **Step 3: Add a `previewData` field for the live preview**

Find the `previewData` object (around line 347) and add `hours: displayHours` and `imported_hours: importedHours`, plus the `show_hours` key in `section_settings`:

```typescript
const previewData = {
  ...preview,
  business_name: businessName,
  phone,
  address,
  booking_url: bookingUrl,
  services: services.filter((s) => s.name.trim()),
  products: products.filter((p) => p.name.trim()),
  images,
  hours: displayHours,
  imported_hours: importedHours,
  generated_copy: {
    ...copy,
    en: {
      ...enCopy,
      hero_headline: headline,
      hero_subheadline: subheadline,
      about_paragraphs: aboutParagraphs,
      footer_tagline: footerTagline,
    },
    section_settings: {
      ...sectionSettings,
      show_hours: showHoursOnSite,
      about_image_url: sectionSettings.about_image_url || null,
      template_override: sectionSettings.template_override || null,
    },
  },
};
```

- [ ] **Step 4: Render the Display Hours section UI**

Locate the area where existing toggleable sections are rendered (look for `show_gallery` / `show_services` toggle JSX in the editor — same column as booking settings). Insert a new `<section>` block. If you can't find an obvious anchor, place it directly above the existing "Working hours" section (currently at line 934 inside the booking section) so admins see display-hours editing first, booking-hours second.

```tsx
{/* Display Hours (footer) */}
<section className="rounded-xl border bg-white p-6 shadow-sm">
  <div className="mb-4 flex items-center justify-between">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Business Hours</h2>
      <p className="mt-1 text-xs text-gray-500">
        Source: {labelForSource(getHoursSource(workingHours, displayHours, importedHours))}
      </p>
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={showHoursOnSite}
        onChange={(e) => setShowHoursOnSite(e.target.checked)}
        className="h-4 w-4"
      />
      Show on website
    </label>
  </div>

  {bookingSettingsLoaded && Object.keys(workingHours).some((d) => workingHours[d] !== null) && (
    <div className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
      Your booking schedule is currently displayed on the site. Edits here will only show if you
      disable the booking hours below.
    </div>
  )}

  <div className="mb-4 space-y-2">
    {DAYS_OF_WEEK.map((day) => {
      const h = displayHours[day];
      const isClosed = !!h?.closed;
      return (
        <div key={`disp-${day}`} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm font-medium text-gray-900">
            {day.slice(0, 3)}
          </span>
          {!isClosed ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={h?.open || ""}
                onChange={(e) =>
                  setDisplayHours((prev) => ({
                    ...prev,
                    [day]: { open: e.target.value, close: prev[day]?.close || "" },
                  }))
                }
                className="w-24 rounded border px-2 py-1 text-xs"
                placeholder="10:00 AM"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="text"
                value={h?.close || ""}
                onChange={(e) =>
                  setDisplayHours((prev) => ({
                    ...prev,
                    [day]: { open: prev[day]?.open || "", close: e.target.value },
                  }))
                }
                className="w-24 rounded border px-2 py-1 text-xs"
                placeholder="7:00 PM"
              />
            </div>
          ) : (
            <span className="text-xs text-gray-400">Closed</span>
          )}
          <button
            type="button"
            onClick={() =>
              setDisplayHours((prev) => ({
                ...prev,
                [day]: isClosed
                  ? { open: "10:00 AM", close: "7:00 PM" }
                  : { open: "", close: "", closed: true },
              }))
            }
            className={`ml-auto rounded px-2 py-0.5 text-xs ${
              isClosed
                ? "text-green-600 hover:bg-green-50"
                : "text-red-500 hover:bg-red-50"
            }`}
          >
            {isClosed ? "Open" : "Close"}
          </button>
        </div>
      );
    })}
  </div>

  <div className="flex flex-wrap gap-2">
    {importedHours && (
      <button
        type="button"
        onClick={() => setDisplayHours(importedHours)}
        className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
      >
        Reset to Google Maps
      </button>
    )}
    <button
      type="button"
      onClick={() => setDisplayHours(DEFAULT_HOURS)}
      className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
    >
      Reset to defaults
    </button>
  </div>
</section>
```

- [ ] **Step 5: Add the `labelForSource` helper next to the component (top of file, after imports)**

```typescript
function labelForSource(source: "booking" | "google" | "custom" | "default"): string {
  switch (source) {
    case "booking":
      return "Booking schedule (overrides display hours)";
    case "google":
      return "From Google Maps";
    case "custom":
      return "Custom";
    case "default":
      return "Default";
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles and dev server runs**

```bash
npx tsc --noEmit
npm run dev
```

Open the SiteEditor in a browser (`http://localhost:3000/clients/<tenantId>/edit`) and confirm:
- "Business Hours" section renders
- Per-day inputs respond to typing
- Toggle "Show on website" updates state
- "Reset to defaults" populates the Mon–Fri 10–7 / Sat 10–5 / Sun closed pattern
- "Reset to Google Maps" appears only if the preview has imported_hours

Stop the dev server with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx
git commit -m "feat: add Business Hours editor section to SiteEditor"
```

---

## Task 11: Populate `imported_hours` and `hours` when re-importing from Google Maps in SiteEditor

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx:265-294`

- [ ] **Step 1: Add `parseGoogleHoursString` to the existing import**

In `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`, find the import added in Task 10:

```typescript
import {
  DEFAULT_HOURS,
  getHoursSource,
} from "@/lib/defaults/businessHours";
```

Update it to also include `parseGoogleHoursString`:

```typescript
import {
  DEFAULT_HOURS,
  getHoursSource,
  parseGoogleHoursString,
} from "@/lib/defaults/businessHours";
```

- [ ] **Step 2: Update `handleMapsEnrich` to parse and set hours**

In `handleMapsEnrich` (line 265), after the existing `if (d.services?.length > 0 && services.length === 0) setServices(d.services);` line and before `setSaved(true)`, add:

```typescript
if (d.hours) {
  const parsed = parseGoogleHoursString(d.hours);
  if (Object.keys(parsed).length > 0) {
    setDisplayHours(parsed);
    setImportedHours(parsed);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx
git commit -m "feat: capture Google Maps hours during SiteEditor re-import"
```

---

## Task 12: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Start dev server and run scenarios**

```bash
npm run dev
```

Verify each scenario in a browser:

**Scenario A — Tenant without Google Maps data, no booking_settings:**
1. Open the public site for a preview that has `hours = null`, `imported_hours = null`, and no booking_settings row.
2. Footer **Hours** column shows: Mon–Fri 10:00 AM – 7:00 PM, Sat 10:00 AM – 5:00 PM, Sun Closed.
3. Open SiteEditor → Business Hours section. Source label says "Default". "Reset to Google Maps" button is hidden.

**Scenario B — Tenant with Google Maps hours, no booking_settings:**
1. Open the public site for a preview that has `hours` populated from Google.
2. Footer shows the Google hours.
3. SiteEditor → Source label "From Google Maps". Edit Monday close to "8:00 PM", Save. Reload public site → Monday shows 8:00 PM. Source label now "Custom".
4. Click "Reset to Google Maps" → Monday returns to original close. Save → public site reflects original.

**Scenario C — Toggle off:**
1. In SiteEditor, uncheck "Show on website". Save.
2. Reload public site. Footer **Hours** column is hidden entirely.
3. Re-check the toggle, save, hours appear again.

**Scenario D — Booking settings precedence:**
1. For a tenant with both display hours and booking_settings.working_hours configured, confirm the public footer renders the booking_settings values.
2. SiteEditor shows the override notice banner above the Business Hours editor.
3. Editing display hours and saving does not change what the footer shows (booking still wins). Disable booking_settings (set all days to null in the booking section) → footer now reflects display hours.

**Scenario E — Maps re-import overwrites hours:**
1. In SiteEditor, click "Fetch from Google Maps". After it completes, both `displayHours` and `importedHours` are populated from the Google response.
2. Save → public site reflects the imported hours. Source label "From Google Maps".

- [ ] **Step 2: Stop the dev server**

Ctrl-C in the terminal running `npm run dev`.

- [ ] **Step 3: Run the unit tests one more time as a smoke check**

```bash
npx tsx --test src/lib/defaults/businessHours.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: No commit needed for verification.**

If any scenario failed, file a bug noting which step, then return to the relevant task.
