# Demo Site Offline/Online Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Founder-admin toggle to take a demo/prospect tenant's public site offline (404) and bring it back, without touching its subdomain, preview, or content.

**Architecture:** A pure guard function in `src/lib/tenant-access.ts` (mirrors `canTeardownDemo`) gates a new founder-only API route `POST /api/admin/toggle-site-offline` that flips `tenants.site_published`. The existing middleware already 404s unpublished tenants via the no-store `/not-found` rewrite, so no public-facing code changes. UI is a Take Offline / Bring Online button in `ClientActions.tsx`, which both the Clients and Demos pages render through the shared `TenantTable` (desktop + mobile).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase service-role client, `node:test` via `npx tsx --test`, JSDOM render tests.

**Spec:** `docs/superpowers/specs/2026-07-19-demo-site-offline-toggle-design.md`

## Global Constraints

- TypeScript strict — no `any`.
- Founder auth = `admin_session` cookie strictly equal to `ADMIN_PASSWORD` env var (copy the `requireFounder` pattern from `src/app/api/admin/move-to-prospect/route.ts`).
- Service-role Supabase client (`createAdminClient` from `@/lib/supabase/admin`) only inside the API route — never client-side.
- The toggle must be refused server-side for `is_demo = false` tenants (403). Real clients' availability stays subscription-driven.
- Conventional commits (`feat:`, `test:`); every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- All work on branch `feat/demo-offline-toggle`.
- Run tests with `npx tsx --test <file>` from the `siteforowners/` repo root.

---

### Task 1: Guard function `canToggleSiteOffline`

**Files:**
- Modify: `src/lib/tenant-access.ts` (append after `canTeardownDemo`, line 59)
- Test: `src/lib/tenant-access.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `canToggleSiteOffline(tenant: { is_demo?: boolean | null } | null): boolean` — imported by Task 2's route.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/demo-offline-toggle
```

- [ ] **Step 2: Write the failing test**

Append to `src/lib/tenant-access.test.ts`, and add `canToggleSiteOffline` to the existing import from `./tenant-access` on line 3:

```ts
test("canToggleSiteOffline: only demo tenants may be toggled offline from admin", () => {
  assert.equal(canToggleSiteOffline({ is_demo: true }), true);
  // A paying client's site must never be takeable-down through this switch.
  assert.equal(canToggleSiteOffline({ is_demo: false }), false);
  assert.equal(canToggleSiteOffline({ is_demo: null }), false);
  assert.equal(canToggleSiteOffline(null), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test src/lib/tenant-access.test.ts`
Expected: FAIL — `canToggleSiteOffline` is not exported.

- [ ] **Step 4: Write minimal implementation**

Append to `src/lib/tenant-access.ts`:

```ts
/**
 * A demo tenant's public site may be toggled offline/online from founder
 * admin (e.g. the prospect never responded). Real/paying tenants are refused:
 * their public availability is governed by subscription_status only.
 */
export function canToggleSiteOffline(
  tenant: { is_demo?: boolean | null } | null,
): boolean {
  return !!tenant && tenant.is_demo === true;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test src/lib/tenant-access.test.ts`
Expected: PASS — all tests including the 4 new assertions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tenant-access.ts src/lib/tenant-access.test.ts
git commit -m "feat: add canToggleSiteOffline guard for demo site toggle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: API route `POST /api/admin/toggle-site-offline`

**Files:**
- Create: `src/app/api/admin/toggle-site-offline/route.ts`

**Interfaces:**
- Consumes: `canToggleSiteOffline` from `@/lib/tenant-access` (Task 1); `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `POST /api/admin/toggle-site-offline` accepting JSON `{ tenant_id: string, site_published: boolean }`, returning `{ site_published: boolean }` on 200; `{ error: string }` on 400/401/403/404/500. Called by Task 3's UI.

There is no HTTP-route test harness in this repo (existing routes are verified by typecheck + the pure-function tests behind them); the gating logic was tested in Task 1, so this task verifies by typecheck.

- [ ] **Step 1: Create the route**

Create `src/app/api/admin/toggle-site-offline/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canToggleSiteOffline } from "@/lib/tenant-access";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

/**
 * Founder-only switch for a DEMO tenant's public site (e.g. take down a demo
 * whose prospect never responded). Flips `tenants.site_published`; the
 * middleware then serves the no-store /not-found rewrite. Refuses non-demo
 * tenants — a paying client's availability is governed by subscription_status
 * and must never be taken down through this path.
 */
export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenant_id?: unknown; site_published?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId =
    typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }
  if (typeof body.site_published !== "boolean") {
    return NextResponse.json(
      { error: "site_published must be a boolean" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("is_demo")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  if (!canToggleSiteOffline(tenant)) {
    return NextResponse.json(
      {
        error:
          "Only demo sites can be toggled; client sites are governed by subscription status",
      },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("tenants")
    .update({ site_published: body.site_published })
    .eq("id", tenantId);

  if (error) {
    console.error("toggle-site-offline failed:", error);
    return NextResponse.json(
      { error: "Failed to update site" },
      { status: 500 },
    );
  }

  return NextResponse.json({ site_published: body.site_published });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/toggle-site-offline/route.ts
git commit -m "feat: founder API to toggle demo site offline/online

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Take Offline / Bring Online button in ClientActions

**Files:**
- Modify: `src/app/(admin)/clients/ClientActions.tsx`
- Test: `src/app/(admin)/clients/ClientActions.render.test.tsx` (create)

**Interfaces:**
- Consumes: `POST /api/admin/toggle-site-offline` (Task 2).
- Produces: UI only — no exports consumed by later tasks.

A demo taken offline is distinguishable from a never-published demo: it still has a `subdomain`. Rule used below: `offline = isDemo && !published && !!siteSubdomain` → show **Bring Online** and a grayed-out URL instead of the Publish flow.

- [ ] **Step 1: Write the failing render test**

Create `src/app/(admin)/clients/ClientActions.render.test.tsx` (same JSDOM harness as `ServicesSection.render.test.tsx` in this directory — react-dom must be imported only after JSDOM globals are installed):

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";

// tsx compiles JSX with the classic runtime; React must be in scope globally
// (same pattern as ServicesSection.render.test.tsx).
(globalThis as Record<string, unknown>).React = React;

type Root = { render(node: React.ReactNode): void; unmount(): void };

async function withRenderedActions(
  props: {
    sitePublished: boolean;
    isDemo: boolean;
    subdomain: string | null;
  },
  run: (container: HTMLElement) => void | Promise<void>,
) {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost" },
  );
  const globalNames = [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "Event",
    "navigator",
    "IS_REACT_ACT_ENVIRONMENT",
  ] as const;
  const originals = new Map(
    globalNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });

  let root: Root | null = null;
  try {
    const container = dom.window.document.getElementById("root")!;
    const { createRoot } = await import("react-dom/client");
    const { ClientActions } = await import("./ClientActions");
    root = createRoot(container) as Root;
    await act(async () => {
      root!.render(
        <ClientActions
          tenantId="t1"
          businessName="Test Salon"
          subdomain={props.subdomain}
          customDomain={null}
          sitePublished={props.sitePublished}
          isDemo={props.isDemo}
        />,
      );
    });
    await run(container as unknown as HTMLElement);
    await act(async () => {
      root!.unmount();
    });
    root = null;
  } finally {
    if (root) await act(async () => root!.unmount());
    originals.forEach((desc, name) => {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
}

function buttonLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button")).map(
    (b) => b.textContent ?? "",
  );
}

test("published demo shows Take Offline", async () => {
  await withRenderedActions(
    { sitePublished: true, isDemo: true, subdomain: "test-salon" },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(labels.includes("Take Offline"), `got: ${labels.join(", ")}`);
      assert.ok(!labels.includes("Bring Online"));
    },
  );
});

test("offline demo (has subdomain, unpublished) shows Bring Online and grayed URL, hides Publish", async () => {
  await withRenderedActions(
    { sitePublished: false, isDemo: true, subdomain: "test-salon" },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(labels.includes("Bring Online"), `got: ${labels.join(", ")}`);
      assert.ok(!labels.includes("Take Offline"));
      assert.ok(!labels.includes("Publish"), "Publish flow must be hidden for offline demos");
      assert.ok(
        (container.textContent ?? "").includes("test-salon.siteforowners.com"),
        "offline URL should still be visible (grayed out)",
      );
    },
  );
});

test("real client rows never get the offline toggle", async () => {
  await withRenderedActions(
    { sitePublished: true, isDemo: false, subdomain: "paying-client" },
    (container) => {
      const labels = buttonLabels(container);
      assert.ok(!labels.includes("Take Offline"));
      assert.ok(!labels.includes("Bring Online"));
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test "src/app/(admin)/clients/ClientActions.render.test.tsx"`
Expected: FAIL — first and second tests fail (no "Take Offline" / "Bring Online" buttons yet); third test passes.

- [ ] **Step 3: Implement the toggle in ClientActions.tsx**

Three edits to `src/app/(admin)/clients/ClientActions.tsx`:

**(a)** After the existing `movedToProspect` state (line 28), add state, the derived flag, and the handler:

```tsx
  const [toggling, setToggling] = useState(false);

  // A demo taken offline still has its subdomain — distinguish from a
  // never-published demo, which should keep the normal Publish flow.
  const offline = isDemo && !published && !!siteSubdomain;

  const handleToggleOffline = async () => {
    const next = !published;
    const message = published
      ? `Take "${businessName}" offline? Visitors to its URL will see a 404. You can bring it back online anytime.`
      : `Bring "${businessName}" back online at its existing URL?`;
    if (!confirm(message)) return;
    setToggling(true);
    try {
      const res = await fetch("/api/admin/toggle-site-offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, site_published: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update site");
        return;
      }
      setPublished(data.site_published);
    } catch {
      alert("Failed to update site");
    } finally {
      setToggling(false);
    }
  };
```

Note: `handleToggleOffline` must be defined AFTER the `offline` const but its placement relative to the other handlers doesn't matter; keep all three pieces together after line 28 for readability.

**(b)** After the `movedToProspect` span block (the `{movedToProspect && (...)}` JSX ending line 139), add the toggle button:

```tsx
      {isDemo && (published || offline) && (
        <button
          type="button"
          onClick={handleToggleOffline}
          disabled={toggling}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            published
              ? "text-red-700 hover:bg-red-50"
              : "text-green-700 hover:bg-green-50"
          }`}
        >
          {toggling
            ? published
              ? "Taking offline..."
              : "Bringing online..."
            : published
              ? "Take Offline"
              : "Bring Online"}
        </button>
      )}
```

**(c)** Turn the two-branch URL ternary (line 141: `{published && (customDomainUrl || subdomainUrl) ? (`) into three branches — insert an `offline` branch between the published links and the publish flow:

```tsx
      {published && (customDomainUrl || subdomainUrl) ? (
        <>
          {/* ...existing green link block, UNCHANGED... */}
        </>
      ) : offline ? (
        <span className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-400 line-through">
          {siteSubdomain}.siteforowners.com
        </span>
      ) : (
        <>
          {/* ...existing publish flow block, UNCHANGED... */}
        </>
      )}
```

(The `{/* ...UNCHANGED... */}` comments above mark the existing JSX already in the file at lines 142–207 — do not retype or alter it, only wrap it with the new middle branch.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test "src/app/(admin)/clients/ClientActions.render.test.tsx"`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/clients/ClientActions.tsx" "src/app/(admin)/clients/ClientActions.render.test.tsx"
git commit -m "feat: Take Offline / Bring Online toggle for demo sites in admin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification

**Files:** none created/modified (fix-forward if anything fails).

**Interfaces:** n/a.

- [ ] **Step 1: Run the touched test suites**

```bash
npx tsx --test src/lib/tenant-access.test.ts "src/app/(admin)/clients/ClientActions.render.test.tsx" "src/app/(admin)/clients/ServicesSection.render.test.tsx"
```

Expected: all PASS (ServicesSection included to prove ClientActions edits didn't break the sibling admin test).

- [ ] **Step 2: Typecheck + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: both exit 0 (lint warnings pre-existing elsewhere are acceptable; no new errors in touched files).

- [ ] **Step 3: Manual smoke (dev server)**

```bash
npm run dev
```

Then in a browser, logged into founder admin:
1. `/demos` → a demo row shows **Take Offline**. Click → confirm → button becomes **Bring Online**, URL renders grayed/struck-through.
2. Visit the demo's public URL → 404 (`/not-found` content).
3. Click **Bring Online** → confirm → site loads again at the same URL.
4. `/clients` → real client rows show NO toggle.
5. `curl -X POST localhost:3000/api/admin/toggle-site-offline -H 'Content-Type: application/json' -d '{"tenant_id":"<real-client-uuid>","site_published":false}' --cookie "admin_session=$ADMIN_PASSWORD"` → 403.

Expected: all five behave as described. Stop the dev server after.
