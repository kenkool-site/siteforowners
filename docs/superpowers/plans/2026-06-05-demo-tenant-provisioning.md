# Demo Tenant Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click founder action that provisions a preview into a real, subdomain-backed "demo" tenant (unpaid, `trialing`) so it renders exactly like a converted client, with a small CTA and `noindex`; paying later upgrades the same row in place.

**Architecture:** A demo is a real `tenants` row with `subscription_status="trialing"`, `site_published=true`, and a new `is_demo=true` flag. Because `trialing` is already in `PUBLIC_LIVE_STATUSES`, the existing middleware → `/site/[slug]` → `SiteClient(isLive)` path serves it with no gating change. Tenant creation is centralized in a new `provisionTenantFromPreview()` used by both the new founder endpoint (demo) and the Stripe webhook (paid), the latter changed to upsert-by-`preview_slug` so a payment upgrades an existing demo instead of duplicating it.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (admin client / service role), Node built-in test runner via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-demo-tenant-provisioning-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/029_tenant_is_demo.sql` — add `tenants.is_demo`.
- `src/lib/subdomain.ts` — `generateSubdomain()`, `pickAvailableSubdomain()` (pure).
- `src/lib/subdomain.test.ts`
- `src/lib/provision-tenant.ts` — pure builders `buildTenantRow()`, `buildBookingSettingsRow()`, and the DB orchestrator `provisionTenantFromPreview()`.
- `src/lib/provision-tenant.test.ts`
- `src/app/api/admin/provision-demo/route.ts` — `POST` (provision) + `DELETE` (teardown).
- `src/app/site/[slug]/DemoCtaBanner.tsx` — small dismissible CTA banner.

**Modify:**
- `src/lib/tenant-access.ts` — add pure `canTeardownDemo()` guard (+ test in existing `tenant-access.test.ts`, create the test file).
- `src/app/api/stripe-webhook/route.ts` — use `provisionTenantFromPreview()` (idempotent upgrade).
- `src/app/site/[slug]/page.tsx` — select `is_demo`; thread to `SiteData.isDemo`; `noindex` in `generateMetadata` when demo.
- `src/app/site/[slug]/SiteClient.tsx` — accept `isDemo`; render `DemoCtaBanner`.
- `src/app/api/publish-site/route.ts` — import shared `generateSubdomain` (DRY).
- `src/app/(admin)/previews/page.tsx` — fetch demo-tenant map; pass to table.
- `src/app/(admin)/previews/PreviewsTable.tsx` — pass demo info per row.
- `src/app/(admin)/previews/PreviewActions.tsx` — "Go live (demo)" / "Revert to preview" actions.

---

### Task 1: Migration — add `tenants.is_demo`

**Files:**
- Create: `supabase/migrations/029_tenant_is_demo.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 029_tenant_is_demo.sql
-- Founder "demo" provisioning: a preview can be turned into a real, subdomain-
-- backed tenant in a trialing/unpaid state so it renders like a converted
-- client. `is_demo` distinguishes those from real paying tenants and drives the
-- CTA banner, search-engine noindex, and the "Revert to preview" teardown guard.
-- A paid checkout flips this to false (see stripe-webhook upsert-by-preview_slug).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.is_demo IS
  'True for founder-provisioned unpaid demo tenants (subscription_status=trialing, no Stripe subscription). Flipped to false on paid activation. Drives the demo CTA banner, noindex, and the revert-to-preview guard.';

CREATE INDEX IF NOT EXISTS idx_tenants_is_demo ON tenants (is_demo) WHERE is_demo = true;
```

- [ ] **Step 2: Apply the migration**

Run (per project convention — migrations live in the main repo and are applied via the Supabase workflow you already use):
```bash
ls supabase/migrations/029_tenant_is_demo.sql
```
Expected: file exists. Apply through your normal Supabase migration path (e.g. `supabase db push` or the SQL editor). No code depends on it being applied until Task 8 renders, but apply it before manual testing.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/029_tenant_is_demo.sql
git commit -m "feat: add tenants.is_demo for demo provisioning"
```

---

### Task 2: Shared subdomain helpers

**Files:**
- Create: `src/lib/subdomain.ts`
- Test: `src/lib/subdomain.test.ts`
- Modify: `src/app/api/publish-site/route.ts:4-10`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/subdomain.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { generateSubdomain, pickAvailableSubdomain } from "./subdomain";

test("generateSubdomain lowercases and dashes non-alphanumerics", () => {
  assert.equal(generateSubdomain("Let's Try Locs!"), "let-s-try-locs");
});

test("generateSubdomain trims leading/trailing dashes and caps at 40 chars", () => {
  assert.equal(generateSubdomain("  --Hello--  "), "hello");
  assert.equal(generateSubdomain("x".repeat(60)).length, 40);
});

test("pickAvailableSubdomain returns base when free", () => {
  assert.equal(pickAvailableSubdomain("letstrylocs", () => false), "letstrylocs");
});

test("pickAvailableSubdomain appends incrementing suffix when taken", () => {
  const taken = new Set(["letstrylocs", "letstrylocs-2"]);
  assert.equal(pickAvailableSubdomain("letstrylocs", (c) => taken.has(c)), "letstrylocs-3");
});

test("pickAvailableSubdomain falls back to 'site' for empty base", () => {
  assert.equal(pickAvailableSubdomain("", () => false), "site");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/subdomain.test.ts`
Expected: FAIL — `Cannot find module './subdomain'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/subdomain.ts

/** Slugify a business name into a DNS-safe subdomain label (≤ 40 chars). */
export function generateSubdomain(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Deterministically pick the first free subdomain: `base`, then `base-2`,
 * `base-3`, … `isTaken` reports whether a candidate already exists.
 */
export function pickAvailableSubdomain(
  base: string,
  isTaken: (candidate: string) => boolean,
): string {
  const root = base || "site";
  if (!isTaken(root)) return root;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${root}-${suffix}`.slice(0, 40);
    if (!isTaken(candidate)) return candidate;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/subdomain.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Refactor publish-site to use the shared generator (DRY)**

In `src/app/api/publish-site/route.ts`, delete the local `generateSubdomain` function (lines 4-10) and import the shared one. Change the top of the file from:

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateSubdomain(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
```

to:

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSubdomain } from "@/lib/subdomain";
```

- [ ] **Step 6: Verify nothing broke**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/subdomain.ts src/lib/subdomain.test.ts src/app/api/publish-site/route.ts
git commit -m "feat: shared subdomain helpers (generate + pick available)"
```

---

### Task 3: Pure provisioning builders

**Files:**
- Create: `src/lib/provision-tenant.ts`
- Test: `src/lib/provision-tenant.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/provision-tenant.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildTenantRow, buildBookingSettingsRow } from "./provision-tenant";

const PENDING = {
  business_name: "Let's Try Locs",
  booking_mode: "external_only",
  notification_email: "owner@example.com",
  deposit_required: true,
  deposit_mode: "fixed",
  deposit_value: 25,
  deposit_cashapp: "$locs",
  deposit_zelle: null,
  deposit_other_label: null,
  deposit_other_value: null,
};

test("buildTenantRow builds a demo row (trialing, is_demo, subdomain, published)", () => {
  const row = buildTenantRow({
    previewSlug: "letstrylocs-abc",
    businessName: "Let's Try Locs",
    ownerName: "Tonia",
    status: "trialing",
    isDemo: true,
    bookingMode: "external_only",
    email: "owner@example.com",
    subdomain: "letstrylocs",
    sitePublished: true,
  });
  assert.equal(row.subscription_status, "trialing");
  assert.equal(row.is_demo, true);
  assert.equal(row.subdomain, "letstrylocs");
  assert.equal(row.site_published, true);
  assert.equal(row.preview_slug, "letstrylocs-abc");
  assert.equal(row.booking_mode, "external_only");
  assert.equal(row.email, "owner@example.com");
  // Stripe fields absent on the demo path
  assert.equal("stripe_customer_id" in row, false);
});

test("buildTenantRow builds a paid row (active, is_demo false, stripe ids, no subdomain key)", () => {
  const row = buildTenantRow({
    previewSlug: "letstrylocs-abc",
    businessName: "Let's Try Locs",
    ownerName: "Tonia",
    status: "active",
    isDemo: false,
    bookingMode: "in_site_only",
    email: null,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  });
  assert.equal(row.subscription_status, "active");
  assert.equal(row.is_demo, false);
  assert.equal(row.stripe_customer_id, "cus_1");
  assert.equal(row.stripe_subscription_id, "sub_1");
  // subdomain/site_published not included when not provided (don't clobber on update)
  assert.equal("subdomain" in row, false);
  assert.equal("site_published" in row, false);
});

test("buildTenantRow falls back owner_name to business name then 'Owner'", () => {
  const row = buildTenantRow({
    previewSlug: "s", businessName: "Biz", ownerName: "",
    status: "trialing", isDemo: true, bookingMode: "in_site_only", email: null,
  });
  assert.equal(row.owner_name, "Biz");
});

test("buildBookingSettingsRow maps pending deposit fields", () => {
  const row = buildBookingSettingsRow("tenant-1", "letstrylocs-abc", PENDING, "2026-06-05T00:00:00.000Z");
  assert.deepEqual(row, {
    tenant_id: "tenant-1",
    preview_slug: "letstrylocs-abc",
    deposit_required: true,
    deposit_mode: "fixed",
    deposit_value: 25,
    deposit_cashapp: "$locs",
    deposit_zelle: null,
    deposit_other_label: null,
    deposit_other_value: null,
    updated_at: "2026-06-05T00:00:00.000Z",
  });
});

test("buildBookingSettingsRow coerces missing deposit_required to false", () => {
  const row = buildBookingSettingsRow("t", "s", { ...PENDING, deposit_required: null }, "2026-06-05T00:00:00.000Z");
  assert.equal(row.deposit_required, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/provision-tenant.test.ts`
Expected: FAIL — `Cannot find module './provision-tenant'`.

- [ ] **Step 3: Write the builders (and the types they share)**

```typescript
// src/lib/provision-tenant.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Preview-only "pending" settings the founder configures before activation. */
export interface PreviewPendingSettings {
  business_name: string | null;
  booking_mode: string | null;
  notification_email: string | null;
  deposit_required: boolean | null;
  deposit_mode: string | null;
  deposit_value: number | null;
  deposit_cashapp: string | null;
  deposit_zelle: string | null;
  deposit_other_label: string | null;
  deposit_other_value: string | null;
}

export interface TenantRowInput {
  previewSlug: string;
  businessName: string;
  ownerName: string;
  status: string; // "trialing" (demo) | "active" (paid)
  isDemo: boolean;
  bookingMode: string;
  email: string | null;
  subdomain?: string | null;
  sitePublished?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

/**
 * Shape the `tenants` row for an insert or update. Optional fields are omitted
 * entirely when not supplied so an update never clobbers an existing subdomain /
 * publish flag with null (the webhook upgrade path passes no subdomain).
 */
export function buildTenantRow(input: TenantRowInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    business_name: input.businessName || "Unknown",
    owner_name: input.ownerName || input.businessName || "Owner",
    preview_slug: input.previewSlug,
    subscription_status: input.status,
    is_demo: input.isDemo,
    booking_mode: input.bookingMode || "in_site_only",
    email: input.email,
  };
  if (input.subdomain !== undefined) row.subdomain = input.subdomain;
  if (input.sitePublished !== undefined) row.site_published = input.sitePublished;
  if (input.stripeCustomerId !== undefined) row.stripe_customer_id = input.stripeCustomerId;
  if (input.stripeSubscriptionId !== undefined) row.stripe_subscription_id = input.stripeSubscriptionId;
  return row;
}

/** Shape the `booking_settings` upsert row from pending deposit settings. */
export function buildBookingSettingsRow(
  tenantId: string,
  previewSlug: string,
  pending: PreviewPendingSettings,
  nowIso: string,
): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    preview_slug: previewSlug,
    deposit_required: !!pending.deposit_required,
    deposit_mode: pending.deposit_mode,
    deposit_value: pending.deposit_value,
    deposit_cashapp: pending.deposit_cashapp,
    deposit_zelle: pending.deposit_zelle,
    deposit_other_label: pending.deposit_other_label,
    deposit_other_value: pending.deposit_other_value,
    updated_at: nowIso,
  };
}

const PENDING_COLUMNS =
  "business_name, booking_mode, notification_email, deposit_required, deposit_mode, deposit_value, deposit_cashapp, deposit_zelle, deposit_other_label, deposit_other_value";

export interface ProvisionArgs {
  previewSlug: string;
  status: string;
  isDemo: boolean;
  subdomain?: string | null;
  sitePublished?: boolean;
  ownerName?: string | null;
  businessNameOverride?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

/**
 * Create or upgrade the tenant for a preview, idempotent by `preview_slug`:
 * - No existing tenant → INSERT.
 * - Existing tenant → UPDATE in place (used by the paid webhook to upgrade a
 *   demo: sets status/stripe ids/is_demo without clobbering the subdomain).
 * Then upsert `booking_settings` from the preview's pending deposit fields.
 */
export async function provisionTenantFromPreview(
  supabase: SupabaseClient,
  args: ProvisionArgs,
): Promise<{ tenantId: string }> {
  const { data: pending } = await supabase
    .from("previews")
    .select(PENDING_COLUMNS)
    .eq("slug", args.previewSlug)
    .maybeSingle();

  const p = (pending as PreviewPendingSettings | null) ?? {
    business_name: null, booking_mode: null, notification_email: null,
    deposit_required: null, deposit_mode: null, deposit_value: null,
    deposit_cashapp: null, deposit_zelle: null, deposit_other_label: null, deposit_other_value: null,
  };

  const row = buildTenantRow({
    previewSlug: args.previewSlug,
    businessName: args.businessNameOverride || p.business_name || "Unknown",
    ownerName: args.ownerName || p.business_name || "Owner",
    status: args.status,
    isDemo: args.isDemo,
    bookingMode: p.booking_mode || "in_site_only",
    email: p.notification_email ?? null,
    subdomain: args.subdomain,
    sitePublished: args.sitePublished,
    stripeCustomerId: args.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId,
  });

  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("preview_slug", args.previewSlug)
    .maybeSingle();

  let tenantId: string;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("tenants")
      .update(row)
      .eq("id", existing.id as string)
      .select("id")
      .single();
    if (error) throw error;
    tenantId = data.id as string;
  } else {
    const { data, error } = await supabase
      .from("tenants")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    tenantId = data.id as string;
  }

  await supabase
    .from("booking_settings")
    .upsert(
      buildBookingSettingsRow(tenantId, args.previewSlug, p, new Date().toISOString()),
      { onConflict: "tenant_id" },
    );

  return { tenantId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/provision-tenant.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/provision-tenant.ts src/lib/provision-tenant.test.ts
git commit -m "feat: provisionTenantFromPreview + pure row builders"
```

---

### Task 4: Teardown guard in tenant-access

**Files:**
- Modify: `src/lib/tenant-access.ts`
- Test: `src/lib/tenant-access.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/tenant-access.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { canTeardownDemo, isPublicSiteLive } from "./tenant-access";

test("canTeardownDemo: true only for is_demo tenants", () => {
  assert.equal(canTeardownDemo({ is_demo: true }), true);
  assert.equal(canTeardownDemo({ is_demo: false }), false);
  assert.equal(canTeardownDemo({ is_demo: null }), false);
  assert.equal(canTeardownDemo(null), false);
});

test("isPublicSiteLive: trialing demo with published site + preview is live", () => {
  assert.equal(
    isPublicSiteLive({ preview_slug: "s", site_published: true, subscription_status: "trialing" }),
    true,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/tenant-access.test.ts`
Expected: FAIL — `canTeardownDemo` is not exported.

- [ ] **Step 3: Add the guard**

Append to `src/lib/tenant-access.ts`:

```typescript
/**
 * A demo tenant (founder-provisioned, unpaid) may be torn down and reverted to a
 * plain preview. A real/paying tenant (`is_demo` false) must never be deleted
 * through that path — this guards the teardown endpoint.
 */
export function canTeardownDemo(
  tenant: { is_demo?: boolean | null } | null,
): boolean {
  return !!tenant && tenant.is_demo === true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/tenant-access.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant-access.ts src/lib/tenant-access.test.ts
git commit -m "feat: canTeardownDemo guard + tenant-access tests"
```

---

### Task 5: Founder endpoint — provision & teardown

**Files:**
- Create: `src/app/api/admin/provision-demo/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/admin/provision-demo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionTenantFromPreview } from "@/lib/provision-tenant";
import { canTeardownDemo } from "@/lib/tenant-access";
import { generateSubdomain, pickAvailableSubdomain } from "@/lib/subdomain";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

// Provision a preview into a real, subdomain-backed demo tenant.
export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { preview_slug, subdomain: requestedSubdomain } = await request.json();
  if (typeof preview_slug !== "string" || !preview_slug.trim()) {
    return NextResponse.json({ error: "preview_slug required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: preview } = await supabase
    .from("previews")
    .select("slug, business_name")
    .eq("slug", preview_slug)
    .maybeSingle();
  if (!preview) {
    return NextResponse.json({ error: "Preview not found" }, { status: 404 });
  }

  // Resolve a free subdomain. Honor a founder-supplied one (slugified); else
  // derive from the business name. Dedupe against existing tenants.
  const base =
    typeof requestedSubdomain === "string" && requestedSubdomain.trim()
      ? generateSubdomain(requestedSubdomain)
      : generateSubdomain(preview.business_name || preview.slug);

  const { data: clashes } = await supabase
    .from("tenants")
    .select("subdomain, preview_slug")
    .like("subdomain", `${base}%`);
  // A subdomain already owned by THIS preview's tenant is not a clash.
  const taken = new Set(
    (clashes || [])
      .filter((c) => c.preview_slug !== preview_slug && typeof c.subdomain === "string")
      .map((c) => c.subdomain as string),
  );
  const subdomain = pickAvailableSubdomain(base, (c) => taken.has(c));

  try {
    const { tenantId } = await provisionTenantFromPreview(supabase, {
      previewSlug: preview_slug,
      status: "trialing",
      isDemo: true,
      subdomain,
      sitePublished: true,
    });
    return NextResponse.json({
      tenantId,
      subdomain,
      url: `https://${subdomain}.siteforowners.com`,
    });
  } catch (e) {
    console.error("provision-demo failed:", e);
    return NextResponse.json({ error: "Provisioning failed" }, { status: 500 });
  }
}

// Tear a demo back down to a plain preview. Refuses to touch a paying tenant.
export async function DELETE(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { preview_slug } = await request.json();
  if (typeof preview_slug !== "string" || !preview_slug.trim()) {
    return NextResponse.json({ error: "preview_slug required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, is_demo")
    .eq("preview_slug", preview_slug)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: "No tenant for this preview" }, { status: 404 });
  }
  if (!canTeardownDemo(tenant as { is_demo?: boolean | null })) {
    return NextResponse.json(
      { error: "Refusing to delete a paying client" },
      { status: 409 },
    );
  }

  await supabase.from("booking_settings").delete().eq("tenant_id", tenant.id as string);
  const { error } = await supabase.from("tenants").delete().eq("id", tenant.id as string);
  if (error) {
    console.error("revert-to-preview failed:", error);
    return NextResponse.json({ error: "Teardown failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/provision-demo/route.ts
git commit -m "feat: founder provision-demo endpoint (POST provision, DELETE revert)"
```

---

### Task 6: Stripe webhook — idempotent upgrade via shared provisioning

**Files:**
- Modify: `src/app/api/stripe-webhook/route.ts:54-95`

- [ ] **Step 1: Replace the inline tenant + booking_settings creation**

In the `checkout.session.completed` case, replace the tenant `insert` (lines 54-68) AND the `booking_settings` upsert block (lines 75-95) with a single call. The `previewSettings` lookup (lines 46-52) is no longer needed here — `provisionTenantFromPreview` loads pending settings itself. Resulting handler body for that case:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata || {};
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  console.log(`Checkout completed: ${meta.business_name} (${meta.lead_id})`);

  if (!meta.preview_slug) {
    console.error("checkout.session.completed missing preview_slug metadata");
    break;
  }

  // Create the tenant, or upgrade an existing founder demo in place
  // (idempotent by preview_slug): set Stripe ids, go active, drop is_demo.
  let tenantId: string;
  try {
    ({ tenantId } = await provisionTenantFromPreview(supabase, {
      previewSlug: meta.preview_slug,
      status: "active",
      isDemo: false,
      ownerName: meta.owner_name,
      businessNameOverride: meta.business_name,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    }));
  } catch (e) {
    console.error("Tenant provisioning failed:", e);
    break;
  }

  // Mark lead as converted
  if (meta.lead_id) {
    await supabase
      .from("interested_leads")
      .update({
        converted: true,
        tenant_id: tenantId,
        converted_at: new Date().toISOString(),
      })
      .eq("id", meta.lead_id);
  }

  // Mark preview as converted
  await supabase
    .from("previews")
    .update({ converted: true })
    .eq("slug", meta.preview_slug);

  // Notify founder
  await sendFounderNotification({
    ownerName: meta.owner_name || "New Client",
    phone: "",
    businessName: meta.business_name || "Unknown",
    previewSlug: meta.preview_slug,
  }).catch((e) => console.error("Notification failed:", e));

  break;
}
```

- [ ] **Step 2: Add the import**

At the top of `src/app/api/stripe-webhook/route.ts`, add next to the existing `createAdminClient` import:

```typescript
import { provisionTenantFromPreview } from "@/lib/provision-tenant";
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0. (If `previewSettings` is now referenced nowhere, confirm its declaration at old lines 46-52 was removed; TypeScript will error on an unused `const` only if `noUnusedLocals` is on — remove it regardless.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stripe-webhook/route.ts
git commit -m "refactor: webhook upgrades demo tenant in place (upsert by preview_slug)"
```

---

### Task 7: Render threading — `is_demo`, CTA banner, noindex

**Files:**
- Create: `src/app/site/[slug]/DemoCtaBanner.tsx`
- Modify: `src/app/site/[slug]/page.tsx`
- Modify: `src/app/site/[slug]/SiteClient.tsx`

- [ ] **Step 1: Create the CTA banner**

```tsx
// src/app/site/[slug]/DemoCtaBanner.tsx
"use client";

import { useState } from "react";

/**
 * Slim, dismissible banner shown only on unpaid demo sites. Deliberately
 * lighter than the onboarding preview's dominant bottom CTA bar.
 */
export function DemoCtaBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-gray-900/90 px-4 py-2 text-center text-sm text-white backdrop-blur">
      <span>This is a live preview of your site.</span>
      <a
        href="/preview"
        className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-amber-400"
      >
        Activate to publish
      </a>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="ml-1 text-white/60 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Thread `isDemo` through `getSiteData` + render**

In `src/app/site/[slug]/page.tsx`:

(a) Add `isDemo` to the `SiteData` interface (after line 28 `depositSettings?`):
```typescript
  depositSettings?: DepositSettings;
  isDemo: boolean;
```

(b) Select `is_demo` in the tenant query (line 51):
```typescript
    .select("id, checkout_mode, booking_mode, is_demo")
```

(c) Track it. Change the declaration block (near line 47) and the return. Add a local:
```typescript
  let depositSettings: DepositSettings | undefined;
  let isDemo = false;
```
Inside `if (tenant?.id) {` set it:
```typescript
    isDemo = tenant.is_demo === true;
```
And the return (line 83):
```typescript
  return { preview: preview as PreviewData, bookingHours, blockedDates, tenantId, checkoutMode, bookingMode, depositSettings, isDemo };
```

(d) Pass it to `SiteClient` (in `SitePage`, after `depositSettings`):
```tsx
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
```

- [ ] **Step 3: Add `noindex` for demos in `generateMetadata`**

In `src/app/site/[slug]/page.tsx`, inside `generateMetadata`, after the existing `previews` query (line 96), look up the demo flag and add a `robots` block:

```typescript
  const { data: tenantMeta } = await supabase
    .from("tenants")
    .select("is_demo")
    .eq("preview_slug", params.slug)
    .maybeSingle();
  const noindex = tenantMeta?.is_demo === true;
```

Then add to the returned `Metadata` object (alongside `title`/`description`):
```typescript
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
```

- [ ] **Step 4: Render the banner in `SiteClient`**

In `src/app/site/[slug]/SiteClient.tsx`:

(a) Import + add prop:
```typescript
import { DemoCtaBanner } from "./DemoCtaBanner";
```
Add `isDemo?: boolean;` to `SiteClientProps` and `isDemo = false` to the destructured params.

(b) Render the banner:
```tsx
  return (
    <div className="min-h-screen">
      {isDemo && <DemoCtaBanner />}
      <TemplateOrchestrator
        data={data}
        locale="en"
        isLive
        bookingHours={bookingHours}
        blockedDates={blockedDates}
        tenantId={tenantId}
        checkoutMode={checkoutMode}
        bookingMode={bookingMode}
        depositSettings={depositSettings}
      />
    </div>
  );
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/site/[slug]/DemoCtaBanner.tsx src/app/site/[slug]/page.tsx src/app/site/[slug]/SiteClient.tsx
git commit -m "feat: demo sites render with CTA banner + noindex"
```

---

### Task 8: Founder UI — Go live (demo) / Revert to preview

**Files:**
- Modify: `src/app/(admin)/previews/page.tsx`
- Modify: `src/app/(admin)/previews/PreviewsTable.tsx`
- Modify: `src/app/(admin)/previews/PreviewActions.tsx`

- [ ] **Step 1: Fetch the demo-tenant map in the previews page**

In `src/app/(admin)/previews/page.tsx`, after `getPreviews()` returns, load which slugs already have a demo tenant. Add a helper and call it:

```typescript
async function getDemoTenantsBySlug(slugs: string[]): Promise<Record<string, { subdomain: string | null }>> {
  if (slugs.length === 0) return {};
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("preview_slug, subdomain, is_demo")
    .in("preview_slug", slugs)
    .eq("is_demo", true);
  const map: Record<string, { subdomain: string | null }> = {};
  for (const t of data || []) {
    if (t.preview_slug) map[t.preview_slug as string] = { subdomain: (t.subdomain as string | null) ?? null };
  }
  return map;
}
```

In `PreviewsPage()`:
```typescript
  const previews = await getPreviews();
  const demoBySlug = await getDemoTenantsBySlug(previews.map((p) => p.slug));
```
And pass it down:
```tsx
        <PreviewsTable previews={previews} demoBySlug={demoBySlug} />
```

- [ ] **Step 2: Pass demo info through PreviewsTable**

In `src/app/(admin)/previews/PreviewsTable.tsx`:

(a) Update the component signature:
```typescript
export function PreviewsTable({
  previews,
  demoBySlug = {},
}: {
  previews: Preview[];
  demoBySlug?: Record<string, { subdomain: string | null }>;
}) {
```

(b) Update the actions cell (line 135):
```tsx
                  <PreviewActions
                    slug={p.slug}
                    groupId={p.group_id}
                    businessName={p.business_name}
                    demo={demoBySlug[p.slug] ?? null}
                  />
```

- [ ] **Step 3: Add the actions to PreviewActions**

In `src/app/(admin)/previews/PreviewActions.tsx`, extend the props and add the two buttons. Replace the `PreviewActionsProps` interface and the `PreviewActions` function with:

```tsx
interface PreviewActionsProps {
  slug: string;
  groupId: string | null;
  businessName?: string;
  demo?: { subdomain: string | null } | null;
}

export function PreviewActions({ slug, groupId, businessName, demo }: PreviewActionsProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [working, setWorking] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this preview? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: [slug] }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleGoLive = async () => {
    const suggested = (businessName || slug)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const subdomain = prompt("Subdomain for the demo site:", suggested);
    if (subdomain === null) return;
    setWorking(true);
    try {
      const res = await fetch("/api/admin/provision-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_slug: slug, subdomain }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to provision");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to provision");
    } finally {
      setWorking(false);
    }
  };

  const handleRevert = async () => {
    if (!confirm("Revert this demo to a plain preview? The demo tenant + subdomain will be removed.")) return;
    setWorking(true);
    try {
      const res = await fetch("/api/admin/provision-demo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_slug: slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to revert");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to revert");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`/preview/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        View
      </a>
      <a
        href={`/previews/${slug}/edit`}
        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Edit
      </a>
      {groupId && (
        <a
          href={`/preview/compare/${groupId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Compare
        </a>
      )}
      {demo ? (
        <>
          {demo.subdomain && (
            <a
              href={`https://${demo.subdomain}.siteforowners.com`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              Live demo ↗
            </a>
          )}
          <button
            onClick={handleRevert}
            disabled={working}
            className="rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            {working ? "..." : "Revert"}
          </button>
        </>
      ) : (
        <button
          onClick={handleGoLive}
          disabled={working}
          className="rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
        >
          {working ? "..." : "Go live (demo)"}
        </button>
      )}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "..." : "Delete"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/previews/page.tsx" "src/app/(admin)/previews/PreviewsTable.tsx" "src/app/(admin)/previews/PreviewActions.tsx"
git commit -m "feat: founder Go-live(demo) / Revert actions on previews list"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the whole lib test suite**

Run: `npx tsx --test src/lib/*.test.ts src/lib/validation/*.test.ts`
Expected: all pass (208 prior + new subdomain/provision-tenant/tenant-access tests).

- [ ] **Step 2: Typecheck the project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in changed files.

- [ ] **Step 4: Manual smoke test (after migration 029 is applied)**

1. Founder admin → Previews → click **Go live (demo)** on a preview, accept the subdomain.
2. Visit `https://{subdomain}.siteforowners.com` → site renders clean (no preview chrome) with the slim CTA banner; booking opens the real flow; contact form submits.
3. Confirm the page is `noindex` (View Source → `<meta name="robots" content="noindex">`).
4. Click **Revert** → subdomain stops resolving; `/preview/{slug}` still works.
5. (Optional) Simulate a paid `checkout.session.completed` for that `preview_slug` → confirm the same tenant flips to `is_demo=false`, `subscription_status=active`, banner + noindex gone, no duplicate tenant row.

- [ ] **Step 5: Final commit (if any lint/type fixups)**

```bash
git add -A
git commit -m "chore: demo provisioning verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** subdomain (Task 5/8), clean render + small CTA (Task 7), working booking/contact (free via `isLive` on `/site` path — Task 7), real admin (free — demo is a real tenant; founder views via existing `/clients/{tenantId}` tooling, no new code), `is_demo` column (Task 1), shared `provisionTenantFromPreview` (Task 3), webhook idempotency (Task 6), revert/teardown guard (Task 4/5), noindex (Task 7). All covered.
- **Type consistency:** `provisionTenantFromPreview(supabase, ProvisionArgs)`, `buildTenantRow(TenantRowInput)`, `buildBookingSettingsRow(tenantId, previewSlug, PreviewPendingSettings, nowIso)`, `canTeardownDemo({is_demo})`, `generateSubdomain(name)`, `pickAvailableSubdomain(base, isTaken)` — names used consistently across tasks 3–8.
- **Out of scope (per spec):** prospect-facing demo login (founder views admin); auto-expiry (manual Revert only).
