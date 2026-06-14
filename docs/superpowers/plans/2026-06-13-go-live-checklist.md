# Per-Client Go-Live Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-client go-live checklist to the founder admin Clients table — a progress badge per row that opens a modal of auto-derived (read-only) and manual (toggleable, persisted) items.

**Architecture:** A pure, unit-tested helper holds the item definitions and progress logic. A new JSONB column on `tenants` stores manual completions. A client component renders the badge + modal and saves each manual toggle through a new `admin_session`-guarded API route. The Clients page passes per-tenant data into the shared `TenantTable` via an opt-in prop, leaving the Prospects table unchanged.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Supabase (Postgres), `node:test` + `tsx` for unit tests, Tailwind.

---

## File Structure

- **Create:** `supabase/migrations/032_go_live_checklist.sql` — add the column.
- **Create:** `src/lib/go-live-checklist.ts` — item definitions + pure logic.
- **Create:** `src/lib/go-live-checklist.test.ts` — unit tests.
- **Create:** `src/app/api/update-checklist/route.ts` — toggle endpoint.
- **Create:** `src/app/(admin)/clients/GoLiveChecklist.tsx` — badge + modal client component.
- **Modify:** `src/app/(admin)/_components/TenantTable.tsx` — opt-in `goLive` prop + column (desktop + mobile).
- **Modify:** `src/app/(admin)/_lib/tenants.ts` — add `go_live_checklist` to the `Tenant` type.
- **Modify:** `src/app/(admin)/clients/page.tsx` — build `slug → seo_locality` map; pass `goLive` to the table.

No new dependencies.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/032_go_live_checklist.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 032_go_live_checklist.sql
-- Per-client go-live checklist: stores manual completions as { itemId: ISO-timestamp }.
-- Auto items are derived at render time and never stored here.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS go_live_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 2: Apply it to the database**

Apply via the project's Supabase workflow (Supabase SQL editor or CLI). Verify the column exists:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tenants' AND column_name = 'go_live_checklist';
```
Expected: one row, `jsonb`, default `'{}'::jsonb`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/032_go_live_checklist.sql
git commit -m "feat: add go_live_checklist column to tenants"
```

---

## Task 2: Pure checklist logic + tests (TDD)

**Files:**
- Create: `src/lib/go-live-checklist.ts`
- Test: `src/lib/go-live-checklist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/go-live-checklist.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_ITEMS,
  MANUAL_ITEMS,
  deriveAuto,
  computeProgress,
  isManualItemId,
} from "./go-live-checklist";

test("there are 3 auto items and 8 manual items", () => {
  assert.equal(AUTO_ITEMS.length, 3);
  assert.equal(MANUAL_ITEMS.length, 8);
});

test("deriveAuto reflects live, domain, and locality", () => {
  assert.deepEqual(
    deriveAuto({ isDemo: false, customDomain: "x.com", subdomain: null, seoLocality: "Philadelphia, PA" }),
    { live: true, domain: true, locality: true },
  );
  assert.deepEqual(
    deriveAuto({ isDemo: true, customDomain: null, subdomain: null, seoLocality: null }),
    { live: false, domain: false, locality: false },
  );
});

test("deriveAuto: subdomain alone satisfies domain; blank locality is not set", () => {
  const r = deriveAuto({ isDemo: false, customDomain: null, subdomain: "letstrylocs", seoLocality: "  " });
  assert.equal(r.domain, true);
  assert.equal(r.locality, false);
});

test("isManualItemId accepts manual ids and rejects auto/unknown ids", () => {
  assert.equal(isManualItemId("gbp_created"), true);
  assert.equal(isManualItemId("gsc_index"), true);
  assert.equal(isManualItemId("live"), false); // auto item
  assert.equal(isManualItemId("nonsense"), false);
});

test("computeProgress counts auto + manual against a total of 11", () => {
  const auto = { live: true, domain: true, locality: false };
  const manual = { gbp_created: "2026-06-13T00:00:00.000Z", reviews: "2026-06-13T00:00:00.000Z" };
  assert.deepEqual(computeProgress(auto, manual), { done: 4, total: 11 });

  assert.deepEqual(
    computeProgress({ live: false, domain: false, locality: false }, {}),
    { done: 0, total: 11 },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/go-live-checklist.test.ts`
Expected: FAIL — cannot find module `./go-live-checklist`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/go-live-checklist.ts`:

```typescript
export interface ChecklistItem {
  id: string;
  label: string;
}

/** Read-only items derived from data the admin page already has. */
export const AUTO_ITEMS: ChecklistItem[] = [
  { id: "live", label: "Client is live (paid)" },
  { id: "domain", label: "Custom domain or subdomain configured" },
  { id: "locality", label: "Local SEO area set" },
];

/** Items the founder ticks off manually; completion is persisted. */
export const MANUAL_ITEMS: ChecklistItem[] = [
  { id: "hours_services", label: "Hours & services verified" },
  { id: "social", label: "Social links added" },
  { id: "gbp_created", label: "Google Business Profile created & verified" },
  { id: "gbp_nap", label: "GBP info matches website (NAP)" },
  { id: "gbp_website", label: "GBP website link points to live site" },
  { id: "reviews", label: "Review collection started" },
  { id: "gsc_sitemap", label: "Sitemap submitted to Search Console" },
  { id: "gsc_index", label: "Requested indexing in Search Console" },
];

const MANUAL_IDS = new Set(MANUAL_ITEMS.map((i) => i.id));

/** Stored shape: manual item id -> ISO timestamp of completion. */
export type ManualState = Record<string, string | undefined>;

export interface AutoDeriveInput {
  isDemo: boolean;
  customDomain: string | null;
  subdomain: string | null;
  seoLocality: string | null;
}

export function isManualItemId(id: string): boolean {
  return MANUAL_IDS.has(id);
}

/** Completion of each auto item, keyed by item id. */
export function deriveAuto(input: AutoDeriveInput): Record<string, boolean> {
  return {
    live: !input.isDemo,
    domain: !!(input.customDomain || input.subdomain),
    locality: !!input.seoLocality?.trim(),
  };
}

export function computeProgress(
  autoState: Record<string, boolean>,
  manualState: ManualState,
): { done: number; total: number } {
  const autoDone = AUTO_ITEMS.filter((i) => autoState[i.id]).length;
  const manualDone = MANUAL_ITEMS.filter((i) => !!manualState[i.id]).length;
  return { done: autoDone + manualDone, total: AUTO_ITEMS.length + MANUAL_ITEMS.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/go-live-checklist.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/go-live-checklist.ts src/lib/go-live-checklist.test.ts
git commit -m "feat: go-live checklist item definitions and progress logic"
```

---

## Task 3: Toggle API route

**Files:**
- Create: `src/app/api/update-checklist/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/update-checklist/route.ts` (mirrors the auth pattern in `src/app/api/update-tenant/route.ts`):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isManualItemId } from "@/lib/go-live-checklist";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

interface Body {
  tenant_id?: unknown;
  item_id?: unknown;
  done?: unknown;
}

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get("admin_session")?.value;
  if (!ADMIN_PASSWORD || sessionCookie !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  const itemId = typeof body.item_id === "string" ? body.item_id : "";
  const done = body.done === true;

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }
  if (!isManualItemId(itemId)) {
    return NextResponse.json({ error: "Invalid item_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tenant, error: readErr } = await supabase
    .from("tenants")
    .select("go_live_checklist")
    .eq("id", tenantId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const checklist: Record<string, string> = {
    ...((tenant.go_live_checklist as Record<string, string> | null) ?? {}),
  };
  if (done) {
    checklist[itemId] = new Date().toISOString();
  } else {
    delete checklist[itemId];
  }

  const { error: writeErr } = await supabase
    .from("tenants")
    .update({ go_live_checklist: checklist, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (writeErr) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `src/app/api/update-checklist/route.ts`. (Pre-existing `.next/types/` stale-artifact errors are unrelated — ignore those.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/update-checklist/route.ts
git commit -m "feat: admin endpoint to toggle a go-live checklist item"
```

---

## Task 4: GoLiveChecklist client component (badge + modal)

**Files:**
- Create: `src/app/(admin)/clients/GoLiveChecklist.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/(admin)/clients/GoLiveChecklist.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  AUTO_ITEMS,
  MANUAL_ITEMS,
  deriveAuto,
  computeProgress,
  type ManualState,
} from "@/lib/go-live-checklist";

interface Props {
  tenantId: string;
  isDemo: boolean;
  customDomain: string | null;
  subdomain: string | null;
  seoLocality: string | null;
  initialChecklist: ManualState;
}

export function GoLiveChecklist({
  tenantId,
  isDemo,
  customDomain,
  subdomain,
  seoLocality,
  initialChecklist,
}: Props) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<ManualState>(initialChecklist || {});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoState = deriveAuto({ isDemo, customDomain, subdomain, seoLocality });
  const { done, total } = computeProgress(autoState, manual);
  const complete = done === total;

  async function toggle(itemId: string) {
    const wasDone = !!manual[itemId];
    const nextDone = !wasDone;
    setError(null);
    setSavingId(itemId);
    setManual((prev) => {
      const next = { ...prev };
      if (nextDone) next[itemId] = new Date().toISOString();
      else delete next[itemId];
      return next;
    });
    try {
      const res = await fetch("/api/update-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, item_id: itemId, done: nextDone }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      // rollback to previous state
      setManual((prev) => {
        const next = { ...prev };
        if (wasDone) next[itemId] = new Date().toISOString();
        else delete next[itemId];
        return next;
      });
      setError("Couldn't save — try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          complete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        }`}
      >
        Go-live {done}/{total}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Go-live checklist</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              {done} of {total} complete
            </p>

            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              Automatic
            </p>
            <ul className="mb-4 space-y-1.5">
              {AUTO_ITEMS.map((item) => {
                const ok = !!autoState[item.id];
                return (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    <span className={ok ? "text-green-600" : "text-gray-300"}>
                      {ok ? "✓" : "○"}
                    </span>
                    <span className={ok ? "text-gray-900" : "text-gray-500"}>
                      {item.label}
                    </span>
                    <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-400">
                      auto
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              Manual
            </p>
            <ul className="space-y-1.5">
              {MANUAL_ITEMS.map((item) => {
                const checked = !!manual[item.id];
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={savingId === item.id}
                        onChange={() => toggle(item.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className={checked ? "text-gray-900" : "text-gray-600"}>
                        {item.label}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `GoLiveChecklist.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/clients/GoLiveChecklist.tsx"
git commit -m "feat: GoLiveChecklist badge + modal component"
```

---

## Task 5: Add opt-in Go-live column to TenantTable

**Files:**
- Modify: `src/app/(admin)/_components/TenantTable.tsx`

- [ ] **Step 1: Add the import and the prop**

At the top of `src/app/(admin)/_components/TenantTable.tsx`, add the import:

```tsx
import { GoLiveChecklist } from "../clients/GoLiveChecklist";
```

Change the component signature from:

```tsx
export function TenantTable({
  tenants,
  emptyMessage,
}: {
  tenants: Tenant[];
  emptyMessage: React.ReactNode;
}) {
```

to:

```tsx
export function TenantTable({
  tenants,
  emptyMessage,
  goLive,
}: {
  tenants: Tenant[];
  emptyMessage: React.ReactNode;
  goLive?: Record<string, { seoLocality: string | null; checklist: Record<string, string> }>;
}) {
```

- [ ] **Step 2: Add the desktop column (header + cell)**

In the desktop `<thead>` row, add a header after the `Status` header:

```tsx
              <th className="px-5 py-3">Status</th>
              {goLive && <th className="px-5 py-3">Go-live</th>}
              <th className="px-5 py-3">Since</th>
```

In the desktop body row, add a cell after the status cell:

```tsx
                <td className="px-5 py-4">
                  {statusBadge(tenant.subscription_status)}
                </td>
                {goLive && (
                  <td className="px-5 py-4">
                    {goLive[tenant.id] && (
                      <GoLiveChecklist
                        tenantId={tenant.id}
                        isDemo={tenant.is_demo}
                        customDomain={tenant.custom_domain}
                        subdomain={tenant.subdomain}
                        seoLocality={goLive[tenant.id].seoLocality}
                        initialChecklist={goLive[tenant.id].checklist}
                      />
                    )}
                  </td>
                )}
```

- [ ] **Step 3: Add the mobile badge**

In the mobile card, the status badge lives in a right-aligned column. Add the Go-live badge under it:

```tsx
              <div className="flex shrink-0 flex-col items-end gap-1">
                {statusBadge(tenant.subscription_status)}
                {goLive && goLive[tenant.id] && (
                  <GoLiveChecklist
                    tenantId={tenant.id}
                    isDemo={tenant.is_demo}
                    customDomain={tenant.custom_domain}
                    subdomain={tenant.subdomain}
                    seoLocality={goLive[tenant.id].seoLocality}
                    initialChecklist={goLive[tenant.id].checklist}
                  />
                )}
                <span className="text-xs text-gray-400">
                  {timeAgo(tenant.created_at)}
                </span>
              </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `TenantTable.tsx`. (Note: `tenant.go_live_checklist` is not referenced here; the checklist data comes via the `goLive` prop. The `Tenant` type gains `go_live_checklist` in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/_components/TenantTable.tsx"
git commit -m "feat: opt-in Go-live column in TenantTable (desktop + mobile)"
```

---

## Task 6: Wire the Clients page (type + seo_locality map + prop)

**Files:**
- Modify: `src/app/(admin)/_lib/tenants.ts`
- Modify: `src/app/(admin)/clients/page.tsx`

- [ ] **Step 1: Add `go_live_checklist` to the Tenant type**

In `src/app/(admin)/_lib/tenants.ts`, add the field to the `Tenant` interface (after `is_demo`):

```typescript
  is_demo: boolean;
  go_live_checklist?: Record<string, string> | null;
  created_at: string;
```

(`getTenants()` already does `select("*")`, so the column is returned automatically once the migration is applied.)

- [ ] **Step 2: Build the seo_locality map and pass `goLive` on the Clients page**

Replace the body of `src/app/(admin)/clients/page.tsx` with the version below (adds the `createAdminClient` import, the locality lookup, and the `goLive` prop):

```tsx
import Link from "next/link";
import { getTenants, partitionTenants, clientStats } from "../_lib/tenants";
import { TenantTable } from "../_components/TenantTable";
import { StatCards } from "../_components/StatCards";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 0;

export default async function ClientsPage() {
  const { clients } = partitionTenants(await getTenants());
  const { activeClients, sitesLive, mrr } = clientStats(clients);

  // Look up seo_locality (lives on previews) for the "Local SEO area set" auto item.
  const slugs = clients
    .map((c) => c.preview_slug)
    .filter((s): s is string => !!s);
  const localityBySlug = new Map<string, string | null>();
  if (slugs.length) {
    const supabase = createAdminClient();
    const { data: previews } = await supabase
      .from("previews")
      .select("slug, seo_locality")
      .in("slug", slugs);
    for (const p of previews ?? []) {
      localityBySlug.set(p.slug as string, (p.seo_locality as string | null) ?? null);
    }
  }

  const goLive = Object.fromEntries(
    clients.map((c) => [
      c.id,
      {
        seoLocality: c.preview_slug ? localityBySlug.get(c.preview_slug) ?? null : null,
        checklist: c.go_live_checklist ?? {},
      },
    ]),
  );

  return (
    <div>
      <StatCards
        stats={[
          { label: "Active Clients", value: activeClients },
          { label: "Sites Live", value: sitesLive, tone: "green" },
          { label: "Monthly Revenue", value: `$${mrr}` },
        ]}
      />

      {/* Title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-400">{clients.length} total</p>
      </div>

      <TenantTable
        tenants={clients}
        goLive={goLive}
        emptyMessage={
          <>
            No paying clients yet. Convert a{" "}
            <Link href="/demos" className="text-amber-600 underline">
              live demo
            </Link>{" "}
            or onboard a{" "}
            <Link href="/prospects" className="text-amber-600 underline">
              prospect
            </Link>
            .
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `clients/page.tsx` or `_lib/tenants.ts`.

- [ ] **Step 4: Run the full lib test suite**

Run: `npx tsx --test src/lib/go-live-checklist.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/_lib/tenants.ts" "src/app/(admin)/clients/page.tsx"
git commit -m "feat: pass per-client go-live data to the Clients table"
```

---

## Task 7: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the migration is applied** (Task 1, Step 2). The column must exist or the page query and the API will fail.

- [ ] **Step 2: Start the dev server and open the Clients page**

Run: `npm run dev`
Open `/clients` (founder admin, logged in). Confirm each client row shows a **Go-live N/11** badge in a new column (desktop) and under the status badge (mobile at ≤375px).

- [ ] **Step 3: Verify auto items**

Open the badge for a live client with a custom domain and a locality set (e.g. Mariam). Confirm the three Automatic items show ✓ (`live`, `domain`, `locality`). For a `trialing`/no-locality client, confirm the relevant auto items show ○.

- [ ] **Step 4: Verify manual toggle + persistence**

Tick a manual item (e.g. "Google Business Profile created & verified"). Confirm the badge count increments. Reload the page and confirm the item is still checked (persisted). Untick it, reload, confirm it's cleared.

- [ ] **Step 5: Verify the Prospects table is unchanged**

Open `/prospects`. Confirm there is **no** Go-live column (the `goLive` prop is only passed on the Clients page).

- [ ] **Step 6: Report results**

No commit. Report what you verified (badge renders, auto items correct, manual persistence works, Prospects unaffected) and any issues.

---

## Self-Review Notes

- **Spec coverage:** column/migration (T1), item definitions + derive + progress + manual-id validation (T2), `admin_session`-guarded single-item toggle endpoint with 400/401/404/500 paths (T3), badge + modal + optimistic toggle with rollback (T4), opt-in column desktop + mobile (T5), Tenant type + seo_locality map + `goLive` prop (T6), verification incl. Prospects-unchanged (T7). All spec sections covered.
- **Storage shape:** manual completions only, `{ itemId: ISO-timestamp }`; auto items never persisted — matches spec.
- **Type consistency:** `ManualState`, `deriveAuto`, `computeProgress`, `isManualItemId`, `AUTO_ITEMS`, `MANUAL_ITEMS` used identically across lib, component, and route. The `goLive` prop shape `{ seoLocality, checklist }` is identical in TenantTable (T5) and the Clients page (T6).
- **Out of scope (per spec):** no live HTTP verification, no gating, no Prospects/Demos column, no per-item notes — none added.
