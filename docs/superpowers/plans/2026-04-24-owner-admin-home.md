# Owner Admin Home — Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the empty Home placeholder into the full Home experience — 4 rollup cards, a visitors strip with 7-day sparkline, and a recent-activity feed. Ships the lightweight visitor tracker (own `site_visits` table + `/api/track` beacon) so owners see "47 people looked at your site this week" starting day 1.

**Architecture:** Server-component page that runs a handful of tenant-scoped queries in parallel. Rollup counts live in `src/lib/admin-rollups.ts`; visitor aggregation in `src/lib/admin-visits.ts`; both expose pure helpers to make date-window math unit-testable. Visitor counter uses a static `/track.js` script that calls `navigator.sendBeacon('/api/track')` — no slug param, the server derives the tenant from the request Host header. Bot UA filter is a small substring list for v1.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (service-role only). Tests use Node's built-in `node:test` via `tsx`. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-04-24-owner-admin-design.md`
**Builds on:** `docs/superpowers/plans/2026-04-24-owner-admin-foundation.md` (Plan 1, merged via PR #32)

---

## Environment variables
No new env vars. Uses existing `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_COOKIE_SECRET`.

---

## File Structure

### Create
- `supabase/migrations/012_owner_admin_home.sql` — `site_visits` + `contact_leads` tables + `increment_site_visit` Postgres function
- `public/track.js` — tiny browser-side beacon script (static asset, no bundling)
- `src/lib/admin-tenant.ts` — shared tenant loader wrapped in `React.cache`
- `src/lib/admin-rollups.ts` — count queries + pure date-window helpers
- `src/lib/admin-rollups.test.ts` — unit tests for date math
- `src/lib/admin-visits.ts` — visitor aggregation helpers
- `src/lib/admin-visits.test.ts` — unit tests for `shapeVisits`
- `src/lib/admin-activity.ts` — unified recent-activity loader + relative-time formatter
- `src/app/api/track/route.ts` — POST endpoint that upserts a visit row
- `src/app/site/[slug]/admin/_components/StatCard.tsx`
- `src/app/site/[slug]/admin/_components/Sparkline.tsx`
- `src/app/site/[slug]/admin/_components/VisitorsStrip.tsx`
- `src/app/site/[slug]/admin/_components/RecentActivity.tsx`

### Modify
- `src/lib/admin-auth.ts` — expand `AdminTenant` type with `booking_tool` and `checkout_mode`; update `resolveTenantByHost`'s `.select()` list
- `src/app/site/[slug]/admin/layout.tsx` — use shared `loadTenantBySlug`; drop intersection type
- `src/app/site/[slug]/admin/page.tsx` — replace placeholder with rollups + visitors + activity
- `src/app/site/[slug]/page.tsx` — load `/track.js` via `<Script src="/track.js" />` (public site visits only, not admin)

### Responsibility per file
- `admin-tenant.ts` is the sole module that loads the full tenant row for admin rendering. Request-scoped via `React.cache`.
- `admin-rollups.ts` is the sole owner of Home rollup queries. Pure date helpers exported separately for tests.
- `admin-visits.ts` is the sole module that reads/writes `site_visits`. Pure `shapeVisits` unit-tested.
- `/api/track/route.ts` is the sole public endpoint that writes to `site_visits`.
- `/public/track.js` is a static asset — no imports, no build pipeline. Keeps the tracker outside React bundling.

---

## Task 1: Migration 012

**Files:**
- Create: `supabase/migrations/012_owner_admin_home.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/012_owner_admin_home.sql`:

```sql
-- Owner admin Home + visitor tracking.
-- Part 2 of 4 migrations.

-- Per-day visit counter
CREATE TABLE IF NOT EXISTS site_visits (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_day
  ON site_visits (tenant_id, day DESC);
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

-- Atomic increment: insert (1) on first call, add 1 on subsequent.
-- Returns the new count so callers can observe success.
CREATE OR REPLACE FUNCTION increment_site_visit(p_tenant_id uuid, p_day date)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO site_visits (tenant_id, day, count)
  VALUES (p_tenant_id, p_day, 1)
  ON CONFLICT (tenant_id, day)
  DO UPDATE SET count = site_visits.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

-- Contact form submissions from published tenant sites.
-- Home's "Unread leads" rollup reads this. Plan 3 wires the contact
-- form to write to it.
CREATE TABLE IF NOT EXISTS contact_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  message text,
  source_page text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_leads_tenant_created
  ON contact_leads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_unread
  ON contact_leads (tenant_id) WHERE is_read = false;
ALTER TABLE contact_leads ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply migration in Supabase SQL editor** (run manually)

Verify with:
```sql
SELECT to_regclass('site_visits'), to_regclass('contact_leads');
SELECT increment_site_visit('00000000-0000-0000-0000-000000000000'::uuid, '2026-04-24');
-- Second query will fail with FK violation (no such tenant) — that's
-- expected; it just proves the function exists and runs.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_owner_admin_home.sql
git commit -m "feat(owner-admin): migration 012 — site_visits + contact_leads + RPC"
```

---

## Task 2: Expand AdminTenant type

**Files:**
- Modify: `src/lib/admin-auth.ts`

- [ ] **Step 1: Read the current `admin-auth.ts`**

Run: `cat src/lib/admin-auth.ts` and locate the `AdminTenant` type and both `resolveTenantByHost` queries.

- [ ] **Step 2: Add fields to `AdminTenant`**

Update the `AdminTenant` type to:

```ts
export type AdminTenant = {
  id: string;
  business_name: string;
  owner_name: string;
  preview_slug: string | null;
  email: string | null;
  admin_email: string | null;
  admin_pin_hash: string | null;
  subscription_status: string;
  site_published: boolean;
  booking_tool: string | null;
  checkout_mode: string | null;
};
```

- [ ] **Step 3: Update both select lists in `resolveTenantByHost`**

Both queries currently select:
```ts
"id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published"
```

Change both to:
```ts
"id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode"
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npx tsx --test src/lib/admin-auth.test.ts
```
Both must succeed (11 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts
git commit -m "refactor(owner-admin): fold booking_tool+checkout_mode into AdminTenant"
```

---

## Task 3: Shared tenant loader with React.cache

**Files:**
- Create: `src/lib/admin-tenant.ts`
- Modify: `src/app/site/[slug]/admin/layout.tsx`

- [ ] **Step 1: Create the shared loader**

Create `src/lib/admin-tenant.ts`:

```ts
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminTenant } from "@/lib/admin-auth";

/**
 * Load a tenant by preview_slug, deduped per-request via React cache.
 * The admin layout and any child page/component can call this without
 * compounding Supabase round-trips.
 */
export const loadTenantBySlug = cache(async (slug: string): Promise<AdminTenant | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode"
    )
    .eq("preview_slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[admin-tenant] loadTenantBySlug failed", { slug, error });
  }
  return (data as AdminTenant) ?? null;
});
```

- [ ] **Step 2: Update the admin layout**

Replace the full contents of `src/app/site/[slug]/admin/layout.tsx` with:

```tsx
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/admin-auth";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { PinEntry } from "./_components/PinEntry";
import { AdminShell, ShellTenant } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const sessionCookie = cookies().get("owner_session")?.value;
  const session = sessionCookie ? verifySession(sessionCookie) : null;
  const authed = !!session && session.tenant_id === tenant.id;

  if (!authed) {
    return <PinEntry businessName={tenant.business_name} />;
  }

  const pathname = headers().get("x-pathname") || "/admin";

  const shellTenant: ShellTenant = {
    business_name: tenant.business_name,
    booking_tool: tenant.booking_tool,
    checkout_mode: tenant.checkout_mode,
  };

  return (
    <AdminShell tenant={shellTenant} currentPath={pathname}>
      {children}
    </AdminShell>
  );
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin-tenant.ts 'src/app/site/[slug]/admin/layout.tsx'
git commit -m "refactor(owner-admin): shared React.cache'd tenant loader"
```

---

## Task 4: Rollup query module (TDD)

**Files:**
- Create: `src/lib/admin-rollups.ts`
- Create: `src/lib/admin-rollups.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-rollups.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayRange, currentIsoWeekRange, previousIsoWeekRange } from "./admin-rollups";

test("todayRange: returns [YYYY-MM-DD] string for today (UTC)", () => {
  const d = new Date("2026-04-24T15:30:00Z");
  const r = todayRange(d);
  assert.equal(r.start, "2026-04-24");
  assert.equal(r.end, "2026-04-24");
});

test("currentIsoWeekRange: Friday 2026-04-24 → Mon 04-20 to Sun 04-26", () => {
  const fri = new Date("2026-04-24T15:30:00Z");
  const r = currentIsoWeekRange(fri);
  assert.equal(r.start, "2026-04-20");
  assert.equal(r.end, "2026-04-26");
});

test("currentIsoWeekRange: Sunday 2026-04-26 → still 04-20 to 04-26", () => {
  const sun = new Date("2026-04-26T12:00:00Z");
  const r = currentIsoWeekRange(sun);
  assert.equal(r.start, "2026-04-20");
  assert.equal(r.end, "2026-04-26");
});

test("currentIsoWeekRange: Monday 2026-04-27 → next week 04-27 to 05-03", () => {
  const mon = new Date("2026-04-27T12:00:00Z");
  const r = currentIsoWeekRange(mon);
  assert.equal(r.start, "2026-04-27");
  assert.equal(r.end, "2026-05-03");
});

test("previousIsoWeekRange: Friday 2026-04-24 → 04-13 to 04-19", () => {
  const fri = new Date("2026-04-24T15:30:00Z");
  const r = previousIsoWeekRange(fri);
  assert.equal(r.start, "2026-04-13");
  assert.equal(r.end, "2026-04-19");
});

test("currentIsoWeekRange: crosses month boundary", () => {
  const thu = new Date("2026-04-30T09:00:00Z");
  const r = currentIsoWeekRange(thu);
  assert.equal(r.start, "2026-04-27");
  assert.equal(r.end, "2026-05-03");
});
```

- [ ] **Step 2: Run — should fail**

```bash
npx tsx --test src/lib/admin-rollups.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/admin-rollups.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export type DateRange = { start: string; end: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Single-day range (start and end both the UTC calendar date of `now`). */
export function todayRange(now: Date = new Date()): DateRange {
  const day = isoDate(now);
  return { start: day, end: day };
}

/** ISO week (Monday through Sunday) containing `now`, as UTC dates. */
export function currentIsoWeekRange(now: Date = new Date()): DateRange {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // shift so Monday=0..Sunday=6
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: isoDate(monday), end: isoDate(sunday) };
}

/** Previous ISO week relative to `now`. */
export function previousIsoWeekRange(now: Date = new Date()): DateRange {
  const current = currentIsoWeekRange(now);
  const mondayLastWeek = new Date(current.start + "T00:00:00Z");
  mondayLastWeek.setUTCDate(mondayLastWeek.getUTCDate() - 7);
  const sundayLastWeek = new Date(mondayLastWeek);
  sundayLastWeek.setUTCDate(mondayLastWeek.getUTCDate() + 6);
  return { start: isoDate(mondayLastWeek), end: isoDate(sundayLastWeek) };
}

export type Rollups = {
  newOrders: number;
  bookingsToday: number;
  unreadLeads: number;
  bookingsThisWeek: number;
};

/** Query all 4 rollup counts in parallel. Errors → 0 for that counter. */
export async function getRollups(tenantId: string): Promise<Rollups> {
  const supabase = createAdminClient();
  const today = todayRange();
  const week = currentIsoWeekRange();

  async function countOrders() {
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "new");
    if (error) console.error("[admin-rollups] countOrders failed", { tenantId, error });
    return count ?? 0;
  }

  async function countBookingsToday() {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "completed"])
      .eq("booking_date", today.start);
    if (error) console.error("[admin-rollups] countBookingsToday failed", { tenantId, error });
    return count ?? 0;
  }

  async function countUnreadLeads() {
    const { count, error } = await supabase
      .from("contact_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_read", false);
    if (error) console.error("[admin-rollups] countUnreadLeads failed", { tenantId, error });
    return count ?? 0;
  }

  async function countBookingsThisWeek() {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "completed"])
      .gte("booking_date", week.start)
      .lte("booking_date", week.end);
    if (error) console.error("[admin-rollups] countBookingsThisWeek failed", { tenantId, error });
    return count ?? 0;
  }

  const [newOrders, bookingsToday, unreadLeads, bookingsThisWeek] = await Promise.all([
    countOrders(),
    countBookingsToday(),
    countUnreadLeads(),
    countBookingsThisWeek(),
  ]);

  return { newOrders, bookingsToday, unreadLeads, bookingsThisWeek };
}
```

- [ ] **Step 4: Run — should pass**

```bash
npx tsx --test src/lib/admin-rollups.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-rollups.ts src/lib/admin-rollups.test.ts
git commit -m "feat(owner-admin): rollup count queries + date window helpers"
```

---

## Task 5: Visitor tracking module (TDD)

**Files:**
- Create: `src/lib/admin-visits.ts`
- Create: `src/lib/admin-visits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-visits.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeVisits, VisitRow } from "./admin-visits";

function row(day: string, count: number): VisitRow {
  return { day, count };
}

// Reference date: Friday 2026-04-24
// Current week: Mon 04-20 through Sun 04-26
// Previous week: Mon 04-13 through Sun 04-19
const REF = new Date("2026-04-24T12:00:00Z");

test("shapeVisits: sums current week and previous week totals", () => {
  const rows: VisitRow[] = [
    row("2026-04-13", 3), row("2026-04-15", 2), row("2026-04-19", 5),
    row("2026-04-20", 4), row("2026-04-22", 8), row("2026-04-24", 7),
  ];
  const s = shapeVisits(rows, REF);
  assert.equal(s.thisWeek, 19);
  assert.equal(s.lastWeek, 10);
});

test("shapeVisits: sparkline has 7 entries Mon→Sun", () => {
  const rows: VisitRow[] = [
    row("2026-04-20", 4), row("2026-04-22", 8), row("2026-04-24", 7),
  ];
  const s = shapeVisits(rows, REF);
  assert.equal(s.sparkline.length, 7);
  assert.equal(s.sparkline[0].day, "Mon");
  assert.equal(s.sparkline[0].count, 4);
  assert.equal(s.sparkline[1].day, "Tue");
  assert.equal(s.sparkline[1].count, 0);
  assert.equal(s.sparkline[2].day, "Wed");
  assert.equal(s.sparkline[2].count, 8);
  assert.equal(s.sparkline[4].day, "Fri");
  assert.equal(s.sparkline[4].count, 7);
  assert.equal(s.sparkline[6].day, "Sun");
  assert.equal(s.sparkline[6].count, 0);
});

test("shapeVisits: trendPct rounds to integer", () => {
  const rows: VisitRow[] = [row("2026-04-13", 10), row("2026-04-20", 13)];
  const s = shapeVisits(rows, REF);
  assert.equal(s.trendPct, 30);
});

test("shapeVisits: trendPct is null when last week was 0", () => {
  const rows: VisitRow[] = [row("2026-04-20", 5)];
  const s = shapeVisits(rows, REF);
  assert.equal(s.trendPct, null);
});

test("shapeVisits: no rows → all zeros, trendPct null", () => {
  const s = shapeVisits([], REF);
  assert.equal(s.thisWeek, 0);
  assert.equal(s.lastWeek, 0);
  assert.equal(s.trendPct, null);
  assert.equal(s.sparkline.length, 7);
  for (const d of s.sparkline) assert.equal(d.count, 0);
});

test("shapeVisits: ignores rows outside the two-week window", () => {
  const rows: VisitRow[] = [
    row("2026-04-06", 99), row("2026-05-04", 99), row("2026-04-20", 3),
  ];
  const s = shapeVisits(rows, REF);
  assert.equal(s.thisWeek, 3);
  assert.equal(s.lastWeek, 0);
});
```

- [ ] **Step 2: Run — should fail**

```bash
npx tsx --test src/lib/admin-visits.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/admin-visits.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { currentIsoWeekRange, previousIsoWeekRange } from "./admin-rollups";

export type VisitRow = { day: string; count: number };

export type SparklineBar = { day: string; count: number };

export type VisitStats = {
  thisWeek: number;
  lastWeek: number;
  trendPct: number | null;
  sparkline: SparklineBar[]; // 7 bars, Mon → Sun
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDaysIso(day: string, offset: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Shape raw visit rows (up to 14 days) into week stats + sparkline. Pure. */
export function shapeVisits(rows: VisitRow[], now: Date): VisitStats {
  const curr = currentIsoWeekRange(now);
  const prev = previousIsoWeekRange(now);

  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, r.count);

  let thisWeek = 0;
  let lastWeek = 0;
  const sparkline: SparklineBar[] = [];

  for (let i = 0; i < 7; i++) {
    const dayCurr = addDaysIso(curr.start, i);
    const countCurr = byDay.get(dayCurr) ?? 0;
    thisWeek += countCurr;
    sparkline.push({ day: DAY_LABELS[i], count: countCurr });

    const dayPrev = addDaysIso(prev.start, i);
    lastWeek += byDay.get(dayPrev) ?? 0;
  }

  const trendPct = lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return { thisWeek, lastWeek, trendPct, sparkline };
}

/** Fetch visit rows from the start of last week through today. */
export async function getRecentVisits(tenantId: string, now: Date = new Date()): Promise<VisitRow[]> {
  const prev = previousIsoWeekRange(now);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("site_visits")
    .select("day, count")
    .eq("tenant_id", tenantId)
    .gte("day", prev.start);
  if (error) {
    console.error("[admin-visits] getRecentVisits failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as VisitRow[];
}

/** Atomic per-day increment via Postgres function. */
export async function recordVisit(tenantId: string): Promise<void> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.rpc("increment_site_visit", {
    p_tenant_id: tenantId,
    p_day: today,
  });
  if (error) {
    console.error("[admin-visits] recordVisit failed", { tenantId, error });
  }
}
```

- [ ] **Step 4: Run — should pass**

```bash
npx tsx --test src/lib/admin-visits.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-visits.ts src/lib/admin-visits.test.ts
git commit -m "feat(owner-admin): visitor tracking helpers + week aggregation"
```

---

## Task 6: Track API route

**Files:**
- Create: `src/app/api/track/route.ts`

The route takes no query params. Tenant is derived from the request's Host header using `resolveTenantByHost` (already supports custom_domain + subdomain fallback).

- [ ] **Step 1: Implement**

Create `src/app/api/track/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { recordVisit } from "@/lib/admin-visits";

// Minimal substring-based bot filter. Undercounting is acceptable —
// the visitor stat is feel-good, not fraud-grade.
const BOT_UA_SUBSTRINGS = [
  "bot", "spider", "crawler", "crawl", "headless", "slurp",
  "facebookexternalhit", "preview", "monitor", "lighthouse",
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  return BOT_UA_SUBSTRINGS.some((s) => ua.includes(s));
}

export async function POST(request: NextRequest) {
  if (isBot(request.headers.get("user-agent"))) {
    return NextResponse.json({ ok: true });
  }

  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  await recordVisit(tenant.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/track/route.ts
git commit -m "feat(owner-admin): POST /api/track visitor beacon"
```

---

## Task 7: Static tracker script + injection

**Files:**
- Create: `public/track.js`
- Modify: `src/app/site/[slug]/page.tsx`

- [ ] **Step 1: Create the static tracker**

Create `public/track.js`:

```javascript
(function () {
  try {
    var key = "sv_counted_" + location.hostname;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    navigator.sendBeacon("/api/track");
  } catch (e) {
    /* noop — tracking must never break the page */
  }
})();
```

This is a static asset in `/public/` — served at `/track.js` with no bundling. The tenant is derived server-side from the request Host header by `/api/track`, so the script itself needs no per-tenant data.

- [ ] **Step 2: Inject into public site page**

Read the current `src/app/site/[slug]/page.tsx` first:

```bash
cat src/app/site/[slug]/page.tsx
```

Locate the default exported component's `return` statement (renders `<SiteClient data={...} />`). Change the return so it includes a `<Script>` tag:

- Add this import near the top of the file: `import Script from "next/script";`
- Wrap the current return in a fragment and prepend the script:

```tsx
return (
  <>
    <Script src="/track.js" strategy="afterInteractive" />
    <SiteClient data={/* existing prop */} />
  </>
);
```

Keep any existing props on `<SiteClient>` unchanged. `strategy="afterInteractive"` ensures the script loads after hydration so it doesn't block the first paint.

Crucially: this script is injected only in `src/app/site/[slug]/page.tsx` — the public site route. The admin route (`src/app/site/[slug]/admin/page.tsx`) has its own component tree and does **not** include `<Script src="/track.js" />`, so admin pageviews don't inflate the counter.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add public/track.js 'src/app/site/[slug]/page.tsx'
git commit -m "feat(owner-admin): inject visitor tracker on public site"
```

---

## Task 8: StatCard component

**Files:**
- Create: `src/app/site/[slug]/admin/_components/StatCard.tsx`

- [ ] **Step 1: Create**

```tsx
export function StatCard({ value, label, fullWidth = false }: {
  value: number | string;
  label: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={
        "bg-white border border-gray-200 rounded-lg p-4 " +
        (fullWidth ? "col-span-2 md:col-span-4" : "")
      }
    >
      <div className="text-2xl md:text-3xl font-bold text-pink-600">{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/_components/StatCard.tsx'
git commit -m "feat(owner-admin): StatCard component"
```

---

## Task 9: Sparkline component

**Files:**
- Create: `src/app/site/[slug]/admin/_components/Sparkline.tsx`

- [ ] **Step 1: Create**

```tsx
import type { SparklineBar } from "@/lib/admin-visits";

export function Sparkline({ bars }: { bars: SparklineBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="mt-3">
      <div className="flex items-end gap-1.5 h-12">
        {bars.map((b) => {
          const h = Math.round((b.count / max) * 100);
          return (
            <div key={b.day} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-pink-600 rounded-t"
                style={{ height: Math.max(4, h) + "%" }}
                aria-label={b.day + ": " + b.count}
              />
              <div className="text-[9px] text-pink-900/70 uppercase">{b.day}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'src/app/site/[slug]/admin/_components/Sparkline.tsx'
git commit -m "feat(owner-admin): Sparkline component"
```

---

## Task 10: VisitorsStrip component

**Files:**
- Create: `src/app/site/[slug]/admin/_components/VisitorsStrip.tsx`

- [ ] **Step 1: Create**

```tsx
import type { VisitStats } from "@/lib/admin-visits";
import { Sparkline } from "./Sparkline";

export function VisitorsStrip({ stats }: { stats: VisitStats }) {
  const trendLabel =
    stats.trendPct === null
      ? null
      : (stats.trendPct >= 0 ? "↑ " : "↓ ") +
        Math.abs(stats.trendPct) +
        "% vs last week";
  const trendClass =
    stats.trendPct === null ? "" : stats.trendPct >= 0 ? "text-green-700" : "text-gray-600";

  return (
    <div
      className="mx-3 my-3 md:mx-0 rounded-xl border border-pink-200 p-4"
      style={{ background: "linear-gradient(135deg, #FFF0F6 0%, #FFE4EF 100%)" }}
    >
      <div className="flex justify-between items-baseline">
        <span className="text-xs uppercase tracking-wider font-semibold text-pink-900/70">
          Visitors this week
        </span>
        {trendLabel && <span className={"text-xs font-semibold " + trendClass}>{trendLabel}</span>}
      </div>
      <div className="text-3xl font-bold text-pink-600 mt-1 leading-none">{stats.thisWeek}</div>
      <div className="text-xs text-pink-900/70 mt-0.5">
        {stats.thisWeek === 1 ? "Person checked out your site" : "People checked out your site"}
      </div>
      <Sparkline bars={stats.sparkline} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'src/app/site/[slug]/admin/_components/VisitorsStrip.tsx'
git commit -m "feat(owner-admin): VisitorsStrip component"
```

---

## Task 11: Recent activity loader + component

**Files:**
- Create: `src/lib/admin-activity.ts`
- Create: `src/app/site/[slug]/admin/_components/RecentActivity.tsx`

- [ ] **Step 1: Create the activity loader**

Create `src/lib/admin-activity.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export type ActivityEntry = {
  key: string;
  kind: "booking" | "order" | "lead";
  title: string;
  subtitle: string;
  at: string; // ISO timestamp
};

/** Up to `limit` most recent events across bookings, orders, contact_leads. */
export async function getRecentActivity(tenantId: string, limit = 5): Promise<ActivityEntry[]> {
  const supabase = createAdminClient();

  const [bookings, orders, leads] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, customer_name, service_name, booking_date, booking_time, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("orders")
      .select("id, customer_name, items, subtotal_cents, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("contact_leads")
      .select("id, name, message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const entries: ActivityEntry[] = [];

  for (const b of (bookings.data ?? []) as Array<{
    id: string; customer_name: string; service_name: string;
    booking_date: string; booking_time: string; created_at: string;
  }>) {
    entries.push({
      key: "b-" + b.id,
      kind: "booking",
      title: b.customer_name + " booked " + b.service_name,
      subtitle: b.booking_date + " · " + b.booking_time,
      at: b.created_at,
    });
  }

  for (const o of (orders.data ?? []) as Array<{
    id: string; customer_name: string; items: unknown;
    subtotal_cents: number; created_at: string;
  }>) {
    const itemCount = Array.isArray(o.items) ? o.items.length : 0;
    const dollars = (o.subtotal_cents / 100).toFixed(2);
    entries.push({
      key: "o-" + o.id,
      kind: "order",
      title: "New order from " + o.customer_name,
      subtitle: itemCount + " item" + (itemCount === 1 ? "" : "s") + " · $" + dollars,
      at: o.created_at,
    });
  }

  for (const l of (leads.data ?? []) as Array<{
    id: string; name: string; message: string | null; created_at: string;
  }>) {
    const preview = l.message
      ? '"' + l.message.slice(0, 60) + (l.message.length > 60 ? "…" : "") + '"'
      : "(no message)";
    entries.push({
      key: "l-" + l.id,
      kind: "lead",
      title: "Lead: " + preview,
      subtitle: "from " + l.name,
      at: l.created_at,
    });
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, limit);
}

/** Human-friendly relative time ("10 min ago"). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + " hr ago";
  const days = Math.round(hours / 24);
  if (days < 7) return days + " day" + (days === 1 ? "" : "s") + " ago";
  return new Date(iso).toLocaleDateString();
}
```

- [ ] **Step 2: Create the RecentActivity component**

Create `src/app/site/[slug]/admin/_components/RecentActivity.tsx`:

```tsx
import type { ActivityEntry } from "@/lib/admin-activity";
import { formatRelative } from "@/lib/admin-activity";

export function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="mx-3 md:mx-0 bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-500 text-center">
        No activity yet. New bookings, orders, and leads will show up here.
      </div>
    );
  }
  return (
    <div className="mx-3 md:mx-0 bg-white border border-gray-200 rounded-lg">
      {entries.map((e) => (
        <div key={e.key} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
          <div className="text-sm font-medium">{e.title}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {e.subtitle} {"·"} {formatRelative(e.at)}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/admin-activity.ts 'src/app/site/[slug]/admin/_components/RecentActivity.tsx'
git commit -m "feat(owner-admin): recent activity loader + component"
```

---

## Task 12: Wire Home page

**Files:**
- Modify: `src/app/site/[slug]/admin/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/site/[slug]/admin/page.tsx` with:

```tsx
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { getRollups } from "@/lib/admin-rollups";
import { getRecentVisits, shapeVisits } from "@/lib/admin-visits";
import { getRecentActivity } from "@/lib/admin-activity";
import { StatCard } from "./_components/StatCard";
import { VisitorsStrip } from "./_components/VisitorsStrip";
import { RecentActivity } from "./_components/RecentActivity";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AdminHome({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const showSchedule =
    !tenant.booking_tool || tenant.booking_tool === "none" || tenant.booking_tool === "internal";
  const showOrders = tenant.checkout_mode === "pickup";

  const [rollups, visitRows, activity] = await Promise.all([
    getRollups(tenant.id),
    getRecentVisits(tenant.id),
    getRecentActivity(tenant.id),
  ]);
  const visitStats = shapeVisits(visitRows, new Date());

  const cards: { value: number | string; label: string }[] = [];
  if (showOrders) cards.push({ value: rollups.newOrders, label: "New orders" });
  if (showSchedule) {
    cards.push({ value: rollups.bookingsToday, label: "Bookings today" });
    cards.push({ value: rollups.bookingsThisWeek, label: "Bookings this week" });
  }
  cards.push({ value: rollups.unreadLeads, label: "Unread leads" });

  const gridCols = cards.length === 1 ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4";

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">
          {greeting()}, {tenant.business_name}
        </div>
        <div className="text-sm text-gray-500 mt-1">Here&apos;s what&apos;s happening today</div>
      </div>

      <div className={"grid gap-2.5 px-3 md:px-8 mt-4 " + gridCols}>
        {cards.map((c) => (
          <StatCard key={c.label} value={c.value} label={c.label} fullWidth={cards.length === 1} />
        ))}
      </div>

      <div className="md:px-8">
        <VisitorsStrip stats={visitStats} />
      </div>

      <div className="px-3 md:px-8 mt-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
          Recent activity
        </div>
        <RecentActivity entries={activity} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit
npm run lint
```
Confirm no new errors.

- [ ] **Step 3: Manual smoke test** (run after applying migration 012)

- Start dev server, sign in with PIN at `{tenant-domain}/admin`
- Expect: greeting, 1–4 rollup cards (depending on tenant config), pink "Visitors this week" strip (0 + empty sparkline initially), "No activity yet"
- In another tab, visit the tenant's public site root
- Reload `/admin` — "Visitors this week" should read 1 and Friday's (or today's) sparkline bar should be visible

- [ ] **Step 4: Commit**

```bash
git add 'src/app/site/[slug]/admin/page.tsx'
git commit -m "feat(owner-admin): Home page — rollups + visitors + recent activity"
```

---

## Post-plan verification

- [ ] All tests pass:
  ```bash
  npx tsx --test src/lib/admin-auth.test.ts \
                 src/lib/admin-rate-limit.test.ts \
                 src/lib/admin-rollups.test.ts \
                 src/lib/admin-visits.test.ts
  ```
  Expect 11 + 6 + 6 + 6 = 29 admin tests pass.

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean on new files
- [ ] Migration 012 applied manually in Supabase
- [ ] Manual smoke test per Task 12 Step 3

---

## What is NOT in this plan (later)

- **Feature pages**: Schedule, Orders, Leads, Updates, Billing, Settings → Plans 3 & 4
- **Plausible migration**: Keep own tracker; swap in a dedicated PR when traffic grows
- **Contact form wiring**: Dispatch `/api/leads` writes to `contact_leads` by host → Plan 3
- **i18n**: Hardcoded English strings remain — scheduled for a dedicated pass before Plan 3
- **Per-tenant rate limit** (F6 from Plan 1 final review) — separate hardening PR
- **Founder-auth HMAC migration** (F5 from Plan 1 final review) — separate hardening PR

---

## Self-review notes

**Spec coverage (§Home page):**
- 4 rollup cards with conditional visibility → Tasks 4, 8, 12
- Visitors strip with big number, trend %, 7-day sparkline → Tasks 5, 9, 10, 12
- Recent activity feed (last 5, unioned) → Task 11
- 1-rollup edge case reflows to full-width → StatCard `fullWidth` prop, Task 12

**Spec coverage (§Visitor Tracking):**
- `site_visits` table → Task 1
- Tracker script with sessionStorage dedup + sendBeacon → Task 7 (as static `/public/track.js`)
- `/api/track` upsert → Task 6 (uses RPC from Task 1)
- Bot UA filter → Task 6

**Placeholder scan:** No "TBD" / "TODO" / vague phrases. Every step has complete code or exact commands.

**Type consistency:**
- `VisitRow`, `SparklineBar`, `VisitStats` defined in Task 5; consumed by Tasks 9, 10, 12.
- `ActivityEntry` defined in Task 11; consumed by Task 11's component + Task 12.
- `Rollups` defined in Task 4; destructured in Task 12.
- `AdminTenant` extended in Task 2 to include `booking_tool` + `checkout_mode`; conditional logic in Task 12 reads them.
- `loadTenantBySlug` signature from Task 3 used in both Task 3 (layout) and Task 12 (page).
