# Deposit Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional per-tenant deposit flow. New deposit-required bookings start as `pending` with prominent payment instructions; owner manually marks paid → `confirmed`. Customer notified at every transition.

**Architecture:** Four columns added to `booking_settings` (deposit toggle/mode/value/instructions), one column added to `bookings` (`deposit_amount` snapshot). The `status` text column gains a new conventional value `'pending'` — no schema constraint to update. New `DepositEditor` component on the Services admin page. New `PendingPaymentsList` inline within Schedule. Customer booking flow gets an amber deposit panel on Step 2 and a `pending` variant of the post-submit confirmation screen. Three new SMS + email templates reuse the existing notification pipeline.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Tailwind, Supabase (Postgres + Storage), Twilio SDK v6, Resend + React Email, `node:test` + `tsx` for unit tests.

**Spec reference:** [`docs/superpowers/specs/2026-04-28-deposit-flow-design.md`](../specs/2026-04-28-deposit-flow-design.md)

---

## File structure

### New files

| File | Responsibility |
|---|---|
| `siteforowners/supabase/migrations/021_add_deposit_settings.sql` | Schema migration (4 columns on booking_settings + deposit_amount on bookings) |
| `siteforowners/src/lib/deposit.ts` | Pure helpers: `parseServicePrice(s)` and `computeDeposit(settings, basePrice, addOnTotal)` |
| `siteforowners/src/lib/deposit.test.ts` | Unit tests for the helpers |
| `siteforowners/src/lib/validation/deposit-settings.ts` | Pure validator for the four deposit fields |
| `siteforowners/src/lib/validation/deposit-settings.test.ts` | Unit tests |
| `siteforowners/src/app/site/[slug]/admin/services/DepositEditor.tsx` | Owner-side deposit configuration UI |
| `siteforowners/src/app/site/[slug]/admin/schedule/_components/PendingPaymentsList.tsx` | Pending-payments pill + expanded list (mounted inside ScheduleClient) |

### Modified files

| File | Why |
|---|---|
| `siteforowners/src/lib/sms.ts` | Extend `BookingSmsData` with `depositAmount`, `depositInstructions`; three new sender functions |
| `siteforowners/src/lib/email.ts` | Three new email sender functions for the three notification triggers |
| `siteforowners/src/app/api/admin/services/route.ts` | Read + persist deposit settings alongside services + categories + booking_policies |
| `siteforowners/src/app/api/update-site/route.ts` | Allowlist the four new fields for founder save |
| `siteforowners/src/app/api/create-booking/route.ts` | Server-side: load tenant settings, compute deposit, set `status = 'pending'` if required, fire deposit-pending notification instead of standard confirmation |
| `siteforowners/src/app/api/admin/bookings/status/route.ts` | Allow `pending → confirmed` transition; fire deposit-received notification on that transition |
| `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx` | Mount `DepositEditor`; include in save payload |
| `siteforowners/src/app/site/[slug]/admin/services/page.tsx` | Load deposit settings via the existing query path |
| `siteforowners/src/app/site/[slug]/admin/schedule/ScheduleClient.tsx` | Mount `PendingPaymentsList`; render yellow `Pending` badge inline on pending bookings |
| `siteforowners/src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` | Founder-side parity for deposit fields |
| `siteforowners/src/components/templates/CustomerBookingFlow.tsx` | Amber deposit panel on Step 2 (replaces small policies callout when deposit required); pending confirmation-screen variant; CTA copy update |
| `siteforowners/src/components/templates/TemplateBooking.tsx` | Accept `depositSettings` prop; pass through to CustomerBookingFlow |
| `siteforowners/src/components/templates/TemplateOrchestrator.tsx` | Load deposit settings from `booking_settings`; pass to TemplateBooking |

---

## Task 1: Migration — booking_settings deposit columns + bookings.deposit_amount

**Files:**
- Create: `siteforowners/supabase/migrations/021_add_deposit_settings.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Spec 5: optional per-tenant deposit flow.
--
-- booking_settings: per-tenant deposit configuration. Tenants without
-- deposit_required see today's flow unchanged.
ALTER TABLE booking_settings
  ADD COLUMN IF NOT EXISTS deposit_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_mode text CHECK (deposit_mode IN ('fixed', 'percent') OR deposit_mode IS NULL),
  ADD COLUMN IF NOT EXISTS deposit_value numeric(10, 2),
  ADD COLUMN IF NOT EXISTS deposit_instructions text;

COMMENT ON COLUMN booking_settings.deposit_required IS
  'Spec 5: when true, new bookings start as status=pending until the
   owner marks the deposit received. Off-platform payment.';
COMMENT ON COLUMN booking_settings.deposit_mode IS
  'Spec 5: ''fixed'' = flat dollar amount; ''percent'' = % of (service base + add-ons total).';
COMMENT ON COLUMN booking_settings.deposit_value IS
  'Spec 5: dollars when mode=fixed; integer 1..100 when mode=percent.';
COMMENT ON COLUMN booking_settings.deposit_instructions IS
  'Spec 5: free-form payment instructions shown prominently to the
   customer (Cash App handle, Zelle phone, etc.).';

-- bookings: deposit amount snapshotted at booking creation.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10, 2);

COMMENT ON COLUMN bookings.deposit_amount IS
  'Spec 5: server-computed deposit at booking creation time. NULL when
   the tenant did not require a deposit. Snapshotted (not derived) so
   later toggle changes do not affect historical bookings.';

-- The bookings.status column has no CHECK constraint to update —
-- 'pending' is a new conventional value enforced in code at the
-- create-booking and admin/bookings/status routes.
```

- [ ] **Step 2: Apply locally**

```bash
cd siteforowners && supabase db push
```
(Or paste the SQL into the Supabase dashboard SQL editor and run.) Verify via `\d booking_settings` and `\d bookings` that the new columns appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/021_add_deposit_settings.sql
git commit -m "feat(db): add deposit fields to booking_settings + deposit_amount on bookings"
```

---

## Task 2: Pure deposit helpers (parseServicePrice + computeDeposit)

**Files:**
- Create: `siteforowners/src/lib/deposit.ts`
- Create: `siteforowners/src/lib/deposit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// siteforowners/src/lib/deposit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServicePrice, computeDeposit } from "./deposit";

test("parseServicePrice: '$250' → 250", () => {
  assert.equal(parseServicePrice("$250"), 250);
});

test("parseServicePrice: '1,200' → 1200", () => {
  assert.equal(parseServicePrice("$1,200"), 1200);
});

test("parseServicePrice: 'From $50' → 50", () => {
  assert.equal(parseServicePrice("From $50"), 50);
});

test("parseServicePrice: 'Free' → 0", () => {
  assert.equal(parseServicePrice("Free"), 0);
});

test("parseServicePrice: empty / NaN → 0", () => {
  assert.equal(parseServicePrice(""), 0);
  assert.equal(parseServicePrice("call for quote"), 0);
});

test("computeDeposit: deposit_required=false → 0", () => {
  const d = computeDeposit(
    { deposit_required: false },
    250,
    0,
  );
  assert.equal(d, 0);
});

test("computeDeposit: fixed mode → flat amount", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "fixed", deposit_value: 40 },
    250,
    0,
  );
  assert.equal(d, 40);
});

test("computeDeposit: percent mode applies to base + add-ons", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 20 },
    250,
    50,
  );
  assert.equal(d, 60); // 20% of 300
});

test("computeDeposit: percent mode rounds to cents", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 33 },
    100,
    0,
  );
  assert.equal(d, 33); // 33% of 100 = 33.00
});

test("computeDeposit: percent mode with non-trivial rounding", () => {
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 15 },
    99.99,
    0,
  );
  assert.equal(d, 15); // 15% of 99.99 = 14.9985 → 15.00 rounded
});

test("computeDeposit: percent mode falls back to fixed when basePrice is 0", () => {
  // Service price was unparseable upstream → basePrice=0 + addOnTotal=0
  // means percent of 0 = 0, but the spec says fall back to treating
  // deposit_value as a flat dollar amount in this case.
  const d = computeDeposit(
    { deposit_required: true, deposit_mode: "percent", deposit_value: 40 },
    0,
    0,
  );
  assert.equal(d, 40);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd siteforowners && npx tsx --test src/lib/deposit.test.ts
```
Expected: ALL FAIL with "Cannot find module './deposit'".

- [ ] **Step 3: Implement the helpers**

```ts
// siteforowners/src/lib/deposit.ts

/**
 * Parses a service price string into a dollar amount. Strips currency
 * symbols, commas, and surrounding text. Returns 0 for un-parseable
 * inputs (e.g. "Free", "Call for quote", empty string).
 */
export function parseServicePrice(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export interface DepositSettings {
  deposit_required: boolean;
  deposit_mode?: "fixed" | "percent" | null;
  deposit_value?: number | null;
}

/**
 * Server-authoritative deposit calculation. Returns 0 when deposit
 * is not required. Fixed mode returns the flat dollar amount. Percent
 * mode applies the percentage to (basePrice + addOnTotal) rounded to
 * cents. Percent mode falls back to treating deposit_value as a flat
 * dollar amount when basePrice is 0 (unparseable upstream price like
 * "Free" or "From $X").
 */
export function computeDeposit(
  settings: DepositSettings,
  basePrice: number,
  addOnTotal: number,
): number {
  if (!settings.deposit_required) return 0;
  const value = settings.deposit_value ?? 0;
  if (value <= 0) return 0;
  if (settings.deposit_mode === "fixed") {
    return value;
  }
  // percent mode
  const total = basePrice + addOnTotal;
  if (total <= 0) {
    // Unparseable upstream price — fall back to fixed-dollar interpretation.
    return value;
  }
  const raw = total * (value / 100);
  return Math.round(raw * 100) / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd siteforowners && npx tsx --test src/lib/deposit.test.ts
```
Expected: 11 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deposit.ts src/lib/deposit.test.ts
git commit -m "feat(deposit): pure helpers — parseServicePrice + computeDeposit"
```

---

## Task 3: Pure validator for deposit settings

**Files:**
- Create: `siteforowners/src/lib/validation/deposit-settings.ts`
- Create: `siteforowners/src/lib/validation/deposit-settings.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// siteforowners/src/lib/validation/deposit-settings.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDepositSettings } from "./deposit-settings";

test("validateDepositSettings: required=false → ok with cleared fields", () => {
  const r = validateDepositSettings({ deposit_required: false });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.deposit_required, false);
    assert.equal(r.value.deposit_mode, null);
    assert.equal(r.value.deposit_value, null);
    assert.equal(r.value.deposit_instructions, null);
  }
});

test("validateDepositSettings: required=true with full fixed config", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, true);
});

test("validateDepositSettings: required=true with full percent config", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "percent",
    deposit_value: 20,
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, true);
});

test("validateDepositSettings: required=true rejects missing mode", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_value: 40,
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: required=true rejects missing value", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_instructions: "Cash App: $letstrylocs",
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: required=true rejects missing instructions", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: fixed mode rejects 0 / negative value", () => {
  for (const value of [0, -10]) {
    const r = validateDepositSettings({
      deposit_required: true,
      deposit_mode: "fixed",
      deposit_value: value,
      deposit_instructions: "Cash App: $x",
    });
    assert.equal(r.ok, false, `value=${value} should fail`);
  }
});

test("validateDepositSettings: percent mode rejects out-of-range values", () => {
  for (const value of [0, 101, -5]) {
    const r = validateDepositSettings({
      deposit_required: true,
      deposit_mode: "percent",
      deposit_value: value,
      deposit_instructions: "Cash App: $x",
    });
    assert.equal(r.ok, false, `percent=${value} should fail`);
  }
});

test("validateDepositSettings: percent mode rejects non-integer values", () => {
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "percent",
    deposit_value: 12.5,
    deposit_instructions: "Cash App: $x",
  });
  assert.equal(r.ok, false);
});

test("validateDepositSettings: instructions silently truncated to 1000 chars", () => {
  const long = "x".repeat(1500);
  const r = validateDepositSettings({
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 40,
    deposit_instructions: long,
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.deposit_instructions!.length, 1000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd siteforowners && npx tsx --test src/lib/validation/deposit-settings.test.ts
```
Expected: ALL FAIL with "Cannot find module './deposit-settings'".

- [ ] **Step 3: Implement the validator**

```ts
// siteforowners/src/lib/validation/deposit-settings.ts

export interface DepositSettingsInput {
  deposit_required?: boolean;
  deposit_mode?: "fixed" | "percent" | null;
  deposit_value?: number | null;
  deposit_instructions?: string | null;
}

export interface DepositSettingsValue {
  deposit_required: boolean;
  deposit_mode: "fixed" | "percent" | null;
  deposit_value: number | null;
  deposit_instructions: string | null;
}

export interface DepositSettingsValidationError {
  field: string;
  reason: string;
}

export type DepositSettingsValidationResult =
  | { ok: true; value: DepositSettingsValue }
  | { ok: false; errors: DepositSettingsValidationError[] };

const MAX_INSTRUCTIONS = 1000;

export function validateDepositSettings(
  input: DepositSettingsInput,
): DepositSettingsValidationResult {
  const required = input.deposit_required === true;

  if (!required) {
    // When toggle is off, clear all related fields.
    return {
      ok: true,
      value: {
        deposit_required: false,
        deposit_mode: null,
        deposit_value: null,
        deposit_instructions: null,
      },
    };
  }

  const errors: DepositSettingsValidationError[] = [];
  const mode = input.deposit_mode;
  const value = input.deposit_value;
  const instructionsRaw = input.deposit_instructions;

  if (mode !== "fixed" && mode !== "percent") {
    errors.push({ field: "deposit_mode", reason: "must be 'fixed' or 'percent'" });
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ field: "deposit_value", reason: "required" });
  } else if (mode === "fixed") {
    if (value <= 0) {
      errors.push({ field: "deposit_value", reason: "must be greater than 0" });
    }
  } else if (mode === "percent") {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      errors.push({ field: "deposit_value", reason: "must be an integer between 1 and 100" });
    }
  }

  const instructions = typeof instructionsRaw === "string" ? instructionsRaw.trim() : "";
  if (instructions.length === 0) {
    errors.push({ field: "deposit_instructions", reason: "required" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      deposit_required: true,
      deposit_mode: mode as "fixed" | "percent",
      deposit_value: value as number,
      deposit_instructions: instructions.slice(0, MAX_INSTRUCTIONS),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd siteforowners && npx tsx --test src/lib/validation/deposit-settings.test.ts
```
Expected: 10 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/deposit-settings.ts src/lib/validation/deposit-settings.test.ts
git commit -m "feat(validation): pure validator for deposit settings"
```

---

## Task 4: Wire deposit fields into the services API + update-site allowlist

**Files:**
- Modify: `siteforowners/src/app/api/admin/services/route.ts`
- Modify: `siteforowners/src/app/api/update-site/route.ts`

- [ ] **Step 1: Extend the services API GET to load deposit fields**

`/api/admin/services` already loads `services + categories + booking_policies` in `loadStateForTenant`. The deposit fields live on a different table (`booking_settings`), so we add a separate query alongside.

Open `src/app/api/admin/services/route.ts`. Find `loadStateForTenant`. Replace the function body so it ALSO loads deposit settings:

```ts
async function loadStateForTenant(
  tenantId: string,
): Promise<{
  services: ServiceItem[];
  categories: string[];
  booking_policies: string;
  deposit: {
    deposit_required: boolean;
    deposit_mode: "fixed" | "percent" | null;
    deposit_value: number | null;
    deposit_instructions: string | null;
  };
}> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  const empty = {
    services: [] as ServiceItem[],
    categories: [] as string[],
    booking_policies: "",
    deposit: {
      deposit_required: false,
      deposit_mode: null as "fixed" | "percent" | null,
      deposit_value: null as number | null,
      deposit_instructions: null as string | null,
    },
  };
  if (!slug) return empty;

  // Existing services + categories + policies load (with fallback for
  // missing categories column from earlier deploys).
  const primary = await supabase
    .from("previews")
    .select("services, categories, booking_policies")
    .eq("slug", slug)
    .maybeSingle();
  let services: ServiceItem[] = [];
  let categories: string[] = [];
  let booking_policies = "";
  if (!primary.error) {
    services = (primary.data?.services as ServiceItem[] | null) ?? [];
    categories = (primary.data?.categories as string[] | null) ?? [];
    booking_policies = (primary.data?.booking_policies as string | null) ?? "";
  } else {
    const fallback = await supabase
      .from("previews")
      .select("services")
      .eq("slug", slug)
      .maybeSingle();
    services = (fallback.data?.services as ServiceItem[] | null) ?? [];
  }

  // Deposit settings live on booking_settings, keyed by tenant_id.
  const settings = await supabase
    .from("booking_settings")
    .select("deposit_required, deposit_mode, deposit_value, deposit_instructions")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const deposit = settings.error || !settings.data
    ? empty.deposit
    : {
        deposit_required: !!settings.data.deposit_required,
        deposit_mode: (settings.data.deposit_mode as "fixed" | "percent" | null) ?? null,
        deposit_value: settings.data.deposit_value as number | null,
        deposit_instructions: (settings.data.deposit_instructions as string | null) ?? null,
      };

  return { services, categories, booking_policies, deposit };
}
```

- [ ] **Step 2: Extend the services API POST to validate + save deposit fields**

In the same file, find the POST handler. After the existing `result = validatePayload(body...)` and the `bookingPolicies` extraction, add deposit validation + save. Modify the function:

```ts
import { validateDepositSettings } from "@/lib/validation/deposit-settings";

// ... in POST(request) after the existing result.ok check + bookingPolicies extraction:

const depositResult = validateDepositSettings({
  deposit_required: (body as Record<string, unknown>)?.deposit_required as boolean | undefined,
  deposit_mode: (body as Record<string, unknown>)?.deposit_mode as "fixed" | "percent" | null | undefined,
  deposit_value: (body as Record<string, unknown>)?.deposit_value as number | null | undefined,
  deposit_instructions: (body as Record<string, unknown>)?.deposit_instructions as string | null | undefined,
});
if (!depositResult.ok) {
  return NextResponse.json(
    {
      error: "Validation failed",
      errors: depositResult.errors.map((e) => ({ index: -1, field: e.field, reason: e.reason })),
    },
    { status: 400 },
  );
}

// Save deposit settings to booking_settings via a separate update. The
// row is keyed by tenant_id; UNIQUE(tenant_id) guarantees one row.
const supabaseDepositSave = createAdminClient();
const { error: depositSaveError } = await supabaseDepositSave
  .from("booking_settings")
  .update({
    deposit_required: depositResult.value.deposit_required,
    deposit_mode: depositResult.value.deposit_mode,
    deposit_value: depositResult.value.deposit_value,
    deposit_instructions: depositResult.value.deposit_instructions,
    updated_at: new Date().toISOString(),
  })
  .eq("tenant_id", auth.tenantId);

if (depositSaveError) {
  console.error("[admin/services] deposit save failed", { tenantId: auth.tenantId, error: depositSaveError });
  return NextResponse.json({ error: "Save failed" }, { status: 500 });
}
```

Then update the final response JSON to include the saved deposit:

```ts
return NextResponse.json({
  ok: true,
  services: result.services,
  categories: result.categories,
  booking_policies: bookingPolicies,
  deposit: depositResult.value,
});
```

- [ ] **Step 3: Allowlist deposit fields in /api/update-site for founder save**

Open `src/app/api/update-site/route.ts`. Find the allowlist block. Add the four deposit fields:

```ts
if (updates.booking_policies !== undefined) allowed.booking_policies = updates.booking_policies;
// Deposit fields live on booking_settings, not previews — they go through
// a separate save below. Don't put them in `allowed` (which is the previews
// update).
```

Then near the bottom of the function (before the success JSON return), add a separate booking_settings update branch (mirrors what /api/admin/services does):

```ts
// Spec 5: deposit settings live on booking_settings. Update separately.
if (
  updates.deposit_required !== undefined ||
  updates.deposit_mode !== undefined ||
  updates.deposit_value !== undefined ||
  updates.deposit_instructions !== undefined
) {
  const tenantRow = await supabase
    .from("tenants")
    .select("id")
    .eq("preview_slug", slug)
    .maybeSingle();
  const tenantId = tenantRow.data?.id as string | undefined;
  if (tenantId) {
    await supabase
      .from("booking_settings")
      .update({
        deposit_required: updates.deposit_required,
        deposit_mode: updates.deposit_mode,
        deposit_value: updates.deposit_value,
        deposit_instructions: updates.deposit_instructions,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/services/route.ts src/app/api/update-site/route.ts
git commit -m "feat(api): read + persist deposit settings on services + update-site routes"
```

---

## Task 5: Owner-side `DepositEditor` component

**Files:**
- Create: `siteforowners/src/app/site/[slug]/admin/services/DepositEditor.tsx`

- [ ] **Step 1: Create the component**

```tsx
// siteforowners/src/app/site/[slug]/admin/services/DepositEditor.tsx
"use client";

import { useState } from "react";

export interface DepositSettingsState {
  deposit_required: boolean;
  deposit_mode: "fixed" | "percent" | null;
  deposit_value: number | null;
  deposit_instructions: string | null;
}

interface DepositEditorProps {
  value: DepositSettingsState;
  onChange: (next: DepositSettingsState) => void;
}

const MAX_INSTRUCTIONS = 1000;

export function DepositEditor({ value, onChange }: DepositEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const required = value.deposit_required;
  const mode = value.deposit_mode ?? "fixed";
  const numericValue = value.deposit_value ?? "";
  const instructions = value.deposit_instructions ?? "";

  // Collapsed + nothing configured → "+ Require a deposit" prompt.
  if (!expanded && !required) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full bg-white border border-gray-200 rounded-lg p-3 text-left text-sm text-gray-600 hover:border-gray-300"
      >
        <span className="font-semibold text-gray-700">+ Require a deposit</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          Customers pay before their booking is confirmed. Off-platform (Cash App, Zelle) — you mark it received.
        </span>
      </button>
    );
  }

  // Collapsed + deposit configured → summary card.
  if (!expanded) {
    const displayValue = mode === "fixed" ? `$${numericValue}` : `${numericValue}%`;
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full bg-white border border-gray-200 rounded-lg p-3 text-left hover:border-gray-300"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Deposit</span>
          <span className="text-xs text-[var(--admin-primary)] font-medium">Edit ▾</span>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          <strong>{displayValue}</strong> required ({mode === "fixed" ? "flat" : "of service total"})
        </p>
      </button>
    );
  }

  // Expanded.
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Deposit</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-[var(--admin-primary)] font-medium"
        >
          Done ▴
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => onChange({ ...value, deposit_required: e.target.checked })}
          className="h-4 w-4"
        />
        <span className="font-medium text-gray-700">Require deposit</span>
      </label>

      {required && (
        <>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={mode === "fixed"}
                onChange={() => onChange({ ...value, deposit_mode: "fixed" })}
              />
              <span>Fixed amount</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={mode === "percent"}
                onChange={() => onChange({ ...value, deposit_mode: "percent" })}
              />
              <span>Percentage</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {mode === "fixed" ? (
              <>
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  inputMode="decimal"
                  value={numericValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({ ...value, deposit_value: v === "" ? null : parseFloat(v) });
                  }}
                  placeholder="40"
                  className="w-24 rounded border border-gray-200 px-2 py-1 text-sm"
                />
              </>
            ) : (
              <>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={numericValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({ ...value, deposit_value: v === "" ? null : parseInt(v, 10) });
                  }}
                  placeholder="20"
                  className="w-20 rounded border border-gray-200 px-2 py-1 text-sm"
                />
                <span className="text-sm text-gray-500">% of service total</span>
              </>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Payment instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) =>
                onChange({ ...value, deposit_instructions: e.target.value.slice(0, MAX_INSTRUCTIONS) })
              }
              placeholder={"e.g.\nCash App: $letstrylocs\nZelle: (555) 123-4567"}
              rows={4}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm font-mono leading-snug"
            />
            <div className="text-[10px] text-gray-500 mt-1">
              Shown prominently to customers when they book. Be specific.
            </div>
          </div>
        </>
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
git add src/app/site/[slug]/admin/services/DepositEditor.tsx
git commit -m "feat(admin/services): DepositEditor component with collapsed/expanded states"
```

---

## Task 6: Wire DepositEditor into ServicesClient + page.tsx

**Files:**
- Modify: `siteforowners/src/app/site/[slug]/admin/services/ServicesClient.tsx`
- Modify: `siteforowners/src/app/site/[slug]/admin/services/page.tsx`

- [ ] **Step 1: Update page.tsx to load deposit fields**

Open `src/app/site/[slug]/admin/services/page.tsx`. Find `loadServices`. Add a parallel `booking_settings` query and return the deposit shape:

```tsx
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem } from "@/lib/ai/types";
import { ServicesClient } from "./ServicesClient";
import type { DepositSettingsState } from "./DepositEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_DEPOSIT: DepositSettingsState = {
  deposit_required: false,
  deposit_mode: null,
  deposit_value: null,
  deposit_instructions: null,
};

async function loadServices(
  previewSlug: string | null,
  tenantId: string | null,
): Promise<{
  services: ServiceItem[];
  categories: string[];
  bookingPolicies: string;
  deposit: DepositSettingsState;
}> {
  if (!previewSlug) {
    return { services: [], categories: [], bookingPolicies: "", deposit: EMPTY_DEPOSIT };
  }
  const supabase = createAdminClient();
  const primary = await supabase
    .from("previews")
    .select("services, categories, booking_policies")
    .eq("slug", previewSlug)
    .maybeSingle();
  let services: ServiceItem[] = [];
  let categories: string[] = [];
  let bookingPolicies = "";
  if (!primary.error) {
    services = (primary.data?.services as ServiceItem[] | null) ?? [];
    categories = (primary.data?.categories as string[] | null) ?? [];
    bookingPolicies = (primary.data?.booking_policies as string | null) ?? "";
  } else {
    const fallback = await supabase
      .from("previews")
      .select("services")
      .eq("slug", previewSlug)
      .maybeSingle();
    services = (fallback.data?.services as ServiceItem[] | null) ?? [];
  }

  let deposit: DepositSettingsState = EMPTY_DEPOSIT;
  if (tenantId) {
    const settings = await supabase
      .from("booking_settings")
      .select("deposit_required, deposit_mode, deposit_value, deposit_instructions")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!settings.error && settings.data) {
      deposit = {
        deposit_required: !!settings.data.deposit_required,
        deposit_mode: (settings.data.deposit_mode as "fixed" | "percent" | null) ?? null,
        deposit_value: settings.data.deposit_value as number | null,
        deposit_instructions: (settings.data.deposit_instructions as string | null) ?? null,
      };
    }
  }

  return { services, categories, bookingPolicies, deposit };
}

export default async function ServicesPage({
  params,
}: {
  params: { slug: string };
}) {
  noStore();
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const { services, categories, bookingPolicies, deposit } = await loadServices(
    tenant.preview_slug,
    tenant.id,
  );

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Services</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <ServicesClient
          initialServices={services}
          initialCategories={categories}
          initialBookingPolicies={bookingPolicies}
          initialDeposit={deposit}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the editor into ServicesClient**

Open `src/app/site/[slug]/admin/services/ServicesClient.tsx`. Add the new prop, state, and editor. Three edits:

(a) Import + extend props:

```tsx
import { DepositEditor, type DepositSettingsState } from "./DepositEditor";

interface ServicesClientProps {
  initialServices: ServiceItem[];
  initialCategories: string[];
  initialBookingPolicies: string;
  initialDeposit: DepositSettingsState;
}

export function ServicesClient({
  initialServices,
  initialCategories,
  initialBookingPolicies,
  initialDeposit,
}: ServicesClientProps) {
```

(b) Add deposit state alongside the others (after the `bookingPolicies` state):

```tsx
const [deposit, setDeposit] = useState<DepositSettingsState>(initialDeposit);
```

Update the dirty check + initialJson to include `deposit`:

```tsx
const initialJson = JSON.stringify({
  services: normalizedInitial,
  categories: initialCategories,
  bookingPolicies: initialBookingPolicies,
  deposit: initialDeposit,
});
const dirty = JSON.stringify({ services, categories, bookingPolicies, deposit }) !== initialJson;
```

(c) Update the save body to include the deposit fields, and mount the editor in the JSX (place it AFTER `<BookingPoliciesEditor />`, BEFORE the `services.length` row counter):

```tsx
// In save() — extend the body:
body: JSON.stringify({
  services,
  categories,
  booking_policies: bookingPolicies,
  deposit_required: deposit.deposit_required,
  deposit_mode: deposit.deposit_mode,
  deposit_value: deposit.deposit_value,
  deposit_instructions: deposit.deposit_instructions,
}),

// In JSX — after BookingPoliciesEditor:
<BookingPoliciesEditor value={bookingPolicies} onChange={setBookingPolicies} />
<DepositEditor value={deposit} onChange={setDeposit} />
```

- [ ] **Step 3: Verify TypeScript compiles + manual smoke test**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

Start `npm run dev`. Open `/site/<slug>/admin/services`. Verify the "+ Require a deposit" prompt appears below booking policies. Click → expand → check "Require deposit" → enter $40 fixed + Cash App instructions → tap Done ▴ → see the summary card. Save changes. Refresh — values persist.

- [ ] **Step 4: Commit**

```bash
git add src/app/site/[slug]/admin/services/ServicesClient.tsx src/app/site/[slug]/admin/services/page.tsx
git commit -m "feat(admin/services): wire DepositEditor into ServicesClient + page load"
```

---

## Task 7: SiteEditor parity — founder-side deposit fields

**Files:**
- Modify: `siteforowners/src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

- [ ] **Step 1: Add deposit state + load from preview/booking_settings**

Open `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`.

Find where `bookingPolicies` state is initialized. Add deposit state next to it. The founder admin loads via the surrounding page query — for simplicity, deposit defaults to disabled until edited (founder will save and re-load to see the persisted value):

```tsx
import type { DepositSettingsState } from "@/app/site/[slug]/admin/services/DepositEditor";

// near the other state hooks:
const [deposit, setDeposit] = useState<DepositSettingsState>({
  deposit_required: !!(preview as Record<string, unknown>).booking_settings_deposit_required,
  deposit_mode: ((preview as Record<string, unknown>).booking_settings_deposit_mode as "fixed" | "percent" | null) ?? null,
  deposit_value: ((preview as Record<string, unknown>).booking_settings_deposit_value as number | null) ?? null,
  deposit_instructions: ((preview as Record<string, unknown>).booking_settings_deposit_instructions as string | null) ?? null,
});
```

NOTE: the `preview` object passed to SiteEditor doesn't currently include booking_settings fields. Update the surrounding page (`src/app/(admin)/clients/[tenantId]/edit/page.tsx`) to also fetch booking_settings and merge into the preview prop. Search for the page.tsx with `grep -n "SiteEditor" src/app/\(admin\)/clients/\[tenantId\]/edit/page.tsx` to find the call site, and modify the data fetch.

If the page.tsx is non-trivial, take an alternate approach: import `DepositEditor` and have it manage its own local state seeded from a prop the founder fetches separately. Pragmatically, for v1, the founder may only need to override deposit settings rarely — owner-side admin is the primary editor.

If founder loading is hard, leave SiteEditor's deposit state empty by default (`{ deposit_required: false, deposit_mode: null, deposit_value: null, deposit_instructions: null }`), and only persist changes if the founder explicitly edits the editor. Note this in code:

```tsx
// Founder-side deposit defaults to "not configured" — owner-side admin is
// the primary editor for deposit. Founder editing here will overwrite
// whatever the owner has configured. For most tenants, leave this alone.
const [deposit, setDeposit] = useState<DepositSettingsState>({
  deposit_required: false,
  deposit_mode: null,
  deposit_value: null,
  deposit_instructions: null,
});
```

- [ ] **Step 2: Render DepositEditor in the Services section**

Find the existing `<BookingPoliciesEditor`-equivalent textarea inside the Services section (the freeform textarea added in Spec 4). Mount the deposit editor right after it:

```tsx
import { DepositEditor } from "@/app/site/[slug]/admin/services/DepositEditor";

// inside the Services <section>, after the booking-policies textarea div:
<div className="mt-6 border-t border-gray-100 pt-4">
  <label className="block text-sm font-medium text-gray-700 mb-2">Deposit</label>
  <DepositEditor value={deposit} onChange={setDeposit} />
</div>
```

- [ ] **Step 3: Include deposit in save payload + previewData**

In the `handleSave` POST body, add the four deposit fields to `updates`:

```tsx
updates: {
  // ... existing fields ...
  deposit_required: deposit.deposit_required,
  deposit_mode: deposit.deposit_mode,
  deposit_value: deposit.deposit_value,
  deposit_instructions: deposit.deposit_instructions,
},
```

In `previewData` (the live preview synthesis), add the same:

```tsx
const previewData = {
  ...preview,
  // ... existing fields ...
  deposit_required: deposit.deposit_required,
  deposit_mode: deposit.deposit_mode,
  deposit_value: deposit.deposit_value,
  deposit_instructions: deposit.deposit_instructions,
};
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx"
git commit -m "feat(admin/edit): founder-side parity for deposit settings"
```

---

## Task 8: SMS templates — three new triggers

**Files:**
- Modify: `siteforowners/src/lib/sms.ts`

- [ ] **Step 1: Extend BookingSmsData with deposit fields**

Open `src/lib/sms.ts`. Find `interface BookingSmsData`. Add two optional fields:

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
  /** Spec 5: deposit amount in dollars (snapshotted at booking time). Falsy = no deposit. */
  depositAmount?: number;
  /** Spec 5: free-form payment instructions to include in pending notifications. */
  depositInstructions?: string;
}
```

- [ ] **Step 2: Add three new sender functions**

At the bottom of `src/lib/sms.ts`, add:

```ts
/** Spec 5: customer notification when a deposit-required booking is placed.
 * Leads with the action and amount so the customer knows what to do next. */
export async function sendBookingPendingDepositCustomer(b: BookingSmsData): Promise<void> {
  const amt = b.depositAmount ?? 0;
  const instr = b.depositInstructions ?? "";
  const firstName = b.customerName.split(" ")[0];
  await send(
    b.customerPhone,
    `Hi ${firstName}! Your booking at ${b.businessName} on ${b.date} @ ${b.time} is pending. Pay $${amt.toFixed(2)} to confirm: ${instr.replace(/\n/g, " · ")}. Reply STOP to opt out.`,
  );
}

/** Spec 5: customer notification when the owner marks the deposit received. */
export async function sendBookingDepositReceivedCustomer(b: BookingSmsData): Promise<void> {
  const firstName = b.customerName.split(" ")[0];
  await send(
    b.customerPhone,
    `✓ Got it! Your deposit is received and your booking at ${b.businessName} is confirmed for ${b.date} @ ${b.time}. See you then!`,
  );
}

/** Spec 5: customer notification when a booking is canceled (paid or not). */
export async function sendBookingCanceledCustomer(b: BookingSmsData): Promise<void> {
  await send(
    b.customerPhone,
    `Your booking at ${b.businessName} for ${b.date} @ ${b.time} has been canceled. Questions? Reply or call.`,
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sms.ts
git commit -m "feat(sms): three new templates — pending-deposit, deposit-received, canceled"
```

---

## Task 9: Email templates — three new sender functions

**Files:**
- Modify: `siteforowners/src/lib/email.ts`

- [ ] **Step 1: Inspect existing pattern + add three senders**

The file `src/lib/email.ts` already exports `sendBookingNotification` (owner) and `sendBookingConfirmation` (customer). Read the file to find the helper they use (likely `sendEmail` or a similar wrapper using Resend).

Add three new exported functions next to those, using the same wrapper. Each function takes the same `emailData` shape as `sendBookingConfirmation` plus a `depositAmount` and `depositInstructions` for the pending case:

```ts
import type React from "react";

interface DepositInfo {
  amount: number;
  instructions: string;
}

// Use whatever `emailData` type/wrapper the existing senders use; mirror them.

/** Spec 5: customer email when a deposit-required booking is placed. */
export async function sendBookingPendingDepositEmail(
  emailData: BookingEmailData,
  deposit: DepositInfo,
): Promise<void> {
  const subject = `⏳ Pay $${deposit.amount.toFixed(2)} to secure your booking at ${emailData.businessName}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h2 style="color:#92400e;">Almost there — pay your deposit to lock in this slot</h2>
      <p>Hi ${escapeHtml(emailData.customerName.split(" ")[0])},</p>
      <p>Thanks for booking <strong>${escapeHtml(emailData.serviceName)}</strong> at <strong>${escapeHtml(emailData.businessName)}</strong> on <strong>${escapeHtml(emailData.date)} at ${escapeHtml(emailData.time)}</strong>.</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="font-weight:700;font-size:18px;color:#78350f;margin-bottom:8px;">Deposit due: $${deposit.amount.toFixed(2)}</div>
        <div style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:14px;background:#fff;border-radius:4px;padding:10px;">${escapeHtml(deposit.instructions)}</div>
      </div>
      <p style="color:#525252;font-size:14px;">We'll send a confirmation once we receive your deposit. Your slot stays held until then.</p>
      ${emailData.businessPhone ? `<p style="color:#6b7280;font-size:13px;">Questions? Call <a href="tel:${escapeHtml(emailData.businessPhone)}" style="color:#2563eb;">${escapeHtml(emailData.businessPhone)}</a>.</p>` : ""}
    </div>
  `;
  await sendEmail({ to: emailData.customerEmail!, subject, html });
}

/** Spec 5: customer email when the owner marks the deposit received. */
export async function sendBookingDepositReceivedEmail(
  emailData: BookingEmailData,
  icsContent?: string,
): Promise<void> {
  const subject = `✓ Deposit received — booking confirmed at ${emailData.businessName}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h2 style="color:#065f46;">Your booking is confirmed!</h2>
      <p>Hi ${escapeHtml(emailData.customerName.split(" ")[0])},</p>
      <p>We received your deposit. Your booking is locked in:</p>
      <div style="background:#fafafa;border-radius:8px;padding:16px;margin:16px 0;">
        <div><strong>${escapeHtml(emailData.serviceName)}</strong></div>
        <div>${escapeHtml(emailData.date)} at ${escapeHtml(emailData.time)}</div>
        <div>${escapeHtml(emailData.businessName)}${emailData.businessAddress ? ` · ${escapeHtml(emailData.businessAddress)}` : ""}</div>
      </div>
      ${emailData.businessPhone ? `<p style="color:#6b7280;font-size:13px;">Questions? Call <a href="tel:${escapeHtml(emailData.businessPhone)}" style="color:#2563eb;">${escapeHtml(emailData.businessPhone)}</a>.</p>` : ""}
    </div>
  `;
  await sendEmail({
    to: emailData.customerEmail!,
    subject,
    html,
    attachments: icsContent ? [{ filename: "booking.ics", content: icsContent }] : undefined,
  });
}

/** Spec 5: customer email when a booking is canceled (paid or not). */
export async function sendBookingCanceledEmail(emailData: BookingEmailData): Promise<void> {
  const subject = `Your booking at ${emailData.businessName} has been canceled`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h2 style="color:#7f1d1d;">Booking canceled</h2>
      <p>Hi ${escapeHtml(emailData.customerName.split(" ")[0])},</p>
      <p>Your booking for <strong>${escapeHtml(emailData.serviceName)}</strong> on <strong>${escapeHtml(emailData.date)} at ${escapeHtml(emailData.time)}</strong> at ${escapeHtml(emailData.businessName)} has been canceled.</p>
      ${emailData.businessPhone ? `<p style="color:#6b7280;font-size:13px;">Questions? Call <a href="tel:${escapeHtml(emailData.businessPhone)}" style="color:#2563eb;">${escapeHtml(emailData.businessPhone)}</a>.</p>` : ""}
    </div>
  `;
  await sendEmail({ to: emailData.customerEmail!, subject, html });
}

// If escapeHtml doesn't already exist in this file, add it:
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

NOTE: if `sendEmail`, `BookingEmailData`, and `escapeHtml` are not already exported with these exact names, mirror the existing pattern (read the file first to see what's there). The structure matters more than the names.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(email): three new templates — pending-deposit, deposit-received, canceled"
```

---

## Task 10: Server-side deposit logic in /api/create-booking

**Files:**
- Modify: `siteforowners/src/app/api/create-booking/route.ts`

- [ ] **Step 1: Load tenant deposit settings + compute deposit amount + set status**

Open `src/app/api/create-booking/route.ts`. After the existing tenant + booking_settings lookup (where `max_per_slot` is fetched), extend the SELECT to also pull deposit fields. Then:

1. Compute the deposit using the helper.
2. If deposit_required, set the insert's `status = 'pending'` and `deposit_amount = computedAmount`.
3. After insert, conditionally fire the deposit-pending notification instead of the standard confirmation.

Concretely:

```ts
// at the top:
import { computeDeposit, parseServicePrice } from "@/lib/deposit";
import {
  sendBookingPendingDepositCustomer,
  sendBookingCanceledCustomer, // not used in this file but harmless
} from "@/lib/sms";
import {
  sendBookingPendingDepositEmail,
} from "@/lib/email";

// when fetching booking_settings, extend the select:
const { data: settings } = await supabase
  .from("booking_settings")
  .select("max_per_slot, deposit_required, deposit_mode, deposit_value, deposit_instructions")
  .eq("tenant_id", tenantId)
  .single();

// after the existing capacity check, compute deposit:
const depositSettings = {
  deposit_required: !!settings?.deposit_required,
  deposit_mode: (settings?.deposit_mode as "fixed" | "percent" | null) ?? null,
  deposit_value: (settings?.deposit_value as number | null) ?? null,
};
const basePrice = parseServicePrice(service_price ?? "");
const addOnTotal = Array.isArray(selected_add_ons)
  ? selected_add_ons.reduce((sum: number, a: { price_delta?: number }) => sum + (a.price_delta ?? 0), 0)
  : 0;
const depositAmount = computeDeposit(depositSettings, basePrice, addOnTotal);
const isPending = depositSettings.deposit_required && depositAmount > 0;
const initialStatus = isPending ? "pending" : "confirmed";

// in the .insert({...}) call, add:
status: initialStatus,
deposit_amount: depositAmount > 0 ? depositAmount : null,
```

- [ ] **Step 2: Branch the notification firing**

Find the existing `Promise.allSettled([...])` block that fires the customer email + SMS + owner SMS. Extend the SmsData with the deposit fields and conditionally swap which functions fire:

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
  depositAmount: depositAmount > 0 ? depositAmount : undefined,
  depositInstructions: settings?.deposit_instructions || undefined,
};

// Replace the existing:
//   smsOptIn ? sendBookingCustomerConfirmation(smsData) : Promise.resolve(),
// with:
const customerSmsPromise = !smsOptIn
  ? Promise.resolve()
  : isPending
    ? sendBookingPendingDepositCustomer(smsData)
    : sendBookingCustomerConfirmation(smsData);

// And the customer email:
const customerEmailPromise = !customer_email
  ? Promise.resolve()
  : isPending
    ? sendBookingPendingDepositEmail(emailData, {
        amount: depositAmount,
        instructions: settings?.deposit_instructions ?? "",
      })
    : sendBookingConfirmation(emailData, icsContent);

Promise.allSettled([
  sendBookingNotification(ownerEmail, emailData, icsContent),
  customerEmailPromise,
  sendBookingOwnerNotification(ownerSmsPhone, smsData),
  customerSmsPromise,
]).then((results) => {
  for (const r of results) {
    if (r.status === "rejected") console.error("Booking notification failed:", r.reason);
  }
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/create-booking/route.ts
git commit -m "feat(api/create-booking): compute deposit + set status=pending when required"
```

---

## Task 11: /api/admin/bookings/status — allow pending → confirmed + fire deposit-received notification

**Files:**
- Modify: `siteforowners/src/app/api/admin/bookings/status/route.ts`

- [ ] **Step 1: Update ALLOWED + add notification firing on pending → confirmed**

Replace the entire contents of `src/app/api/admin/bookings/status/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingDepositReceivedCustomer,
  sendBookingCanceledCustomer,
  type BookingSmsData,
} from "@/lib/sms";
import {
  sendBookingDepositReceivedEmail,
  sendBookingCanceledEmail,
} from "@/lib/email";
import { generateIcs, parseTime } from "@/lib/ics";
import { formatTimeRange } from "@/lib/availability";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["pending", "confirmed", "completed", "canceled", "no_show"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const bookingId = typeof b.bookingId === "string" ? b.bookingId : "";
  const toStatus = typeof b.toStatus === "string" ? b.toStatus : "";
  if (!UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }
  if (!ALLOWED.includes(toStatus)) {
    return NextResponse.json({ error: "invalid toStatus" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("bookings")
    .select("tenant_id, status, service_name, booking_date, booking_time, duration_minutes, customer_name, customer_phone, customer_email, customer_sms_opt_in")
    .eq("id", bookingId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // State-machine guard. Allowed transitions:
  //  pending   → confirmed | canceled
  //  confirmed → canceled | completed | no_show
  //  others    → no transitions out (terminal)
  const fromStatus = (row.status as string) ?? "confirmed";
  const allowedTransitions: Record<string, string[]> = {
    pending: ["confirmed", "canceled"],
    confirmed: ["canceled", "completed", "no_show"],
    canceled: [],
    completed: [],
    no_show: [],
  };
  if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
    return NextResponse.json(
      { error: `cannot transition from '${fromStatus}' to '${toStatus}'` },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: toStatus })
    .eq("id", bookingId);
  if (error) {
    console.error("[admin/bookings/status] update failed", { bookingId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Fire customer notification on the two most user-visible transitions:
  //  pending → confirmed: deposit-received
  //  any → canceled: cancellation
  const fireCustomerNotification = async () => {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, address, phone")
      .eq("id", row.tenant_id as string)
      .maybeSingle();
    const businessName = (tenant?.business_name as string) || "Business";
    const businessAddress = (tenant?.address as string) || "";

    const dateObj = new Date((row.booking_date as string) + "T00:00:00");
    const dayName = DAYS[dateObj.getDay()];
    const monthName = MONTHS[dateObj.getMonth()];
    const dateStr = `${dayName}, ${monthName} ${dateObj.getDate()}`;
    const durationMinutes = (row.duration_minutes as number) ?? 60;

    const smsData: BookingSmsData = {
      businessName,
      serviceName: row.service_name as string,
      date: dateStr,
      time: formatTimeRange(row.booking_time as string, durationMinutes),
      customerName: row.customer_name as string,
      customerPhone: row.customer_phone as string,
      businessAddress: businessAddress || undefined,
    };

    const emailData = {
      businessName,
      businessPhone: (tenant?.phone as string) || "",
      businessAddress,
      serviceName: row.service_name as string,
      servicePrice: null,
      date: dateStr,
      time: row.booking_time as string,
      customerName: row.customer_name as string,
      customerPhone: row.customer_phone as string,
      customerEmail: (row.customer_email as string) || undefined,
    };

    if (fromStatus === "pending" && toStatus === "confirmed") {
      // Build .ics for the now-confirmed booking
      const { hours, minutes } = parseTime(row.booking_time as string);
      const startDate = new Date(dateObj);
      startDate.setHours(hours, minutes, 0);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
      const ics = generateIcs({
        title: `${row.service_name} — ${businessName}`,
        description: `Service: ${row.service_name}\nCustomer: ${row.customer_name}`,
        location: businessAddress || undefined,
        startDate,
        endDate,
        organizerName: businessName,
        attendeeName: row.customer_name as string,
        attendeeEmail: (row.customer_email as string) || undefined,
      });

      await Promise.allSettled([
        emailData.customerEmail ? sendBookingDepositReceivedEmail(emailData, ics) : Promise.resolve(),
        row.customer_sms_opt_in ? sendBookingDepositReceivedCustomer(smsData) : Promise.resolve(),
      ]);
    } else if (toStatus === "canceled") {
      await Promise.allSettled([
        emailData.customerEmail ? sendBookingCanceledEmail(emailData) : Promise.resolve(),
        row.customer_sms_opt_in ? sendBookingCanceledCustomer(smsData) : Promise.resolve(),
      ]);
    }
  };

  // Fire-and-forget the notification — don't make the owner wait.
  fireCustomerNotification().catch((err) => {
    console.error("[admin/bookings/status] notification failed", err);
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/bookings/status/route.ts
git commit -m "feat(api/bookings/status): allow pending→confirmed; fire deposit-received + canceled notifications"
```

---

## Task 12: Customer UI — Step 2 deposit panel + pending confirmation screen

**Files:**
- Modify: `siteforowners/src/components/templates/CustomerBookingFlow.tsx`
- Modify: `siteforowners/src/components/templates/TemplateBooking.tsx`
- Modify: `siteforowners/src/components/templates/TemplateOrchestrator.tsx`

- [ ] **Step 1: Pass deposit settings through the orchestrator**

Open `src/components/templates/TemplateOrchestrator.tsx`. The orchestrator currently receives `data: PreviewData`. Booking settings (deposit) live on `booking_settings`, not `previews`. The orchestrator's parent (the live site page) needs to load booking_settings and pass via a new prop.

Add the prop to TemplateOrchestrator:

```tsx
interface TemplateOrchestratorProps {
  // ... existing props ...
  depositSettings?: {
    deposit_required: boolean;
    deposit_mode: "fixed" | "percent" | null;
    deposit_value: number | null;
    deposit_instructions: string | null;
  };
}
```

Pass through to `<TemplateBooking>`:

```tsx
<TemplateBooking
  // ... existing props ...
  depositSettings={depositSettings}
/>
```

- [ ] **Step 2: Update the live site page to load booking_settings**

Find the public site page that renders the orchestrator. Run:
```bash
cd siteforowners && grep -n "TemplateOrchestrator" src/app/site/\[slug\]/page.tsx
```

Add a parallel `booking_settings` query alongside the existing preview load. Pass the loaded deposit fields as `depositSettings` prop.

```tsx
// in the page's data fetch, alongside the previews query:
const settings = await supabase
  .from("booking_settings")
  .select("deposit_required, deposit_mode, deposit_value, deposit_instructions")
  .eq("preview_slug", slug)
  .maybeSingle();
const depositSettings = settings.data
  ? {
      deposit_required: !!settings.data.deposit_required,
      deposit_mode: (settings.data.deposit_mode as "fixed" | "percent" | null) ?? null,
      deposit_value: settings.data.deposit_value as number | null,
      deposit_instructions: (settings.data.deposit_instructions as string | null) ?? null,
    }
  : undefined;

// in the JSX:
<TemplateOrchestrator data={...} depositSettings={depositSettings} {...rest} />
```

- [ ] **Step 3: Pass depositSettings through TemplateBooking → CustomerBookingFlow**

Open `src/components/templates/TemplateBooking.tsx`. Add the prop:

```tsx
interface TemplateBookingProps {
  // ... existing ...
  depositSettings?: { deposit_required: boolean; deposit_mode: "fixed" | "percent" | null; deposit_value: number | null; deposit_instructions: string | null };
}
```

In the props destructure: `depositSettings,`. Pass to CustomerBookingFlow at the bottom of the file:

```tsx
<CustomerBookingFlow
  // ... existing props ...
  depositSettings={depositSettings}
/>
```

- [ ] **Step 4: Render deposit panel on Step 2 + pending confirmation screen**

Open `src/components/templates/CustomerBookingFlow.tsx`.

(a) Add the prop:

```tsx
export function CustomerBookingFlow({
  // ... existing ...
  depositSettings,
}: {
  // ... existing types ...
  depositSettings?: { deposit_required: boolean; deposit_mode: "fixed" | "percent" | null; deposit_value: number | null; deposit_instructions: string | null };
}) {
```

(b) Compute the displayed deposit amount near the other derived values (after `selectedAddOns` is in scope):

```tsx
import { computeDeposit, parseServicePrice } from "@/lib/deposit";

// inside the component:
const depositAmount = depositSettings && selectedService
  ? computeDeposit(
      {
        deposit_required: depositSettings.deposit_required,
        deposit_mode: depositSettings.deposit_mode,
        deposit_value: depositSettings.deposit_value,
      },
      parseServicePrice(selectedService.price),
      selectedAddOns.reduce((s, a) => s + a.price_delta, 0),
    )
  : 0;
const isDepositRequired = !!(depositSettings?.deposit_required && depositAmount > 0);
```

(c) On Step 2 (the schedule/your-details step), find the existing booking-policies callout (small button that opens the drawer). When `isDepositRequired`, render an amber deposit panel ABOVE that callout:

```tsx
{/* Spec 5: prominent deposit panel — replaces the small policies callout when deposit is required */}
{isDepositRequired && (
  <div
    className="rounded-xl border-l-4 p-3"
    style={{ backgroundColor: "#fffbeb", borderLeftColor: "#f59e0b", color: "#451a03" }}
  >
    <div className="flex items-baseline justify-between mb-1">
      <span className="font-bold text-sm">${depositAmount.toFixed(2)} deposit required</span>
      <span className="text-xs opacity-70">non-refundable</span>
    </div>
    <div className="text-xs mb-2">Pay before your booking is confirmed:</div>
    <div className="bg-white rounded p-2 font-mono text-xs whitespace-pre-wrap leading-relaxed">
      {depositSettings!.deposit_instructions}
    </div>
    <div className="text-[10px] mt-2 opacity-70">
      You'll get a confirmation once we receive payment.
    </div>
  </div>
)}
```

(d) Update the Confirm button copy when deposit required:

```tsx
{submitting ? "Booking..." : isDepositRequired ? "Confirm & I'll pay deposit" : "Confirm booking"}
```

(e) For the pending confirmation screen — check what state is shown after `handleBook` succeeds. Find the `step === "confirm"` block. Add a conditional variant that renders when the just-booked record was deposit-required.

The existing flow sets a `setStep("confirm")` after a successful POST. We need to know whether the just-created booking is `pending`. The API response from `/api/create-booking` should include the status. Update `handleBook` to capture that:

```ts
// after the existing successful POST:
const data = await res.json();
setBookedAsPending(data.status === "pending");
setStep("confirm");
```

Add state at the top:
```tsx
const [bookedAsPending, setBookedAsPending] = useState(false);
```

Inside the `step === "confirm"` block, render the pending variant when `bookedAsPending`:

```tsx
{step === "confirm" && (
  <motion.div /* existing wrapper */>
    {bookedAsPending ? (
      <div className="py-4 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 12, delay: 0.1 }}
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "#fefce8", border: "3px solid #f59e0b", color: "#f59e0b", fontSize: 30 }}
        >
          ⏳
        </motion.div>
        <h3 className="mb-1 text-lg font-bold">Almost there!</h3>
        <p className="mb-4 text-sm opacity-70">Pay your deposit to lock in this slot.</p>
        <div
          className="mb-3 rounded-xl p-4 text-left"
          style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}
        >
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "#92400e" }}>Deposit due</span>
            <span className="text-lg font-bold" style={{ color: "#78350f" }}>${depositAmount.toFixed(2)}</span>
          </div>
          <div className="rounded bg-white p-2 text-xs font-mono whitespace-pre-wrap" style={{ color: "#451a03" }}>
            {depositSettings!.deposit_instructions}
          </div>
        </div>
        <div className="mb-3 rounded-lg bg-gray-50 p-3 text-left text-sm">
          <div className="text-xs text-gray-500 mb-1">Pending booking</div>
          <div className="font-semibold">{selectedService?.name} · {selectedDate?.toLocaleDateString()} · {selectedTime}</div>
        </div>
        <p className="mb-4 text-xs text-gray-500 leading-relaxed">
          We'll text and email you once your deposit is received and your booking is confirmed.
        </p>
        <Button
          size="lg"
          onClick={onClose}
          className="w-full rounded-xl py-3 text-sm font-bold"
          style={{ backgroundColor: colors.primary, color: colors.background }}
        >
          Got it
        </Button>
      </div>
    ) : (
      // existing green "Booking Confirmed!" block, unchanged
      <div className="py-4 text-center">
        {/* ... existing JSX ... */}
      </div>
    )}
  </motion.div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles + manual smoke**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

Start dev server. Enable deposit on a tenant ($40 fixed). Book a service → on Step 2, see the amber deposit panel above Confirm; CTA says "Confirm & I'll pay deposit" → submit → see the amber pending confirmation screen.

- [ ] **Step 6: Commit**

```bash
git add src/components/templates/CustomerBookingFlow.tsx src/components/templates/TemplateBooking.tsx src/components/templates/TemplateOrchestrator.tsx src/app/site/\[slug\]/page.tsx
git commit -m "feat(booking): customer Step 2 deposit panel + pending confirmation variant"
```

---

## Task 13: Schedule UI — PendingPaymentsList + inline yellow badge

**Files:**
- Create: `siteforowners/src/app/site/[slug]/admin/schedule/_components/PendingPaymentsList.tsx`
- Modify: `siteforowners/src/app/site/[slug]/admin/schedule/ScheduleClient.tsx`

- [ ] **Step 1: Create the PendingPaymentsList component**

```tsx
// siteforowners/src/app/site/[slug]/admin/schedule/_components/PendingPaymentsList.tsx
"use client";

import { useState } from "react";

export interface PendingBooking {
  id: string;
  customer_name: string;
  service_name: string;
  booking_date: string; // YYYY-MM-DD
  booking_time: string; // "10:00 AM"
  deposit_amount: number | null;
  created_at: string;
}

interface PendingPaymentsListProps {
  pending: PendingBooking[];
  onMarkReceived: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PendingPaymentsList({ pending, onMarkReceived, onCancel }: PendingPaymentsListProps) {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (pending.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between rounded-full bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)] border border-[color:var(--admin-primary-border)] px-3 py-2 text-sm font-semibold"
      >
        <span>🕐 {pending.length} pending payment{pending.length === 1 ? "" : "s"}</span>
        <span>{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 space-y-2">
          {pending.map((b) => (
            <div key={b.id} className="bg-white rounded border-l-4 border-amber-500 p-2 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-gray-900">
                  {b.customer_name} · {new Date(b.booking_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, {b.booking_time}
                </span>
                <span className="text-gray-400 text-[10px]">{timeAgo(b.created_at)}</span>
              </div>
              <div className="text-gray-500 mt-0.5">
                {b.service_name} · Deposit: <span className="text-[var(--admin-primary)] font-semibold">${(b.deposit_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={async () => {
                    setBusyId(b.id);
                    try { await onMarkReceived(b.id); } finally { setBusyId(null); }
                  }}
                  className="flex-1 rounded bg-green-600 text-white px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Mark deposit received
                </button>
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={async () => {
                    if (!confirm("Cancel this booking?")) return;
                    setBusyId(b.id);
                    try { await onCancel(b.id); } finally { setBusyId(null); }
                  }}
                  className="rounded bg-white border border-red-300 text-red-600 px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into ScheduleClient**

Open `src/app/site/[slug]/admin/schedule/ScheduleClient.tsx`. Add the imports + state + actions + JSX:

```tsx
import { PendingPaymentsList, type PendingBooking } from "./_components/PendingPaymentsList";

// inside the component, near the other state:
const [pending, setPending] = useState<PendingBooking[]>(props.initialPending ?? []);

async function statusUpdate(bookingId: string, toStatus: "confirmed" | "canceled") {
  const res = await fetch("/api/admin/bookings/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, toStatus }),
  });
  if (res.ok) {
    setPending((prev) => prev.filter((b) => b.id !== bookingId));
    // Trigger a refetch of the main schedule data if the page exposes one;
    // otherwise the status change shows after next page navigation.
  } else {
    alert("Could not update booking status. Please try again.");
  }
}

// in JSX, render at the top of the schedule view:
<PendingPaymentsList
  pending={pending}
  onMarkReceived={(id) => statusUpdate(id, "confirmed")}
  onCancel={(id) => statusUpdate(id, "canceled")}
/>
```

Update the page that wraps ScheduleClient to load pending bookings server-side:

```bash
cd siteforowners && grep -n "ScheduleClient" src/app/site/\[slug\]/admin/schedule/page.tsx
```

In that page, add a query alongside the existing data fetch:

```ts
const { data: pendingRows } = await supabase
  .from("bookings")
  .select("id, customer_name, service_name, booking_date, booking_time, deposit_amount, created_at")
  .eq("tenant_id", tenant.id)
  .eq("status", "pending")
  .order("created_at", { ascending: true });

const initialPending = (pendingRows ?? []) as PendingBooking[];
```

Pass `initialPending={initialPending}` to ScheduleClient. Update `ScheduleClientProps` to include `initialPending?: PendingBooking[]`.

- [ ] **Step 3: Add yellow `Pending` badge inline in the schedule rows**

Inside ScheduleClient, find where individual bookings are rendered in the day-by-day list (the existing element that shows "11:00 AM · Customer · Service"). For bookings with `status === "pending"`, render with a yellow `border-l-4 border-amber-500` wrapper and a small "Pending" badge. The exact location is template-specific; the visual is:

```tsx
<div
  className={`rounded border-l-4 p-2 ${
    booking.status === "pending"
      ? "bg-amber-50 border-amber-500"
      : "bg-white border-emerald-500"
  }`}
>
  {/* ... existing booking row content ... */}
  {booking.status === "pending" && (
    <span className="ml-2 inline-block bg-amber-500 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
      Pending
    </span>
  )}
</div>
```

- [ ] **Step 4: Verify TypeScript compiles + manual smoke**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

Manual smoke:
1. Tenant with deposit enabled: place a booking as a customer → status=`pending`.
2. Open `/admin/schedule` → see the "1 pending payments" pill at top.
3. Tap to expand → see the booking with green "Mark deposit received" + red Cancel.
4. Tap Mark deposit received → row disappears from the pending list.
5. Confirm customer received the "deposit received — confirmed" notification.

- [ ] **Step 5: Commit**

```bash
git add src/app/site/\[slug\]/admin/schedule/_components/PendingPaymentsList.tsx src/app/site/\[slug\]/admin/schedule/ScheduleClient.tsx src/app/site/\[slug\]/admin/schedule/page.tsx
git commit -m "feat(admin/schedule): pending payments pill + list + inline yellow badge"
```

---

## Final verification

- [ ] **Run all unit tests**

```bash
cd siteforowners && find src -name "*.test.ts" -exec npx tsx --test {} +
```
Expected: all tests pass (existing 145+ + 21 new from Tasks 2 + 3 = 166+).

- [ ] **TypeScript clean**

```bash
cd siteforowners && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Build clean**

```bash
cd siteforowners && npm run build
```
Expected: no errors.

- [ ] **Manual end-to-end smoke**

Per the spec's E2E section:

1. Owner enables deposit (fixed $40), sets payment instructions.
2. Customer books a service → sees amber deposit panel on Step 2; submits → sees pending confirmation screen with payment instructions.
3. Customer receives the "pay $40" email + SMS.
4. Owner sees the "1 pending payments" pill on `/admin/schedule`; expands; taps "Mark deposit received".
5. Customer receives the "deposit received — confirmed" email + SMS.
6. Booking moves out of pending list, shows in regular schedule with the standard Confirmed treatment.
7. Owner switches deposit mode to 20% percent; customer books a $250 service → deposit panel shows `$50`; same flow.
8. Owner cancels a pending booking → customer gets cancellation notification.
