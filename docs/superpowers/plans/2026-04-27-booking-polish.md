# Booking Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-managed service categories, per-service add-ons, a 2-screen customer booking modal with running totals, and stable per-service `client_id`s.

**Architecture:** All new data lives inside the existing `previews.data` JSONB (`previews.categories: string[]` and per-service `category`/`add_ons`/`client_id` fields). The 5 service templates gain a small grouping pass via a shared `groupServices` helper. The existing `RealBookingCalendar` (in `TemplateBooking.tsx`) is extracted to its own file and refactored from a 5-step flow to a 2-screen flow with running totals. A single new migration adds `selected_add_ons` (jsonb) to `bookings`. No new DB tables.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Tailwind, Supabase (Postgres + JSONB + Storage + RLS), Twilio SDK v6, Framer Motion, `node:test` + `tsx` for unit tests.

**Spec reference:** [`docs/superpowers/specs/2026-04-27-booking-polish-design.md`](../specs/2026-04-27-booking-polish-design.md)

---

## File structure

### New files (created by this plan)

| File | Responsibility |
|---|---|
| `src/lib/validation/categories.ts` | Pure validator for `categories: string[]` (length, dedup, trim, max 10) |
| `src/lib/validation/categories.test.ts` | Unit tests for above |
| `src/lib/validation/add-ons.ts` | Pure validator for `add_ons: AddOn[]` (numeric ranges, name trunc, max 5) |
| `src/lib/validation/add-ons.test.ts` | Unit tests for above |
| `src/components/templates/services/groupServices.ts` | Pure helper: `groupServices(services, categories) -> Group[]` |
| `src/components/templates/services/groupServices.test.ts` | Unit tests for above |
| `src/app/site/[slug]/admin/services/CategoriesPanel.tsx` | Owner UI: chip list + add/rename/remove with cascade |
| `src/components/templates/CustomerBookingFlow.tsx` | Extracted in-site booking flow (was inline `RealBookingCalendar` in `TemplateBooking.tsx`) — 2-screen state machine with add-ons |
| `supabase/migrations/018_add_booking_addons.sql` | Add `selected_add_ons jsonb` and `add_ons_total_price numeric` to `bookings` |

### Modified files

| File | Why |
|---|---|
| `src/lib/ai/types.ts` | Add `AddOn`, extend `ServiceItem` (client_id/category/add_ons), extend `PreviewData` (categories) |
| `src/app/api/admin/services/route.ts` | Validate categories + cascade renames; validate add-ons; preserve client_id |
| `src/app/site/[slug]/admin/services/ServicesClient.tsx` | Mount `CategoriesPanel`, normalize `client_id`, pass cascade callbacks |
| `src/app/site/[slug]/admin/_components/ServiceRow.tsx` | Category dropdown + add-ons editor |
| `src/components/templates/services/BoldServices.tsx` | Render category headers (Bold aesthetic) using `groupServices` |
| `src/components/templates/services/VibrantServices.tsx` | Same (Vibrant aesthetic) |
| `src/components/templates/services/ClassicServices.tsx` | Same (Classic aesthetic) |
| `src/components/templates/services/ElegantServices.tsx` | Same (Elegant aesthetic) |
| `src/components/templates/services/WarmServices.tsx` | Same (Warm aesthetic) |
| `src/components/templates/TemplateBooking.tsx` | Replace inline `RealBookingCalendar` with import of `CustomerBookingFlow`; pass categories/add-ons through |
| `src/app/api/create-booking/route.ts` | Accept `selected_add_ons`; persist them; use total duration |
| `src/lib/sms.ts` | Append add-on names to owner notification template |

---

## Task 1: Type extensions for AddOn, ServiceItem, PreviewData

**Files:**
- Modify: `siteforowners/src/lib/ai/types.ts:22-30, 68-90`

- [ ] **Step 1: Add `AddOn` interface and extend `ServiceItem`**

Edit `siteforowners/src/lib/ai/types.ts`. Replace the existing `ServiceItem` block (lines 22-30) with:

```ts
/**
 * Customer-selectable extra applied to a single service. Persisted in
 * previews.services[].add_ons. Multiple of 30 minutes; non-negative price.
 */
export interface AddOn {
  name: string;                    // ≤ 80 chars (server truncates)
  price_delta: number;             // ≥ 0, max 2 decimals
  duration_delta_minutes: number;  // ≥ 0, multiple of 30
}

export interface ServiceItem {
  name: string;
  price: string;
  description?: string;
  /** v2 (Spec 1) — multiples of 30, range [30, 480]. */
  duration_minutes?: number;
  /** v3 (Spec 3) — public URL of the uploaded service image. */
  image?: string;
  /** v4 (Spec 4) — stable client-side ID; preserved across renames. */
  client_id?: string;
  /** v4 (Spec 4) — must match one of previews.categories if set. */
  category?: string;
  /** v4 (Spec 4) — optional extras the customer can add at booking time. */
  add_ons?: AddOn[];
}
```

- [ ] **Step 2: Add `categories` to `PreviewData`**

In the same file, find the `PreviewData` interface (line 68) and add `categories?: string[];` after `services: ServiceItem[];`:

```ts
export interface PreviewData {
  // ... existing fields above unchanged ...
  services: ServiceItem[];
  /** v4 (Spec 4) — owner-managed ordered category list (max 10). */
  categories?: string[];
  products?: ProductItem[];
  // ... rest unchanged ...
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `siteforowners/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/types.ts
git commit -m "feat(types): add AddOn + categories/add_ons/client_id to ServiceItem and PreviewData"
```

---

## Task 2: Validation helper for categories

**Files:**
- Create: `siteforowners/src/lib/validation/categories.ts`
- Create: `siteforowners/src/lib/validation/categories.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `siteforowners/src/lib/validation/categories.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCategories } from "./categories";

test("validateCategories: accepts undefined (omitted field)", () => {
  const r = validateCategories(undefined);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, []);
});

test("validateCategories: accepts empty array", () => {
  const r = validateCategories([]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, []);
});

test("validateCategories: trims each entry", () => {
  const r = validateCategories(["  Knotless  ", "Touch ups"]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, ["Knotless", "Touch ups"]);
});

test("validateCategories: rejects non-array", () => {
  const r = validateCategories("foo");
  assert.equal(r.ok, false);
});

test("validateCategories: rejects non-string entries", () => {
  const r = validateCategories(["ok", 5, "also ok"]);
  assert.equal(r.ok, false);
});

test("validateCategories: rejects empty after trim", () => {
  const r = validateCategories(["valid", "   "]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0].field, "categories[1]");
});

test("validateCategories: rejects > 60 chars", () => {
  const r = validateCategories(["x".repeat(61)]);
  assert.equal(r.ok, false);
});

test("validateCategories: rejects > 10 entries", () => {
  const r = validateCategories(Array(11).fill(0).map((_, i) => `c${i}`));
  assert.equal(r.ok, false);
});

test("validateCategories: rejects duplicates (case-insensitive after trim)", () => {
  const r = validateCategories(["Knotless", "knotless"]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors[0].reason, /duplicate/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd siteforowners && npx tsx --test src/lib/validation/categories.test.ts
```
Expected: ALL FAIL with "Cannot find module './categories'".

- [ ] **Step 3: Implement the validator**

Create `siteforowners/src/lib/validation/categories.ts`:

```ts
export interface CategoriesValidationError {
  field: string;
  reason: string;
}

export type CategoriesValidationResult =
  | { ok: true; value: string[] }
  | { ok: false; errors: CategoriesValidationError[] };

const MAX_ENTRIES = 10;
const MAX_LENGTH = 60;

export function validateCategories(input: unknown): CategoriesValidationResult {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ field: "categories", reason: "must be an array" }] };
  }
  if (input.length > MAX_ENTRIES) {
    return { ok: false, errors: [{ field: "categories", reason: `at most ${MAX_ENTRIES} entries` }] };
  }
  const errors: CategoriesValidationError[] = [];
  const value: string[] = [];
  const seen = new Set<string>();
  input.forEach((entry, i) => {
    if (typeof entry !== "string") {
      errors.push({ field: `categories[${i}]`, reason: "must be a string" });
      return;
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      errors.push({ field: `categories[${i}]`, reason: "must not be empty" });
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      errors.push({ field: `categories[${i}]`, reason: `at most ${MAX_LENGTH} characters` });
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      errors.push({ field: `categories[${i}]`, reason: "duplicate of an earlier entry" });
      return;
    }
    seen.add(key);
    value.push(trimmed);
  });
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd siteforowners && npx tsx --test src/lib/validation/categories.test.ts
```
Expected: 9 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/categories.ts src/lib/validation/categories.test.ts
git commit -m "feat(validation): pure validator for owner-managed categories list"
```

---

## Task 3: Validation helper for add-ons

**Files:**
- Create: `siteforowners/src/lib/validation/add-ons.ts`
- Create: `siteforowners/src/lib/validation/add-ons.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `siteforowners/src/lib/validation/add-ons.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAddOns } from "./add-ons";

test("validateAddOns: accepts undefined", () => {
  const r = validateAddOns(undefined);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, []);
});

test("validateAddOns: accepts empty array", () => {
  const r = validateAddOns([]);
  assert.equal(r.ok, true);
});

test("validateAddOns: accepts well-formed add-on", () => {
  const r = validateAddOns([
    { name: "Hair Wash", price_delta: 25, duration_delta_minutes: 30 },
  ]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value[0].name, "Hair Wash");
    assert.equal(r.value[0].price_delta, 25);
    assert.equal(r.value[0].duration_delta_minutes, 30);
  }
});

test("validateAddOns: truncates name to 80 chars", () => {
  const long = "x".repeat(150);
  const r = validateAddOns([
    { name: long, price_delta: 0, duration_delta_minutes: 0 },
  ]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value[0].name.length, 80);
});

test("validateAddOns: rejects negative price_delta", () => {
  const r = validateAddOns([
    { name: "x", price_delta: -1, duration_delta_minutes: 30 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: rejects non-multiple-of-30 duration", () => {
  const r = validateAddOns([
    { name: "x", price_delta: 0, duration_delta_minutes: 45 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: rejects negative duration", () => {
  const r = validateAddOns([
    { name: "x", price_delta: 0, duration_delta_minutes: -30 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: truncates to 5 entries silently", () => {
  const six = Array(6).fill(0).map((_, i) => ({
    name: `a${i}`,
    price_delta: 0,
    duration_delta_minutes: 0,
  }));
  const r = validateAddOns(six);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.length, 5);
});

test("validateAddOns: rejects empty name after trim", () => {
  const r = validateAddOns([
    { name: "  ", price_delta: 0, duration_delta_minutes: 0 },
  ]);
  assert.equal(r.ok, false);
});

test("validateAddOns: rejects non-array input", () => {
  const r = validateAddOns("nope");
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd siteforowners && npx tsx --test src/lib/validation/add-ons.test.ts
```
Expected: ALL FAIL with "Cannot find module './add-ons'".

- [ ] **Step 3: Implement the validator**

Create `siteforowners/src/lib/validation/add-ons.ts`:

```ts
import type { AddOn } from "@/lib/ai/types";

export interface AddOnValidationError {
  field: string;
  reason: string;
}

export type AddOnValidationResult =
  | { ok: true; value: AddOn[] }
  | { ok: false; errors: AddOnValidationError[] };

const MAX_ENTRIES = 5;
const MAX_NAME_LENGTH = 80;

export function validateAddOns(input: unknown): AddOnValidationResult {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ field: "add_ons", reason: "must be an array" }] };
  }
  // Silently truncate to MAX_ENTRIES — matches the existing pattern for
  // length-bounded fields (server is the source of truth, client UI also caps).
  const limited = input.slice(0, MAX_ENTRIES);
  const errors: AddOnValidationError[] = [];
  const value: AddOn[] = [];
  limited.forEach((entry, i) => {
    if (!entry || typeof entry !== "object") {
      errors.push({ field: `add_ons[${i}]`, reason: "must be an object" });
      return;
    }
    const r = entry as Record<string, unknown>;
    let name = typeof r.name === "string" ? r.name.trim() : "";
    const priceRaw = r.price_delta;
    const durationRaw = r.duration_delta_minutes;
    if (name.length === 0) {
      errors.push({ field: `add_ons[${i}].name`, reason: "must not be empty" });
      return;
    }
    if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH);
    const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
    const duration = typeof durationRaw === "number" ? durationRaw : Number(durationRaw);
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ field: `add_ons[${i}].price_delta`, reason: "must be a non-negative number" });
      return;
    }
    if (!Number.isInteger(duration) || duration < 0 || duration % 30 !== 0) {
      errors.push({
        field: `add_ons[${i}].duration_delta_minutes`,
        reason: "must be a non-negative integer multiple of 30",
      });
      return;
    }
    value.push({ name, price_delta: price, duration_delta_minutes: duration });
  });
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd siteforowners && npx tsx --test src/lib/validation/add-ons.test.ts
```
Expected: 10 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/add-ons.ts src/lib/validation/add-ons.test.ts
git commit -m "feat(validation): pure validator for per-service add-ons"
```

---

## Task 4: Wire categories + add-ons + client_id into the services API

**Files:**
- Modify: `siteforowners/src/app/api/admin/services/route.ts:1-147`

- [ ] **Step 1: Update validation function and route to accept categories + add-ons + client_id**

Replace the entire contents of `siteforowners/src/app/api/admin/services/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem, AddOn } from "@/lib/ai/types";
import { validateCategories } from "@/lib/validation/categories";
import { validateAddOns } from "@/lib/validation/add-ons";

const MAX_NAME = 80;
const MAX_PRICE = 30;
const MAX_DESCRIPTION = 1000;

function imageOriginAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!supabaseUrl) return false;
    const expected = new URL(supabaseUrl);
    return u.origin === expected.origin && u.pathname.startsWith("/storage/v1/object/public/service-images/");
  } catch {
    return false;
  }
}

interface ValidationError {
  index: number;
  field: string;
  reason: string;
}

interface ValidationOk {
  ok: true;
  services: ServiceItem[];
  categories: string[];
}
interface ValidationFail {
  ok: false;
  errors: ValidationError[];
}

function validatePayload(body: Record<string, unknown>): ValidationOk | ValidationFail {
  const errors: ValidationError[] = [];

  // Categories first — service.category validation depends on the parsed list.
  const catResult = validateCategories(body.categories);
  if (!catResult.ok) {
    catResult.errors.forEach((e) => errors.push({ index: -1, field: e.field, reason: e.reason }));
  }
  const categories: string[] = catResult.ok ? catResult.value : [];
  const categorySet = new Set(categories);

  const rawServices = body.services;
  if (!Array.isArray(rawServices)) {
    errors.push({ index: -1, field: "services", reason: "must be an array" });
    return { ok: false, errors };
  }

  const services: ServiceItem[] = [];
  rawServices.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push({ index, field: "service", reason: "must be an object" });
      return;
    }
    const r = item as Record<string, unknown>;
    let name = typeof r.name === "string" ? r.name.trim() : "";
    let price = typeof r.price === "string" ? r.price.trim() : "";
    let description = typeof r.description === "string" ? r.description.trim() : undefined;
    const duration_minutes = typeof r.duration_minutes === "number" ? r.duration_minutes : undefined;
    const image = typeof r.image === "string" ? r.image.trim() : undefined;
    const client_id = typeof r.client_id === "string" ? r.client_id.trim() || undefined : undefined;
    const category =
      typeof r.category === "string" && r.category.trim().length > 0
        ? r.category.trim()
        : undefined;

    if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME);
    if (price.length > MAX_PRICE) price = price.slice(0, MAX_PRICE);
    if (description !== undefined && description.length > MAX_DESCRIPTION) {
      description = description.slice(0, MAX_DESCRIPTION);
    }

    if (!name) errors.push({ index, field: "name", reason: "required" });
    if (!price) errors.push({ index, field: "price", reason: "required" });
    if (duration_minutes !== undefined) {
      if (!Number.isInteger(duration_minutes) || duration_minutes < 30 || duration_minutes > 480 || duration_minutes % 30 !== 0) {
        errors.push({ index, field: "duration_minutes", reason: "must be an integer multiple of 30 in [30, 480]" });
      }
    }
    if (image !== undefined && image !== "" && !imageOriginAllowed(image)) {
      errors.push({ index, field: "image", reason: "must be a service-images bucket URL" });
    }
    if (category !== undefined && !categorySet.has(category)) {
      errors.push({ index, field: "category", reason: `not in categories list: "${category}"` });
    }

    // Validate add-ons. Wrap errors with the service index for the row-level UI.
    const aoResult = validateAddOns(r.add_ons);
    if (!aoResult.ok) {
      aoResult.errors.forEach((e) => errors.push({ index, field: e.field, reason: e.reason }));
    }
    const add_ons: AddOn[] | undefined =
      aoResult.ok && aoResult.value.length > 0 ? aoResult.value : undefined;

    services.push({
      name,
      price,
      description: description || undefined,
      duration_minutes,
      image: image || undefined,
      client_id,
      category,
      add_ons,
    });
  });

  return errors.length === 0
    ? { ok: true, services, categories }
    : { ok: false, errors };
}

async function loadStateForTenant(
  tenantId: string,
): Promise<{ services: ServiceItem[]; categories: string[] }> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  if (!slug) return { services: [], categories: [] };
  const { data: preview } = await supabase
    .from("previews")
    .select("services, categories")
    .eq("slug", slug)
    .maybeSingle();
  return {
    services: ((preview?.services as ServiceItem[] | null) ?? []),
    categories: ((preview?.categories as string[] | null) ?? []),
  };
}

async function saveStateForTenant(
  tenantId: string,
  services: ServiceItem[],
  categories: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  if (!slug) return { ok: false, error: "Tenant has no preview_slug" };
  const { error } = await supabase
    .from("previews")
    .update({ services, categories })
    .eq("slug", slug);
  if (error) {
    console.error("[admin/services] save failed", { tenantId, error });
    return { ok: false, error: "Save failed" };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const tenantIdParam = new URL(request.url).searchParams.get("tenant_id") ?? undefined;
  const auth = await requireOwnerOrFounder(request, tenantIdParam);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const state = await loadStateForTenant(auth.tenantId);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const fallbackTenantId =
    typeof (body as Record<string, unknown>)?.tenant_id === "string"
      ? ((body as Record<string, unknown>).tenant_id as string)
      : undefined;

  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = validatePayload(body as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json({ error: "Validation failed", errors: result.errors }, { status: 400 });
  }

  const saveResult = await saveStateForTenant(auth.tenantId, result.services, result.categories);
  if (!saveResult.ok) {
    return NextResponse.json({ error: saveResult.error ?? "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, services: result.services, categories: result.categories });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Smoke-test the GET endpoint manually**

Start the dev server (`npm run dev` from `siteforowners/`). In another terminal, sign in as an owner via the admin UI, then verify the API responds:

```bash
curl -i 'http://localhost:3000/api/admin/services' -H 'cookie: <session-cookie>'
```

Expected: 200 with `{"services":[...], "categories":[]}` (categories empty for tenants who haven't yet adopted the new field).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/services/route.ts
git commit -m "feat(api/services): accept + validate categories and per-service add-ons"
```

---

## Task 5: Owner-side categories panel component

**Files:**
- Create: `siteforowners/src/app/site/[slug]/admin/services/CategoriesPanel.tsx`

- [ ] **Step 1: Create the component**

Create `siteforowners/src/app/site/[slug]/admin/services/CategoriesPanel.tsx`:

```tsx
"use client";

import { useState } from "react";

interface CategoriesPanelProps {
  categories: string[];
  /** Count of services per category, plus "Other" for uncategorized. */
  counts: Record<string, number>;
  onChange: (next: string[], rename?: { from: string; to: string }, remove?: string) => void;
}

const MAX_ENTRIES = 10;
const MAX_LENGTH = 60;

export function CategoriesPanel({ categories, counts, onChange }: CategoriesPanelProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commitRename(index: number) {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`Name must be ${MAX_LENGTH} characters or less`);
      return;
    }
    const lower = trimmed.toLowerCase();
    const conflict = categories.some(
      (c, i) => i !== index && c.toLowerCase() === lower,
    );
    if (conflict) {
      setError("That name already exists");
      return;
    }
    const oldName = categories[index];
    if (oldName === trimmed) {
      setEditingIndex(null);
      setError(null);
      return;
    }
    const next = categories.map((c, i) => (i === index ? trimmed : c));
    onChange(next, { from: oldName, to: trimmed });
    setEditingIndex(null);
    setError(null);
  }

  function add() {
    if (categories.length >= MAX_ENTRIES) {
      setError(`At most ${MAX_ENTRIES} categories`);
      return;
    }
    const placeholder = "New category";
    const next = [...categories, placeholder];
    onChange(next);
    setEditingIndex(next.length - 1);
    setDraftName(placeholder);
    setError(null);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function confirmRemove(name: string) {
    const remaining = categories.filter((c) => c !== name);
    onChange(remaining, undefined, name);
    setRemoveTarget(null);
  }

  if (categories.length === 0 && editingIndex === null) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
        <div className="text-xs text-gray-500 mb-2">
          Group your services so customers can browse them.
        </div>
        <button
          type="button"
          onClick={add}
          className="text-sm bg-[var(--admin-primary)] text-white font-medium px-3 py-1.5 rounded-lg"
        >
          + Add category
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Categories
        </span>
        <button
          type="button"
          onClick={add}
          disabled={categories.length >= MAX_ENTRIES}
          className="text-xs bg-[var(--admin-primary)] text-white font-medium px-2 py-1 rounded disabled:opacity-50"
        >
          + Add
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((name, i) => {
          const isEditing = editingIndex === i;
          const count = counts[name] ?? 0;
          return (
            <div
              key={`${name}-${i}`}
              className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full pl-3 pr-1 py-1 text-xs"
            >
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitRename(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(i);
                    if (e.key === "Escape") {
                      setEditingIndex(null);
                      setError(null);
                    }
                  }}
                  maxLength={MAX_LENGTH}
                  className="bg-white border border-gray-300 rounded px-1 py-0.5 text-xs w-32"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingIndex(i);
                    setDraftName(name);
                    setError(null);
                  }}
                  className="font-medium hover:underline"
                >
                  {name}
                </button>
              )}
              <span className="text-gray-500">({count})</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-gray-500 disabled:opacity-30 px-1">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === categories.length - 1} aria-label="Move down" className="text-gray-500 disabled:opacity-30 px-1">↓</button>
              <button
                type="button"
                onClick={() => setRemoveTarget(name)}
                aria-label="Remove"
                className="text-gray-500 hover:text-red-600 px-1"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {removeTarget && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs flex items-center gap-2">
          <span className="flex-1">
            Remove "<strong>{removeTarget}</strong>"?
            {(counts[removeTarget] ?? 0) > 0 && (
              <> {counts[removeTarget]} {counts[removeTarget] === 1 ? "service" : "services"} will become uncategorized.</>
            )}
          </span>
          <button type="button" onClick={() => confirmRemove(removeTarget)} className="text-red-600 font-medium underline">Confirm</button>
          <button type="button" onClick={() => setRemoveTarget(null)} className="text-gray-500 underline">Cancel</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/site/[slug]/admin/services/CategoriesPanel.tsx
git commit -m "feat(admin/services): categories panel with rename/reorder/remove + cascade hooks"
```

---

## Task 6: Wire categories panel + client_id normalization into ServicesClient

**Files:**
- Modify: `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx:1-188`

- [ ] **Step 1: Update ServicesClient to manage categories state and normalize client_id**

Replace the entire contents of `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { ServiceRow } from "../_components/ServiceRow";
import { CategoriesPanel } from "./CategoriesPanel";

const MAX_NAME = 80;
const MAX_PRICE = 30;
const MAX_DESCRIPTION = 1000;

function normalizeService(s: ServiceItem): ServiceItem {
  return {
    ...s,
    name: s.name.length > MAX_NAME ? s.name.slice(0, MAX_NAME) : s.name,
    price: s.price.length > MAX_PRICE ? s.price.slice(0, MAX_PRICE) : s.price,
    description:
      s.description && s.description.length > MAX_DESCRIPTION
        ? s.description.slice(0, MAX_DESCRIPTION)
        : s.description,
    // Lazy backfill — assign a stable client_id to any service that doesn't
    // have one yet, so React keys survive renames.
    client_id: s.client_id ?? crypto.randomUUID(),
  };
}

interface ServicesClientProps {
  initialServices: ServiceItem[];
  initialCategories: string[];
}

export function ServicesClient({ initialServices, initialCategories }: ServicesClientProps) {
  const truncatedIndexes = new Set<number>();
  initialServices.forEach((s, i) => {
    if (
      s.name.length > MAX_NAME ||
      s.price.length > MAX_PRICE ||
      (s.description && s.description.length > MAX_DESCRIPTION)
    ) {
      truncatedIndexes.add(i);
    }
  });
  const normalizedInitial = initialServices.map(normalizeService);

  const [services, setServices] = useState<ServiceItem[]>(normalizedInitial);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failingIndexes, setFailingIndexes] = useState<Set<number>>(new Set());
  const [showTruncatedNotice, setShowTruncatedNotice] = useState(truncatedIndexes.size > 0);

  const initialJson = JSON.stringify({ services: normalizedInitial, categories: initialCategories });
  const dirty = JSON.stringify({ services, categories }) !== initialJson;

  // Per-category service counts for the categories panel.
  const counts = useMemo(() => {
    const out: Record<string, number> = { Other: 0 };
    services.forEach((s) => {
      if (s.category && categories.includes(s.category)) {
        out[s.category] = (out[s.category] ?? 0) + 1;
      } else {
        out.Other += 1;
      }
    });
    return out;
  }, [services, categories]);

  function update(index: number, next: ServiceItem) {
    setServices((prev) => prev.map((s, i) => (i === index ? next : s)));
    setSavedAt(null);
    if (failingIndexes.has(index)) {
      const nextSet = new Set(failingIndexes);
      nextSet.delete(index);
      setFailingIndexes(nextSet);
    }
  }

  function remove(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
    setSavedAt(null);
    setFailingIndexes(new Set());
  }

  function add() {
    setServices((prev) => [
      ...prev,
      { name: "", price: "", duration_minutes: 60, client_id: crypto.randomUUID() },
    ]);
    setSavedAt(null);
  }

  // Categories panel callback — handles rename cascade and remove cascade
  // entirely client-side so the server only sees a single coherent payload.
  function handleCategoriesChange(
    next: string[],
    rename?: { from: string; to: string },
    removed?: string,
  ) {
    setCategories(next);
    if (rename) {
      setServices((prev) =>
        prev.map((s) => (s.category === rename.from ? { ...s, category: rename.to } : s)),
      );
    }
    if (removed) {
      setServices((prev) =>
        prev.map((s) => (s.category === removed ? { ...s, category: undefined } : s)),
      );
    }
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services, categories }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errs = (data?.errors as Array<{ index: number; field: string; reason: string }> | undefined) ?? [];
        if (errs.length > 0) {
          const lines = errs.slice(0, 3).map((e) => {
            const rowLabel =
              e.index >= 0 && services[e.index]?.name
                ? `Row ${e.index + 1} (${services[e.index].name})`
                : e.index >= 0
                  ? `Row ${e.index + 1}`
                  : `Categories`;
            return `${rowLabel}: ${e.field} — ${e.reason}`;
          });
          if (errs.length > 3) lines.push(`…and ${errs.length - 3} more`);
          setError(lines.join("\n"));
          setFailingIndexes(new Set(errs.map((e) => e.index).filter((i) => i >= 0)));
        } else {
          setError(data?.error || "Save failed");
          setFailingIndexes(new Set());
        }
        return;
      }
      setSavedAt(Date.now());
      setFailingIndexes(new Set());
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pb-24">
      {showTruncatedNotice && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
          <span aria-hidden>ℹ️</span>
          <div className="flex-1">
            <span className="font-semibold">{truncatedIndexes.size} {truncatedIndexes.size === 1 ? "service was" : "services were"} shortened</span> to fit current limits (name ≤ {MAX_NAME}, price ≤ {MAX_PRICE}, description ≤ {MAX_DESCRIPTION} chars). Review the rows below before saving — you can edit them now.
          </div>
          <button type="button" onClick={() => setShowTruncatedNotice(false)} className="text-amber-700 hover:text-amber-900" aria-label="Dismiss">×</button>
        </div>
      )}

      <CategoriesPanel
        categories={categories}
        counts={counts}
        onChange={handleCategoriesChange}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{services.length} {services.length === 1 ? "service" : "services"}</span>
        <button
          type="button"
          onClick={add}
          className="text-sm bg-[var(--admin-primary)] text-white font-medium px-3 py-1.5 rounded-lg"
        >
          + Add service
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
          No services yet. Add your first service to start taking bookings.
        </div>
      ) : (
        services.map((s, i) => (
          <ServiceRow
            key={s.client_id ?? i}
            rowNumber={i + 1}
            service={s}
            failing={failingIndexes.has(i)}
            onChange={(next) => update(i, next)}
            onDelete={() => remove(i)}
          />
        ))
      )}

      <div className="fixed bottom-16 md:bottom-4 inset-x-0 px-4 md:px-8 pointer-events-none">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-3 pointer-events-auto">
          {error && (
            <span className="text-xs text-red-600 whitespace-pre-line max-w-md text-right">
              {error}
            </span>
          )}
          {savedAt && !dirty && <span className="text-xs text-green-700">✓ Saved</span>}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg shadow-md disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the page server component to pass `initialCategories`**

Find the page component that loads `initialServices` and renders `<ServicesClient>`. Run:
```bash
cd siteforowners && grep -rln "ServicesClient" src/app/site/\[slug\]/admin
```

The page is `src/app/site/[slug]/admin/services/page.tsx`. Open it and locate where `initialServices` is loaded from `previews`. Update the select to include `categories`, and pass `initialCategories={...}` to `<ServicesClient>`.

Concretely, find the Supabase query like `.select("services")` and change to `.select("services, categories")`. Then change `<ServicesClient initialServices={services} />` to:

```tsx
<ServicesClient
  initialServices={services}
  initialCategories={(categories as string[] | null) ?? []}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors. The ServiceRow call site does NOT pass `categories` yet — that prop lands in Task 7 alongside the dropdown/add-ons UI. Until then, the categories list is managed at the ServicesClient level (panel + cascade) without per-row dropdowns.

- [ ] **Step 4: Manual smoke test the categories panel**

Start dev server. Open `/site/<slug>/admin/services`. Verify:
- Categories panel shows "+ Add category" when empty
- Adding categories → chips render with counts (initially "(0)" since no service references them yet)
- Renaming a category — pure rename works (no services to cascade yet)
- Removing a category — confirmation appears

Save and refresh. Categories persist (round-trip through API + JSONB).

- [ ] **Step 5: Commit**

```bash
git add src/app/site/[slug]/admin/services/ServicesClient.tsx src/app/site/[slug]/admin/services/CategoriesPanel.tsx src/app/site/[slug]/admin/services/page.tsx
git commit -m "feat(admin/services): wire categories panel + client_id normalization into ServicesClient"
```

---

## Task 7: ServiceRow — category dropdown + add-ons editor

**Files:**
- Modify: `siteforowners/src/app/site/[slug]/admin/_components/ServiceRow.tsx:1-191`
- Modify: `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx` (add `categories={categories}` prop on the ServiceRow call site)
- Modify: `siteforowners/src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` (also add `categories={categories}` prop and load `previews.categories` if not already loaded)

- [ ] **Step 1: Update ServiceRow to render category dropdown and add-ons editor**

Replace the entire contents of `siteforowners/src/app/site/[slug]/admin/_components/ServiceRow.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ServiceItem, AddOn } from "@/lib/ai/types";
import { formatDuration } from "@/lib/availability";

interface ServiceRowProps {
  rowNumber?: number;
  service: ServiceItem;
  /** Owner-managed list; passed so the dropdown can render options. */
  categories?: string[];
  founderTenantId?: string;
  failing?: boolean;
  onChange: (next: ServiceItem) => void;
  onDelete: () => void;
}

const ADD_ON_DURATION_OPTIONS = [0, 30, 60, 90, 120];
const MAX_ADD_ONS = 5;

export function ServiceRow({
  rowNumber,
  service,
  categories = [],
  founderTenantId,
  failing = false,
  onChange,
  onDelete,
}: ServiceRowProps) {
  const [expanded, setExpanded] = useState(!service.name || failing);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (failing) {
      setExpanded(true);
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [failing]);

  const duration = service.duration_minutes ?? 60;
  const addOns: AddOn[] = service.add_ons ?? [];

  function set<K extends keyof ServiceItem>(key: K, value: ServiceItem[K]) {
    onChange({ ...service, [key]: value });
  }

  function setAddOn(index: number, next: AddOn) {
    const updated = addOns.map((a, i) => (i === index ? next : a));
    onChange({ ...service, add_ons: updated });
  }

  function removeAddOn(index: number) {
    const updated = addOns.filter((_, i) => i !== index);
    onChange({ ...service, add_ons: updated.length > 0 ? updated : undefined });
  }

  function addAddOn() {
    if (addOns.length >= MAX_ADD_ONS) return;
    const updated = [...addOns, { name: "", price_delta: 0, duration_delta_minutes: 0 }];
    onChange({ ...service, add_ons: updated });
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (founderTenantId) fd.append("tenant_id", founderTenantId);
      const res = await fetch("/api/admin/services/upload-image", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Upload failed");
        return;
      }
      const data = (await res.json()) as { url: string };
      set("image", data.url);
    } catch {
      alert("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!expanded) {
    return (
      <button
        ref={containerRef as unknown as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={() => setExpanded(true)}
        className={`w-full bg-white border rounded-lg px-3 py-3 flex items-center gap-3 text-left transition-colors ${
          failing ? "border-red-500 ring-2 ring-red-200" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {service.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.image} alt="" className="h-12 w-12 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-md bg-gray-100 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {rowNumber !== undefined && (
              <span className="text-gray-400 font-normal mr-1">{rowNumber}.</span>
            )}
            {service.name || "(untitled)"}
          </div>
          <div className="text-xs text-gray-500">
            {formatDuration(duration)} · {service.price || "—"}
            {service.category && <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--admin-primary)]">{service.category}</span>}
          </div>
        </div>
        <span className="text-gray-400">›</span>
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`bg-white border rounded-lg p-3 space-y-3 ${
        failing ? "border-red-500 ring-2 ring-red-200" : "border-[color:var(--admin-primary)]"
      }`}
    >
      {rowNumber !== undefined && (
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Row {rowNumber}
        </div>
      )}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-16 w-16 rounded-md flex items-center justify-center text-[10px] text-center flex-shrink-0 overflow-hidden border border-dashed border-gray-300 hover:border-gray-400"
          style={service.image ? { backgroundImage: `url(${service.image})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#f3e8ff", color: "var(--admin-primary)" }}
        >
          {!service.image && (uploading ? "Uploading…" : "+ Image")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImagePick}
        />

        <div className="flex-1 space-y-2 min-w-0">
          <input
            type="text"
            value={service.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Service name"
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
            maxLength={80}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={service.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="$0"
              className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm"
              maxLength={30}
            />
            <div className="flex items-center gap-1 rounded border border-gray-200 px-2">
              <button type="button" onClick={() => set("duration_minutes", Math.max(30, duration - 30))} aria-label="Decrease duration" className="px-1 text-gray-500">−</button>
              <span className="text-sm font-medium w-14 text-center tabular-nums">{formatDuration(duration)}</span>
              <button type="button" onClick={() => set("duration_minutes", Math.min(480, duration + 30))} aria-label="Increase duration" className="px-1 text-gray-500">+</button>
            </div>
          </div>

          {/* Category dropdown — only when categories are defined */}
          {categories.length > 0 ? (
            <select
              value={service.category ?? ""}
              onChange={(e) => set("category", e.target.value || undefined)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">(no category)</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <div className="text-[10px] text-gray-500 italic">
              Tip: add categories above to group services
            </div>
          )}
        </div>
      </div>

      <textarea
        value={service.description ?? ""}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Description (optional) — owners can write up to ~5 paragraphs"
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
        rows={4}
        maxLength={1000}
      />

      {/* Add-ons editor */}
      <div className="border-t border-gray-100 pt-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Add-ons {addOns.length > 0 && <span className="text-gray-400 font-normal">({addOns.length}/{MAX_ADD_ONS})</span>}
          </span>
          <button
            type="button"
            onClick={addAddOn}
            disabled={addOns.length >= MAX_ADD_ONS}
            className="text-xs text-[var(--admin-primary)] font-medium disabled:opacity-50"
          >
            + Add add-on
          </button>
        </div>
        {addOns.map((ao, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={ao.name}
              onChange={(e) => setAddOn(i, { ...ao, name: e.target.value })}
              placeholder="Add-on name"
              className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
              maxLength={80}
            />
            <select
              value={ao.duration_delta_minutes}
              onChange={(e) => setAddOn(i, { ...ao, duration_delta_minutes: Number(e.target.value) })}
              className="rounded border border-gray-200 px-1 py-1 text-xs bg-white"
            >
              {ADD_ON_DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>+{formatDuration(m) || "0m"}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={ao.price_delta}
              onChange={(e) => setAddOn(i, { ...ao, price_delta: Number(e.target.value) || 0 })}
              placeholder="0"
              className="w-20 rounded border border-gray-200 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => removeAddOn(i)}
              aria-label="Remove add-on"
              className="text-gray-400 hover:text-red-600 px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-600">Delete this service?</span>
            <button type="button" onClick={onDelete} className="text-red-600 font-medium underline">Confirm</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-gray-500 underline">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-red-600">Delete</button>
        )}
        <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-500">▾ Collapse</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass `categories` to ServiceRow from ServicesClient**

In `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx`, find the existing ServiceRow call site (added in Task 6) and add the new prop:

```tsx
<ServiceRow
  key={s.client_id ?? i}
  rowNumber={i + 1}
  service={s}
  categories={categories}
  failing={failingIndexes.has(i)}
  onChange={(next) => update(i, next)}
  onDelete={() => remove(i)}
/>
```

- [ ] **Step 3: Pass `categories` to ServiceRow from SiteEditor (founder admin)**

Run:
```bash
cd siteforowners && grep -nE "<ServiceRow" src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx
```

For each match, add `categories={categories}` (or whatever variable holds the loaded categories list). If SiteEditor doesn't yet load categories, locate the existing `.select("services...")` query and change to `.select("..., categories")`, then add a `categories` state field initialized from the loaded value.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Manual smoke test**

Start dev server. Navigate to `/site/<slug>/admin/services`. Verify:
- Categories panel renders (empty → "+ Add category" only; with categories → chip list with rename/move/remove)
- Adding a category appears in each ServiceRow's category dropdown
- Renaming a category cascades to services that use it (visible after row collapse-expand)
- Removing a category prompts confirmation, then nullifies `category` on referencing services
- Add-on editor accepts a name, duration option, and price; supports up to 5 rows; `×` removes a row
- Save persists everything to the database (refresh page; values restored)

Repeat the same flow in `/clients/<tenantId>/edit` (founder admin).

- [ ] **Step 6: Commit**

```bash
git add src/app/site/[slug]/admin/_components/ServiceRow.tsx src/app/site/[slug]/admin/services/ServicesClient.tsx
git add src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx
git commit -m "feat(admin/services): category dropdown + per-service add-ons editor in ServiceRow"
```

---

## Task 8: groupServices helper

**Files:**
- Create: `siteforowners/src/components/templates/services/groupServices.ts`
- Create: `siteforowners/src/components/templates/services/groupServices.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `siteforowners/src/components/templates/services/groupServices.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServiceItem } from "@/lib/ai/types";
import { groupServices } from "./groupServices";

const s = (name: string, category?: string): ServiceItem => ({ name, price: "$50", category });

test("groupServices: no categories → single null group", () => {
  const out = groupServices([s("a"), s("b")], undefined);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, null);
  assert.equal(out[0].services.length, 2);
});

test("groupServices: empty categories array → flat group", () => {
  const out = groupServices([s("a")], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, null);
});

test("groupServices: categorized services land in their group", () => {
  const out = groupServices(
    [s("a", "Braids"), s("b", "Touch ups"), s("c", "Braids")],
    ["Braids", "Touch ups"],
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].label, "Braids");
  assert.equal(out[0].services.length, 2);
  assert.equal(out[1].label, "Touch ups");
  assert.equal(out[1].services.length, 1);
});

test("groupServices: uncategorized services land in Other", () => {
  const out = groupServices([s("a", "Braids"), s("b")], ["Braids"]);
  assert.equal(out.length, 2);
  assert.equal(out[1].label, "Other");
  assert.equal(out[1].services.length, 1);
});

test("groupServices: stale category reference falls into Other", () => {
  const out = groupServices(
    [s("a", "Old"), s("b", "Braids")],
    ["Braids"],
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].label, "Braids");
  assert.equal(out[1].label, "Other");
  assert.equal(out[1].services[0].name, "a");
});

test("groupServices: empty categories produce no group entry", () => {
  const out = groupServices([s("a", "Braids")], ["Braids", "Touch ups"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "Braids");
});

test("groupServices: preserves category order", () => {
  const out = groupServices(
    [s("c", "C"), s("a", "A"), s("b", "B")],
    ["A", "B", "C"],
  );
  assert.deepEqual(out.map((g) => g.label), ["A", "B", "C"]);
});

test("groupServices: Other group is last", () => {
  const out = groupServices([s("a"), s("b", "Braids")], ["Braids"]);
  assert.deepEqual(out.map((g) => g.label), ["Braids", "Other"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd siteforowners && npx tsx --test src/components/templates/services/groupServices.test.ts
```
Expected: ALL FAIL with "Cannot find module './groupServices'".

- [ ] **Step 3: Implement the helper**

Create `siteforowners/src/components/templates/services/groupServices.ts`:

```ts
import type { ServiceItem } from "@/lib/ai/types";

export interface ServiceGroup {
  /** null when no categories are defined → render as flat list. */
  label: string | null;
  services: ServiceItem[];
}

/**
 * Group services by category. Pure: returns a fresh array; no mutation.
 *
 * Rules:
 *   - Empty/undefined categories → single group with label=null and all services.
 *   - Each category in `categories` becomes a group in the same order.
 *   - Services whose category is missing or no longer in `categories` go into "Other".
 *   - Empty groups are dropped (no header rendered for a category with zero services).
 */
export function groupServices(
  services: ServiceItem[],
  categories: string[] | undefined,
): ServiceGroup[] {
  if (!categories || categories.length === 0) {
    return [{ label: null, services }];
  }
  const allowed = new Set(categories);
  const groups: ServiceGroup[] = categories.map((label) => ({
    label,
    services: services.filter((s) => s.category === label),
  }));
  const uncategorized = services.filter(
    (s) => !s.category || !allowed.has(s.category),
  );
  if (uncategorized.length > 0) {
    groups.push({ label: "Other", services: uncategorized });
  }
  return groups.filter((g) => g.services.length > 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd siteforowners && npx tsx --test src/components/templates/services/groupServices.test.ts
```
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/components/templates/services/groupServices.ts src/components/templates/services/groupServices.test.ts
git commit -m "feat(templates/services): pure groupServices helper for category rendering"
```

---

## Task 9: Apply category grouping to all 5 service templates

**Files:**
- Modify: `siteforowners/src/components/templates/services/BoldServices.tsx`
- Modify: `siteforowners/src/components/templates/services/VibrantServices.tsx`
- Modify: `siteforowners/src/components/templates/services/ClassicServices.tsx`
- Modify: `siteforowners/src/components/templates/services/ElegantServices.tsx`
- Modify: `siteforowners/src/components/templates/services/WarmServices.tsx`

The pattern for each template is the same:
1. Add `categories?: string[]` to the props interface.
2. Replace the single `services.map(...)` with `groupServices(services, categories).map(group => ...)` rendering each group's header + service rows.
3. Each group label gets a collapse/expand chevron with `useState` (default: expanded).
4. Each template renders its header in its own aesthetic.

Each template gets its own commit. Below is the BoldServices implementation in full; the others follow the same shape with template-specific header styling.

### Step 1 (Bold): Update `BoldServices.tsx`

Find `siteforowners/src/components/templates/services/BoldServices.tsx`. Locate the `services.map((service, i) => { ... })` block. Wrap the rendering in groups:

```tsx
"use client";

import { useState } from "react";
import type { ThemeColors } from "@/lib/templates/themes";
import type { ServiceItem } from "@/lib/ai/types";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import { formatDuration } from "@/lib/availability";
import { groupServices } from "./groupServices";

type Mode = "in_site_only" | "external_only" | "both";

interface ServicesProps {
  services: ServiceItem[];
  categories?: string[];
  colors: ThemeColors;
  bookingMode?: Mode;
}

export function BoldServices({ services, categories, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  const groups = groupServices(services, categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(label: string) {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <section /* existing wrapper props */ >
      {/* ... existing header copy unchanged ... */}
      {groups.map((group) => {
        const isCollapsed = group.label ? !!collapsed[group.label] : false;
        return (
          <div key={group.label ?? "_flat"} className="mb-8">
            {group.label && (
              <button
                type="button"
                onClick={() => toggle(group.label!)}
                className="w-full flex items-center justify-between mb-4 pb-2 border-b-2"
                style={{ borderColor: colors.primary, color: rc.textOnBg }}
              >
                <span className="text-xs uppercase tracking-[0.2em] font-bold">
                  {group.label}
                </span>
                <span className="text-xs opacity-60" aria-hidden>
                  {isCollapsed ? "▸" : "▾"}
                </span>
              </button>
            )}
            {!isCollapsed && (
              <div className="space-y-4">
                {group.services.map((service, i) => {
                  /* paste the existing per-service render block here, unchanged */
                  /* (it references `service`, `i`, `bookingMode`, etc.) */
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
```

The "paste the existing per-service render block" placeholder means: copy the existing inner content of the original `services.map((service, i) => ...)` block exactly as-is (the AnimateSection wrapper and its bookingMode-driven render logic). Do not change behavior — just relocate it into the new group iteration.

Run from `siteforowners/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

Commit:
```bash
git add src/components/templates/services/BoldServices.tsx
git commit -m "feat(templates/services): category grouping with collapse in BoldServices"
```

### Step 2 (Vibrant): Update `VibrantServices.tsx`

Same structure as Bold, but the category header uses Vibrant's gradient-tinted aesthetic:

```tsx
{group.label && (
  <button
    type="button"
    onClick={() => toggle(group.label!)}
    className="w-full flex items-center justify-between mb-6"
  >
    <h3
      className="text-2xl md:text-3xl font-bold"
      style={{ background: `linear-gradient(90deg, ${colors.primary}, ${rc.textOnBg})`, WebkitBackgroundClip: "text", color: "transparent" }}
    >
      {group.label}
    </h3>
    <span className="text-sm opacity-60" style={{ color: rc.textOnBg }}>
      {isCollapsed ? "▸" : "▾"}
    </span>
  </button>
)}
```

Commit:
```bash
git add src/components/templates/services/VibrantServices.tsx
git commit -m "feat(templates/services): category grouping with collapse in VibrantServices"
```

### Step 3 (Classic): Update `ClassicServices.tsx`

Header aesthetic: serif italic with thin centered rule:

```tsx
{group.label && (
  <button type="button" onClick={() => toggle(group.label!)} className="w-full mb-5 flex items-center gap-3">
    <span className="flex-1 border-t border-current opacity-30" aria-hidden />
    <span className="font-serif italic text-base" style={{ color: rc.textOnBg }}>
      {group.label}
    </span>
    <span className="text-xs opacity-60" style={{ color: rc.textOnBg }}>
      {isCollapsed ? "▸" : "▾"}
    </span>
    <span className="flex-1 border-t border-current opacity-30" aria-hidden />
  </button>
)}
```

Commit:
```bash
git add src/components/templates/services/ClassicServices.tsx
git commit -m "feat(templates/services): category grouping with collapse in ClassicServices"
```

### Step 4 (Elegant): Update `ElegantServices.tsx`

Header aesthetic: ultra-thin uppercase, letterspaced:

```tsx
{group.label && (
  <button type="button" onClick={() => toggle(group.label!)} className="w-full flex items-center justify-between mb-6">
    <span
      className="text-[10px] uppercase font-light tracking-[0.4em]"
      style={{ color: rc.textOnBg }}
    >
      {group.label}
    </span>
    <span className="text-[10px] opacity-50" style={{ color: rc.textOnBg }}>
      {isCollapsed ? "+" : "−"}
    </span>
  </button>
)}
```

Commit:
```bash
git add src/components/templates/services/ElegantServices.tsx
git commit -m "feat(templates/services): category grouping with collapse in ElegantServices"
```

### Step 5 (Warm): Update `WarmServices.tsx`

Header aesthetic: small rounded pill label:

```tsx
{group.label && (
  <button type="button" onClick={() => toggle(group.label!)} className="mb-4 inline-flex items-center gap-2">
    <span
      className="rounded-full px-4 py-1 text-xs font-semibold"
      style={{ backgroundColor: colors.primary, color: rc.textOnPrimary }}
    >
      {group.label}
    </span>
    <span className="text-xs opacity-60" style={{ color: rc.textOnBg }}>
      {isCollapsed ? "▸" : "▾"}
    </span>
  </button>
)}
```

Commit:
```bash
git add src/components/templates/services/WarmServices.tsx
git commit -m "feat(templates/services): category grouping with collapse in WarmServices"
```

### Step 6: Pass `categories` from TemplateOrchestrator

`TemplateOrchestrator.tsx` selects which template to render. Find where it spreads `services`/`colors` props onto the chosen `<*Services>` and add `categories={previews.categories}` (or whatever variable holds the loaded preview). Run:

```bash
cd siteforowners && grep -nE "<(Bold|Vibrant|Classic|Elegant|Warm)Services" src/components/templates/TemplateOrchestrator.tsx
```

Add the `categories={...}` prop to each call. Commit:

```bash
git add src/components/templates/TemplateOrchestrator.tsx
git commit -m "feat(templates): pass categories through orchestrator to service templates"
```

### Step 7: Verify all 5 templates compile

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

---

## Task 10: Extract in-site booking flow to its own file (refactor only)

**Goal:** Lift `RealBookingCalendar` and its helpers (`MockBookingCalendar` if applicable) out of `TemplateBooking.tsx` into `CustomerBookingFlow.tsx`. **No behavior change** — this task is a pure move so the next task's diff stays readable.

**Files:**
- Create: `siteforowners/src/components/templates/CustomerBookingFlow.tsx`
- Modify: `siteforowners/src/components/templates/TemplateBooking.tsx`

- [ ] **Step 1: Identify the extraction boundary**

Run:
```bash
cd siteforowners && grep -nE "^function (Mock|Real)BookingCalendar" src/components/templates/TemplateBooking.tsx
```
Note the line ranges of `MockBookingCalendar` and `RealBookingCalendar` (~93-394 and ~395-733 today).

- [ ] **Step 2: Move `RealBookingCalendar` (and `MockBookingCalendar` if it's only used by Real) to `CustomerBookingFlow.tsx`**

Create `siteforowners/src/components/templates/CustomerBookingFlow.tsx`. Paste the full contents of both helper functions plus their TypeScript types (`SimpleService`, etc. — find with grep) and required imports. **Export `RealBookingCalendar` as `CustomerBookingFlow`** (rename the export). For example:

```tsx
"use client";
// ... copy all imports needed by the moved code ...
import { /* ... */ } from "framer-motion";
import { computeAvailableStarts, formatTimeRange, formatDuration } from "@/lib/availability";

// ... copy SimpleService type and any other types referenced ...

// (paste MockBookingCalendar function unchanged if it is referenced internally)

// Renamed: was `RealBookingCalendar` in TemplateBooking.tsx
export function CustomerBookingFlow(props: { /* same props as RealBookingCalendar */ }) {
  // ... pasted function body unchanged ...
}
```

- [ ] **Step 3: In `TemplateBooking.tsx`, delete the moved functions and import the new one**

```tsx
import { CustomerBookingFlow } from "./CustomerBookingFlow";
```

Replace each `<RealBookingCalendar ... />` JSX with `<CustomerBookingFlow ... />`.

If `MockBookingCalendar` is also referenced by something outside RealBookingCalendar (e.g. dev preview), keep that reference and re-export it. Otherwise remove it from `TemplateBooking.tsx`.

- [ ] **Step 4: Verify TypeScript compiles + the in-site booking still works**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

Start dev server. Navigate to a tenant in `in_site_only` mode. Click a service's "Book Now" — verify the calendar opens with the existing 5-step flow (service → date → time → info → confirm). No behavior change yet.

- [ ] **Step 5: Commit**

```bash
git add src/components/templates/CustomerBookingFlow.tsx src/components/templates/TemplateBooking.tsx
git commit -m "refactor(booking): extract in-site CustomerBookingFlow from TemplateBooking"
```

---

## Task 11: Refactor CustomerBookingFlow to 2-screen state machine

**Goal:** Replace the 5-step flow (`service → date → time → info → confirm`) with a 2-screen flow (`service? → details → schedule → confirm`). **No add-ons yet** — that lands in Task 12. This task only restructures the steps.

**Files:**
- Modify: `siteforowners/src/components/templates/CustomerBookingFlow.tsx`

- [ ] **Step 1: Update the state type and initial step**

Find:
```ts
const [step, setStep] = useState<"service" | "date" | "time" | "info" | "confirm">(
  initialService ? "date" : "service",
);
```

Replace with:
```ts
const [step, setStep] = useState<"service" | "details" | "schedule" | "confirm">(
  initialService ? "details" : "service",
);
```

- [ ] **Step 2: Merge `date` into `details`**

Find the `step === "date"` JSX block. Replace its `step === "date"` guard with `step === "details"`. Add a service-summary panel above the date picker:

```tsx
{step === "details" && (
  <div className="space-y-4">
    <ServiceDetailsPanel service={selectedService!} colors={colors} />
    {/* (Task 12 will mount AddOnsList here) */}
    <RunningTotalBar service={selectedService!} addOns={[]} colors={colors} />
    {/* existing date picker JSX, unchanged */}
    {/* "Continue →" CTA disabled until selectedDate is set */}
    <button
      type="button"
      disabled={!selectedDate}
      onClick={() => {
        fetchSlots(selectedDate!, selectedService);
        setStep("schedule");
      }}
      className="w-full py-3 rounded-lg font-semibold disabled:opacity-50"
      style={{ backgroundColor: colors.primary, color: "white" }}
    >
      Continue →
    </button>
  </div>
)}
```

Add `ServiceDetailsPanel` and `RunningTotalBar` as small in-file helpers:

```tsx
function ServiceDetailsPanel({ service, colors }: { service: SimpleService & { description?: string; image?: string }; colors: ThemeColors }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: `${colors.primary}10` }}>
      {service.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={service.image} alt="" className="h-16 w-16 rounded-md object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold truncate">{service.name}</h3>
          <span className="font-bold" style={{ color: colors.primary }}>{service.price}</span>
        </div>
        <div className="text-xs text-gray-500">Base · {formatDuration(service.durationMinutes ?? 60)}</div>
        {service.description && (
          <p className="text-xs text-gray-700 mt-1 leading-relaxed">{service.description}</p>
        )}
      </div>
    </div>
  );
}

function RunningTotalBar({ service, addOns, colors }: { service: SimpleService; addOns: AddOn[]; colors: ThemeColors }) {
  const baseDuration = service.durationMinutes ?? 60;
  const baseTotal = parseFloat(service.price.replace(/[^0-9.]/g, "")) || 0;
  const totalDuration = baseDuration + addOns.reduce((sum, a) => sum + a.duration_delta_minutes, 0);
  const totalPrice = baseTotal + addOns.reduce((sum, a) => sum + a.price_delta, 0);
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded bg-gray-50 border border-gray-200">
      <span className="text-xs text-gray-600">Total</span>
      <span className="font-bold">
        {formatDuration(totalDuration)} · <span style={{ color: colors.primary }}>${totalPrice.toFixed(2)}</span>
      </span>
    </div>
  );
}
```

`AddOn` is imported from `@/lib/ai/types`. The `service.price` parsing strips currency characters; if a tenant uses `"From $50"`, this produces 50 — acceptable for the visible total bar.

- [ ] **Step 3: Merge `time` and `info` into `schedule`**

Find the `step === "time"` and `step === "info"` JSX blocks. Replace both with a single `step === "schedule"` block that renders:
1. Compact summary header with `← Back` link (sets step to `"details"`)
2. Time slot grid (existing JSX from `step === "time"`)
3. Contact form (existing JSX from `step === "info"`)
4. "Confirm booking" CTA (existing handler `handleBook`)

```tsx
{step === "schedule" && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => setStep("details")}
        className="text-xs font-semibold"
        style={{ color: colors.primary }}
      >
        ← Back
      </button>
      <span className="text-xs text-gray-500">
        {selectedService?.name} · {selectedDate?.toLocaleDateString()}
      </span>
    </div>

    <RunningTotalBar service={selectedService!} addOns={[]} colors={colors} />

    {/* paste the existing time slots grid JSX from old step="time" */}
    {/* paste the existing contact form JSX from old step="info" */}

    <button
      type="button"
      disabled={submitting || !selectedTime || !customerName.trim() || !customerPhone.trim()}
      onClick={handleBook}
      className="w-full py-3 rounded-lg font-semibold disabled:opacity-50"
      style={{ backgroundColor: colors.primary, color: "white" }}
    >
      {submitting ? "Booking..." : "Confirm booking"}
    </button>
  </div>
)}
```

If the previous `info` step had a separate "Back to time" button, remove it — the new `← Back` returns all the way to details.

- [ ] **Step 4: Update step header / progress text**

Find any "Step 1 of 5" / step indicator text. Replace with `"Step 1 of 2 — Details"` (when `step === "details"`) or `"Step 2 of 2 — Time"` (when `step === "schedule"`).

If the existing UI doesn't show a step indicator, add a small one near the header:

```tsx
{step === "details" && <div className="text-xs text-gray-500 mb-2">Step 1 of 2 — Details</div>}
{step === "schedule" && <div className="text-xs text-gray-500 mb-2">Step 2 of 2 — Time</div>}
```

- [ ] **Step 5: Service-picking step (`step === "service"`)**

This step renders only when `initialService` is null. Keep its existing JSX. When the customer picks a service, transition to `"details"` instead of `"date"`. Find:
```ts
setSelectedService(svc);
setStep("date");
```
Replace with:
```ts
setSelectedService(svc);
setStep("details");
```

- [ ] **Step 6: Verify TypeScript compiles + manual smoke test**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

Start dev server. Test both entry paths:
1. Click "Book Now" main CTA → service picker → pick → details (with date picker) → schedule (time + contact) → confirm.
2. Click a per-service "Book" → details (with date picker) → schedule → confirm.

`← Back` from schedule returns to details with date and contact preserved.

- [ ] **Step 7: Commit**

```bash
git add src/components/templates/CustomerBookingFlow.tsx
git commit -m "feat(booking): collapse 5-step flow into 2-screen details/schedule flow"
```

---

## Task 12: Wire add-ons into CustomerBookingFlow

**Files:**
- Modify: `siteforowners/src/components/templates/CustomerBookingFlow.tsx`

- [ ] **Step 1: Extend `SimpleService` type and props to include add-ons**

Find the `SimpleService` interface in `CustomerBookingFlow.tsx`. Extend:

```ts
import type { AddOn } from "@/lib/ai/types";

interface SimpleService {
  name: string;
  price: string;
  durationMinutes?: number;
  description?: string;
  image?: string;
  addOns?: AddOn[];   // NEW
}
```

Also update the prop pass-through in `TemplateBooking.tsx` so the addOns make it through:

```bash
cd siteforowners && grep -n "services?:" src/components/templates/TemplateBooking.tsx
```

Locate the `SimpleService` interface in `TemplateBooking.tsx` (line 30) and add `addOns?: AddOn[]; description?: string; image?: string;` similarly. Update the place where `TemplateOrchestrator` builds the `services` array passed to `<TemplateBooking>` to include `addOns: s.add_ons`, `description: s.description`, `image: s.image`.

- [ ] **Step 2: Add `selectedAddOns` state**

Inside `CustomerBookingFlow`, near the other useState calls, add:

```ts
const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
```

When `selectedService` changes (on first pick), reset selectedAddOns:

```ts
useEffect(() => {
  setSelectedAddOns([]);
}, [selectedService]);
```

- [ ] **Step 3: Render the add-ons checkbox list on the details screen**

Inside the `step === "details"` block, after `ServiceDetailsPanel` and before `RunningTotalBar`, add:

```tsx
{(selectedService?.addOns?.length ?? 0) > 0 && (
  <div className="space-y-2">
    <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
      Add-ons (optional)
    </div>
    {selectedService!.addOns!.map((ao, i) => {
      const checked = selectedAddOns.some((a) => a.name === ao.name);
      return (
        <label
          key={ao.name + i}
          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer text-sm ${
            checked ? "bg-[var(--admin-primary,#9b1c4a)]/10 border-[var(--admin-primary,#9b1c4a)]/40" : "bg-white border-gray-200"
          }`}
        >
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                setSelectedAddOns((prev) =>
                  checked ? prev.filter((a) => a.name !== ao.name) : [...prev, ao],
                );
              }}
              className="accent-[var(--admin-primary,#9b1c4a)]"
            />
            <span className="font-medium">{ao.name}</span>
          </span>
          <span className="text-xs text-gray-500">
            +{formatDuration(ao.duration_delta_minutes) || "0m"} · +${ao.price_delta.toFixed(2)}
          </span>
        </label>
      );
    })}
  </div>
)}
```

- [ ] **Step 4: Pass selectedAddOns through to RunningTotalBar**

Replace both `<RunningTotalBar ... addOns={[]} />` calls with `addOns={selectedAddOns}`.

- [ ] **Step 5: Pass total duration when fetching slots**

Find `fetchSlots`:
```ts
const dur = service?.durationMinutes ?? 60;
```
Replace with:
```ts
const baseDur = service?.durationMinutes ?? 60;
const addOnDur = selectedAddOns.reduce((sum, a) => sum + a.duration_delta_minutes, 0);
const dur = baseDur + addOnDur;
```

- [ ] **Step 6: Re-fetch slots when add-ons change after returning to schedule**

Add an effect that re-fetches slots if the user returns to `schedule` after toggling add-ons:

```ts
useEffect(() => {
  if (step !== "schedule" || !selectedDate) return;
  fetchSlots(selectedDate, selectedService);
}, [step, selectedAddOns]);
```

If a previously-selected slot is no longer in the refreshed list, deselect it:

```ts
useEffect(() => {
  if (selectedTime && !availableSlots.includes(selectedTime)) {
    setSelectedTime(null);
  }
}, [availableSlots, selectedTime]);
```

- [ ] **Step 7: Send add-ons to the booking API**

Find `handleBook`. In the `JSON.stringify(...)` payload, add:

```ts
duration_minutes: (selectedService.durationMinutes ?? 60) + selectedAddOns.reduce((sum, a) => sum + a.duration_delta_minutes, 0),
selected_add_ons: selectedAddOns.length > 0 ? selectedAddOns : undefined,
add_ons_total_price: selectedAddOns.length > 0
  ? selectedAddOns.reduce((sum, a) => sum + a.price_delta, 0)
  : undefined,
```

(Replace any existing `duration_minutes:` line with the one above so the total is sent, not the base.)

- [ ] **Step 8: Verify TypeScript compiles + manual smoke test**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

Test:
1. Service with no add-ons → details shows no add-ons section, total = base.
2. Service with 2 add-ons → checkboxes render; toggling updates total live.
3. Click Continue → schedule screen shows time grid filtered by total duration.
4. Hit ← Back, deselect an add-on, hit Continue → schedule shows expanded grid (more slots available).
5. Confirm booking → check the network request payload includes `selected_add_ons` and the inflated `duration_minutes`.

- [ ] **Step 9: Commit**

```bash
git add src/components/templates/CustomerBookingFlow.tsx src/components/templates/TemplateBooking.tsx src/components/templates/TemplateOrchestrator.tsx
git commit -m "feat(booking): add-ons selection on details screen + total duration in slot fetch"
```

---

## Task 13: Migration — selected_add_ons + add_ons_total_price columns

**Files:**
- Create: `siteforowners/supabase/migrations/018_add_booking_addons.sql`

- [ ] **Step 1: Write the migration**

Create `siteforowners/supabase/migrations/018_add_booking_addons.sql`:

```sql
-- Spec 4 (booking polish): persist customer-selected add-ons on each booking
-- so SMS templates and admin schedule can render them.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS selected_add_ons jsonb,
  ADD COLUMN IF NOT EXISTS add_ons_total_price numeric(10, 2);

-- Comment: shape of selected_add_ons matches the AddOn TS type:
-- [{ name: text, price_delta: number, duration_delta_minutes: integer }]
COMMENT ON COLUMN bookings.selected_add_ons IS
  'Spec 4: snapshot of customer-selected add-ons at booking time. Schema:
   [{name: text, price_delta: number, duration_delta_minutes: integer}].
   Snapshotted (not joined) so deletes/edits to the service do not orphan
   historical bookings.';

COMMENT ON COLUMN bookings.add_ons_total_price IS
  'Spec 4: sum of price_delta across selected_add_ons at booking time.
   Stored separately so SMS/schedule rendering does not need to walk
   the JSONB array.';
```

- [ ] **Step 2: Apply locally**

If using local Supabase:
```bash
cd siteforowners && supabase db push
```

Or, if applying through the dashboard, copy the SQL into a new migration there. Either way, verify via psql:
```sql
\d bookings
```
Expected: `selected_add_ons` and `add_ons_total_price` columns appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_add_booking_addons.sql
git commit -m "feat(db): add selected_add_ons + add_ons_total_price to bookings (Spec 4)"
```

---

## Task 14: Persist add-ons in the create-booking API

**Files:**
- Modify: `siteforowners/src/app/api/create-booking/route.ts:14-205`

- [ ] **Step 1: Accept and validate `selected_add_ons` and `add_ons_total_price`**

Open `siteforowners/src/app/api/create-booking/route.ts`. After the existing destructuring of body fields (line 18-30), add:

```ts
const {
  // ... existing fields ...
  selected_add_ons,
  add_ons_total_price,
} = body;
```

Below the existing `durationMinutes` validation block (line 36-42), add:

```ts
import { validateAddOns } from "@/lib/validation/add-ons"; // add at top of file

let validatedAddOns: AddOn[] | null = null;
let validatedAddOnsPrice: number | null = null;
if (selected_add_ons !== undefined && selected_add_ons !== null) {
  const aoResult = validateAddOns(selected_add_ons);
  if (!aoResult.ok) {
    return NextResponse.json(
      { error: "Invalid selected_add_ons", errors: aoResult.errors },
      { status: 400 },
    );
  }
  validatedAddOns = aoResult.value.length > 0 ? aoResult.value : null;
  if (validatedAddOns) {
    const sumDuration = validatedAddOns.reduce((s, a) => s + a.duration_delta_minutes, 0);
    // Sanity: client-supplied duration_minutes must equal base + add-ons sum.
    // We don't have base here, but we can reject if duration < add-ons sum.
    if (durationMinutes < sumDuration) {
      return NextResponse.json(
        { error: "duration_minutes is less than the sum of selected add-on durations" },
        { status: 400 },
      );
    }
    if (typeof add_ons_total_price === "number" && Number.isFinite(add_ons_total_price) && add_ons_total_price >= 0) {
      validatedAddOnsPrice = Number(add_ons_total_price.toFixed(2));
    } else {
      validatedAddOnsPrice = Number(
        validatedAddOns.reduce((s, a) => s + a.price_delta, 0).toFixed(2),
      );
    }
  }
}
```

Add the import for `AddOn`:

```ts
import type { AddOn } from "@/lib/ai/types";
```

- [ ] **Step 2: Persist the new columns on insert**

In the `supabase.from("bookings").insert({ ... })` block (around line 105), add:

```ts
selected_add_ons: validatedAddOns,
add_ons_total_price: validatedAddOnsPrice,
```

The full insert object should look like:

```ts
.insert({
  tenant_id: tenantId || null,
  preview_slug,
  service_name,
  service_price: service_price || null,
  duration_minutes: durationMinutes,
  booking_date,
  booking_time,
  customer_name,
  customer_phone,
  customer_email: customer_email || null,
  customer_notes: customer_notes || null,
  customer_sms_opt_in: smsOptIn,
  selected_add_ons: validatedAddOns,
  add_ons_total_price: validatedAddOnsPrice,
})
```

- [ ] **Step 3: Pass add-ons names into the SMS data**

Find the `BookingSmsData` build (around line 175):

```ts
const smsData: BookingSmsData = {
  businessName,
  serviceName: service_name,
  date: dateStr,
  time: formatTimeRange(booking_time, durationMinutes),
  customerName: customer_name,
  customerPhone: customer_phone,
  businessAddress: businessAddress || undefined,
};
```

Add a new field for add-ons. Update the type in Task 15. For now, write:

```ts
const smsData: BookingSmsData = {
  businessName,
  serviceName: service_name,
  date: dateStr,
  time: formatTimeRange(booking_time, durationMinutes),
  customerName: customer_name,
  customerPhone: customer_phone,
  businessAddress: businessAddress || undefined,
  addOnNames: validatedAddOns?.map((a) => a.name) ?? [],
};
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 1 error in `sms.ts` because `addOnNames` isn't on `BookingSmsData` yet — that's Task 15's fix. Defer this until then or add the field to `BookingSmsData` now (see Task 15 Step 1).

- [ ] **Step 5: Commit (after Task 15 lands so types compile cleanly)**

For now, leave changes uncommitted. Commit alongside Task 15 to keep the type extension and consumer in one commit.

---

## Task 15: SMS templates — list add-ons in the owner notification

**Files:**
- Modify: `siteforowners/src/lib/sms.ts:63-101`
- Modify: `siteforowners/src/lib/sms.test.ts`

- [ ] **Step 1: Extend `BookingSmsData` and the owner notification template**

Open `siteforowners/src/lib/sms.ts`. Find `interface BookingSmsData` (line 63) and add:

```ts
export interface BookingSmsData {
  businessName: string;
  serviceName: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  businessAddress?: string;
  /** Spec 4: optional add-on names selected at booking time. */
  addOnNames?: string[];
}
```

Find `sendBookingOwnerNotification` (line 87). Replace with:

```ts
export async function sendBookingOwnerNotification(ownerPhone: string, b: BookingSmsData): Promise<void> {
  if (!ownerPhone) return;
  const addOns = b.addOnNames && b.addOnNames.length > 0
    ? ` (+ ${b.addOnNames.join(", ")})`
    : "";
  await send(
    ownerPhone,
    `🔔 New booking: ${b.customerName}, ${b.serviceName}${addOns}, ${b.date} @ ${b.time}.`,
  );
}
```

- [ ] **Step 2: Add a test for the new SMS body**

Open `siteforowners/src/lib/sms.test.ts`. Find an existing test for `sendBookingOwnerNotification` (or any test that imports the module). Add:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

// Helper: build the same template inline so we can assert against it without
// hitting Twilio. Mirror sendBookingOwnerNotification's body exactly.
function ownerBody(b: { customerName: string; serviceName: string; date: string; time: string; addOnNames?: string[] }) {
  const addOns = b.addOnNames && b.addOnNames.length > 0
    ? ` (+ ${b.addOnNames.join(", ")})`
    : "";
  return `🔔 New booking: ${b.customerName}, ${b.serviceName}${addOns}, ${b.date} @ ${b.time}.`;
}

test("sms owner template: no add-ons → no parenthetical", () => {
  const body = ownerBody({
    customerName: "Mariam",
    serviceName: "Knotless Braids",
    date: "Sat May 2",
    time: "10:00 AM – 3:00 PM",
  });
  assert.equal(body, "🔔 New booking: Mariam, Knotless Braids, Sat May 2 @ 10:00 AM – 3:00 PM.");
});

test("sms owner template: with add-ons → comma-separated parenthetical", () => {
  const body = ownerBody({
    customerName: "Mariam",
    serviceName: "Knotless Braids",
    date: "Sat May 2",
    time: "10:00 AM – 3:30 PM",
    addOnNames: ["Hair Wash", "Deep Conditioning"],
  });
  assert.equal(
    body,
    "🔔 New booking: Mariam, Knotless Braids (+ Hair Wash, Deep Conditioning), Sat May 2 @ 10:00 AM – 3:30 PM.",
  );
});
```

- [ ] **Step 3: Run the SMS tests**

```bash
cd siteforowners && npx tsx --test src/lib/sms.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Verify TypeScript compiles for the whole repo**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors (now that BookingSmsData has `addOnNames`, Task 14's call site type-checks).

- [ ] **Step 5: Commit Task 14 + Task 15 changes together**

```bash
git add src/lib/sms.ts src/lib/sms.test.ts src/app/api/create-booking/route.ts
git commit -m "feat(booking+sms): persist selected_add_ons; list add-ons in owner SMS"
```

---

## Final verification

- [ ] **Run all unit tests**

```bash
cd siteforowners && find src -name "*.test.ts" -exec npx tsx --test {} +
```
Expected: all tests pass.

- [ ] **TypeScript clean**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Lint**

```bash
cd siteforowners && npm run lint
```
Expected: no errors. Warnings on existing files are fine; do not fix unrelated warnings.

- [ ] **Manual end-to-end smoke test**

Per the spec's E2E section:

1. Owner adds 3 categories ("Knotless Braids", "Touch ups", "Natural Styles"), assigns services, renames "Knotless Braids" → "Knotless" and confirms it cascades on the public site.
2. Owner adds 2 add-ons to a service ("Hair Wash" +30min/+$25, "Deep Conditioning" +60min/+$40). Saves.
3. Customer opens public site → service list shows category headers in the template's aesthetic. Customer collapses a category, expands it back.
4. Customer opens booking modal on the service with add-ons → Screen 1 shows add-ons checkbox list. Selects both → total updates to base + 90min and base + $65.
5. Customer picks a date → Continue → Screen 2 shows time slot grid filtered by 90 + base duration. Some late-day slots removed compared to base-only.
6. Customer hits ← Back, deselects an add-on, Continues → grid expands.
7. Customer fills contact form, Confirm booking.
8. Owner receives SMS: "🔔 New booking: <Name>, <Service> (+ Hair Wash, Deep Conditioning), <Date> @ <Time>."
9. Owner views the admin schedule — booking block reflects the total duration, not the base.
10. In Supabase, `bookings.selected_add_ons` contains the JSON array; `bookings.add_ons_total_price` holds the sum.
