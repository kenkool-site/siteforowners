# Marketing-lead Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist "Request yours" ad-form submissions to the DB, surface them in a new admin "Requests" tab, and let the founder open the preview wizard pre-filled from any request.

**Architecture:** The public `/api/marketing-leads` route inserts each submission into a new `marketing_leads` table (service-role client) before sending the existing Resend email best-effort. A founder-gated admin page reads the table and renders an actions component; "Create preview" deep-links into the existing `/preview` wizard via query params, which a new prefill effect consumes. When the wizard generates from a lead, it links the resulting preview group back onto the lead row.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (service role via `createAdminClient`), Tailwind, `node:test` + `tsx` for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-06-marketing-lead-requests-design.md`

**Refinements vs spec (intentional):**
- Lead→preview link column is named `preview_group_id` (not `preview_slug`) because the wizard returns a `group_id` and the compare view is `/preview/compare/<group_id>`.
- `Locs` maps to wizard type `braids` (there is no `locs` wizard type — the wizard has exactly 5: `salon, barbershop, restaurant, nails, braids`).

---

## File Structure

- **Create** `supabase/migrations/030_create_marketing_leads.sql` — table + index + RLS.
- **Modify** `src/lib/marketing-lead.ts` — add `mapMarketingTypeToWizardType()` + `buildWizardPrefillUrl()`.
- **Modify** `src/lib/marketing-lead.test.ts` — tests for the two new helpers.
- **Modify** `src/app/api/marketing-leads/route.ts` — insert lead, then email best-effort.
- **Modify** `src/app/(marketing)/demo/_components/DemoLeadForm.tsx` — optional address field.
- **Modify** `src/middleware.ts` — add `/requests` to `ADMIN_ROUTES`.
- **Modify** `src/app/(admin)/layout.tsx` — "Requests" nav link.
- **Create** `src/app/api/admin/marketing-leads/route.ts` — founder-gated status / link-back update.
- **Create** `src/app/(admin)/requests/page.tsx` — server page (service-role read).
- **Create** `src/app/(admin)/requests/RequestActions.tsx` — client actions component.
- **Modify** `src/app/(marketing)/preview/page.tsx` — prefill-from-lead effect + link-back on generate.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/030_create_marketing_leads.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Ad-form ("Request yours") submissions from /demo and the homepage CTA.
-- Separate from interested_leads (which is the preview-view funnel).
CREATE TABLE IF NOT EXISTS marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name    text NOT NULL,
  email            text NOT NULL,
  phone            text NOT NULL,
  business_address text,
  business_type    text NOT NULL,
  business_link    text,
  notes            text,
  source           text NOT NULL DEFAULT 'demo',   -- 'demo' | 'homepage'
  status           text NOT NULL DEFAULT 'new',     -- 'new' | 'contacted' | 'archived'
  preview_group_id text,                            -- group_id of a preview built from this lead
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at
  ON marketing_leads (created_at DESC);

-- No public policies: all access is via the service-role admin client.
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply the migration**

Apply via the project's normal Supabase migration process (the same one used for `029_tenant_is_demo.sql`). Verify the table exists:

Run (psql against the project DB, or the Supabase SQL editor):
`\d marketing_leads`
Expected: table with the 11 columns above and RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/030_create_marketing_leads.sql
git commit -m "feat: add marketing_leads table"
```

---

## Task 2: Type-mapping + prefill-URL helpers (TDD)

**Files:**
- Modify: `src/lib/marketing-lead.ts`
- Test: `src/lib/marketing-lead.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `src/lib/marketing-lead.test.ts`)

```ts
import {
  mapMarketingTypeToWizardType,
  buildWizardPrefillUrl,
} from "./marketing-lead";

test("mapMarketingTypeToWizardType maps known beauty types to wizard types", () => {
  assert.equal(mapMarketingTypeToWizardType("Braids"), "braids");
  assert.equal(mapMarketingTypeToWizardType("Locs"), "braids");
  assert.equal(mapMarketingTypeToWizardType("Haircuts"), "salon");
  assert.equal(mapMarketingTypeToWizardType("Nails"), "nails");
  assert.equal(mapMarketingTypeToWizardType("Salon"), "salon");
  assert.equal(mapMarketingTypeToWizardType("Hair"), "salon");
  assert.equal(mapMarketingTypeToWizardType("Barber / grooming"), "barbershop");
});

test("mapMarketingTypeToWizardType returns '' for types with no wizard equivalent", () => {
  assert.equal(mapMarketingTypeToWizardType("Lashes / brows"), "");
  assert.equal(mapMarketingTypeToWizardType("Spa / skincare"), "");
  assert.equal(mapMarketingTypeToWizardType("Other beauty business"), "");
  assert.equal(mapMarketingTypeToWizardType("Restaurant"), ""); // not a marketing type at all
});

test("buildWizardPrefillUrl includes mapped type and url-encodes fields", () => {
  const url = buildWizardPrefillUrl({
    id: "abc-123",
    business_name: "Crown & Co",
    business_type: "Nails",
    phone: "555-1234",
    business_address: "1 Main St, Brooklyn",
    business_link: "https://booksy.com/x",
    notes: "loved the demo",
  });
  assert.ok(url.startsWith("/preview?"));
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(qs.get("lead"), "abc-123");
  assert.equal(qs.get("name"), "Crown & Co");
  assert.equal(qs.get("type"), "nails");
  assert.equal(qs.get("phone"), "555-1234");
  assert.equal(qs.get("address"), "1 Main St, Brooklyn");
  assert.equal(qs.get("link"), "https://booksy.com/x");
  assert.equal(qs.get("desc"), "loved the demo");
});

test("buildWizardPrefillUrl omits empty optional fields and unmapped type", () => {
  const url = buildWizardPrefillUrl({
    id: "id-1",
    business_name: "Lash Bar",
    business_type: "Lashes / brows",
    phone: "",
    business_address: null,
    business_link: null,
    notes: null,
  });
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(qs.get("lead"), "id-1");
  assert.equal(qs.get("name"), "Lash Bar");
  assert.equal(qs.has("type"), false);
  assert.equal(qs.has("phone"), false);
  assert.equal(qs.has("address"), false);
  assert.equal(qs.has("link"), false);
  assert.equal(qs.has("desc"), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/marketing-lead.test.ts`
Expected: FAIL — `mapMarketingTypeToWizardType`/`buildWizardPrefillUrl` are not exported.

- [ ] **Step 3: Implement the helpers** (append to `src/lib/marketing-lead.ts`)

```ts
// Wizard business types (src/app/(marketing)/preview/page.tsx). There is no
// "locs" wizard type — loc businesses use the braids template/services.
export type WizardBusinessType =
  | "salon"
  | "barbershop"
  | "restaurant"
  | "nails"
  | "braids";

const MARKETING_TO_WIZARD_TYPE: Record<BusinessType, WizardBusinessType | ""> = {
  Braids: "braids",
  Locs: "braids",
  Haircuts: "salon",
  Nails: "nails",
  Salon: "salon",
  Hair: "salon",
  "Lashes / brows": "",
  "Barber / grooming": "barbershop",
  "Spa / skincare": "",
  "Other beauty business": "",
};

export function mapMarketingTypeToWizardType(
  type: string,
): WizardBusinessType | "" {
  return (MARKETING_TO_WIZARD_TYPE as Record<string, WizardBusinessType | "">)[
    type
  ] ?? "";
}

export function buildWizardPrefillUrl(lead: {
  id: string;
  business_name: string;
  business_type: string;
  phone: string;
  business_address?: string | null;
  business_link?: string | null;
  notes?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("lead", lead.id);
  if (lead.business_name) params.set("name", lead.business_name);
  const wizardType = mapMarketingTypeToWizardType(lead.business_type);
  if (wizardType) params.set("type", wizardType);
  if (lead.phone) params.set("phone", lead.phone);
  if (lead.business_address) params.set("address", lead.business_address);
  if (lead.business_link) params.set("link", lead.business_link);
  if (lead.notes) params.set("desc", lead.notes);
  return `/preview?${params.toString()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/marketing-lead.test.ts`
Expected: PASS — all tests (existing + 4 new) green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing-lead.ts src/lib/marketing-lead.test.ts
git commit -m "feat: add marketing-lead -> wizard type mapping and prefill URL"
```

---

## Task 3: Persist leads in the API route

**Files:**
- Modify: `src/app/api/marketing-leads/route.ts`

- [ ] **Step 1: Add the admin-client import** (top of file, after the existing imports)

```ts
import { createAdminClient } from "@/lib/supabase/admin";
```

- [ ] **Step 2: Insert the lead before emailing.** Replace the block that currently starts at `if (!resend || !ADMIN_EMAIL) {` … through the end of the `await resend.emails.send({ … });` call and the final `return`, with the following. (Keep everything above — rate limit, `parseMarketingLead`, and the `const { businessName, … } = parsed.value;` destructure — unchanged.)

```ts
  // 1) Persist the lead first so it is captured even if email is unconfigured
  //    or Resend fails. Service-role insert bypasses RLS (matches /api/leads).
  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("marketing_leads").insert({
    business_name: businessName,
    email,
    phone,
    business_address: businessAddress || null,
    business_type: businessType,
    business_link: businessLink || null,
    notes: notes || null,
    source,
  });
  if (insertError) {
    // Don't lose the lead to the user — log and continue to email.
    console.error("marketing_leads insert failed", insertError);
  }

  // 2) Email the founder, best-effort. Never fail the request on email errors.
  if (!resend || !ADMIN_EMAIL) {
    console.log(
      "Skipping marketing lead email — RESEND_API_KEY or ADMIN_EMAIL not set",
      { businessName, email, phone, businessType, source },
    );
    return NextResponse.json({ ok: true });
  }

  const safeBusinessName = escapeHtml(businessName);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone);
  const safeAddress = businessAddress ? escapeHtml(businessAddress) : "";
  const safeBusinessType = escapeHtml(businessType);
  const safeBusinessLink = businessLink ? escapeHtml(businessLink) : "";
  const safeNotes = notes ? escapeHtml(notes) : "";
  const safeSource = escapeHtml(source);

  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      replyTo: email,
      subject:
        source === "demo"
          ? `New demo request: ${businessName}`
          : `New site request: ${businessName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto;">
          <div style="background: #db2777; padding: 20px 24px; border-radius: 16px 16px 0 0;">
            <p style="margin: 0 0 4px; color: rgba(255,255,255,0.78); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700;">SiteForOwners lead</p>
            <h1 style="margin: 0; color: #fff8ee; font-size: 22px;">${safeBusinessName}</h1>
          </div>
          <div style="background: #fff; border: 1px solid #f3d6e4; border-top: 0; padding: 24px; border-radius: 0 0 16px 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; width: 132px; color: #6b7280; font-size: 14px;">Business type</td>
                <td style="padding: 8px 0; color: #111827; font-weight: 700;">${safeBusinessType}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; width: 132px; color: #6b7280; font-size: 14px;">Source</td>
                <td style="padding: 8px 0; color: #111827; font-weight: 700;">${safeSource}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email</td>
                <td style="padding: 8px 0;"><a href="mailto:${safeEmail}" style="color: #db2777;">${safeEmail}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td>
                <td style="padding: 8px 0;"><a href="tel:${safePhone}" style="color: #db2777;">${safePhone}</a></td>
              </tr>
              ${safeAddress ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Address</td>
                  <td style="padding: 8px 0; color: #111827;">${safeAddress}</td>
                </tr>
              ` : ""}
              ${safeBusinessLink ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Link</td>
                  <td style="padding: 8px 0;"><a href="${safeBusinessLink}" style="color: #db2777;">${safeBusinessLink}</a></td>
                </tr>
              ` : ""}
              ${safeNotes ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Notes</td>
                  <td style="padding: 8px 0; color: #111827;">${safeNotes}</td>
                </tr>
              ` : ""}
            </table>
            <p style="margin: 20px 0 0; color: #6b7280; font-size: 13px;">Reply to this email to contact the lead directly. View it in the admin Requests tab.</p>
          </div>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("marketing lead email failed", emailError);
  }

  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, submit the form at `/demo#request-yours`, then confirm a new row in `marketing_leads` (Supabase SQL editor: `select * from marketing_leads order by created_at desc limit 1;`). Expected: the row matches what was submitted; the request returns `{ ok: true }`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/marketing-leads/route.ts
git commit -m "feat: persist marketing leads before emailing"
```

---

## Task 4: Add optional address field to the form

**Files:**
- Modify: `src/app/(marketing)/demo/_components/DemoLeadForm.tsx`

- [ ] **Step 1: Send `businessAddress` in the payload.** In `onSubmit`, add the field to the `payload` object (after the `phone` line):

```ts
      businessAddress: String(formData.get("businessAddress") ?? ""),
```

- [ ] **Step 2: Add the address input.** Immediately after the `businessType` `<label>…</label>` block (the `<select name="businessType">` wrapper) and before the `Instagram, website, or booking link` `DemoField`, insert:

```tsx
            <DemoField
              label="Business address"
              name="businessAddress"
              autoComplete="street-address"
            />
```

(Note: `DemoField` is not `required`, so the address stays optional.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual verification**

In `npm run dev`, load `/demo#request-yours`. Expected: a "Business address" field appears between Business type and the link field; submitting with an address stores it in `marketing_leads.business_address`; submitting without one still succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/demo/_components/DemoLeadForm.tsx"
git commit -m "feat: collect optional business address on request form"
```

---

## Task 5: Admin route gating + nav link

**Files:**
- Modify: `src/middleware.ts:7`
- Modify: `src/app/(admin)/layout.tsx`

- [ ] **Step 1: Add `/requests` to `ADMIN_ROUTES`.** Replace the line at `src/middleware.ts:7`:

```ts
const ADMIN_ROUTES = ["/prospects", "/clients", "/previews", "/onboard"];
```

with:

```ts
const ADMIN_ROUTES = ["/prospects", "/clients", "/previews", "/requests", "/onboard"];
```

- [ ] **Step 2: Add the nav link.** In `src/app/(admin)/layout.tsx`, inside the `<nav>` block, add a "Requests" link immediately after the "Prospects" `<Link>` (so order is Prospects, Requests, Clients, Previews):

```tsx
              <Link
                href="/requests"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Requests
              </Link>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts "src/app/(admin)/layout.tsx"
git commit -m "feat: gate and link admin requests tab"
```

---

## Task 6: Admin update route (status + link-back)

**Files:**
- Create: `src/app/api/admin/marketing-leads/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["new", "contacted", "archived"]);

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

// Update a marketing lead's status and/or link a generated preview group to it.
export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (typeof body.preview_group_id === "string" && body.preview_group_id.trim()) {
    updates.preview_group_id = body.preview_group_id.trim();
    // Building a preview implies the lead has been actioned.
    if (!updates.status) updates.status = "contacted";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("marketing_leads")
    .update(updates)
    .eq("id", leadId);
  if (error) {
    console.error("[admin/marketing-leads] update failed", { leadId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/marketing-leads/route.ts
git commit -m "feat: admin route to update marketing lead status"
```

---

## Task 7: Admin Requests page + actions

**Files:**
- Create: `src/app/(admin)/requests/page.tsx`
- Create: `src/app/(admin)/requests/RequestActions.tsx`

- [ ] **Step 1: Write the actions component** (`src/app/(admin)/requests/RequestActions.tsx`)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RequestActionsProps {
  leadId: string;
  previewHref: string;
  status: string;
  previewGroupId: string | null;
}

export function RequestActions({
  leadId,
  previewHref,
  status,
  previewGroupId,
}: RequestActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (next: "contacted" | "archived" | "new") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/marketing-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <a
        href={previewHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
      >
        Create preview
      </a>

      {previewGroupId && (
        <a
          href={`/preview/compare/${previewGroupId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-amber-600 hover:underline"
        >
          View preview
        </a>
      )}

      <div className="flex items-center gap-2">
        {status !== "contacted" && (
          <button
            onClick={() => setStatus("contacted")}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            Mark contacted
          </button>
        )}
        {status !== "archived" ? (
          <button
            onClick={() => setStatus("archived")}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
          >
            Archive
          </button>
        ) : (
          <button
            onClick={() => setStatus("new")}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            Unarchive
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write the page** (`src/app/(admin)/requests/page.tsx`)

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { buildWizardPrefillUrl } from "@/lib/marketing-lead";
import { RequestActions } from "./RequestActions";

interface MarketingLead {
  id: string;
  business_name: string;
  email: string;
  phone: string;
  business_address: string | null;
  business_type: string;
  business_link: string | null;
  notes: string | null;
  source: string;
  status: string;
  preview_group_id: string | null;
  created_at: string;
}

async function getRequests(): Promise<MarketingLead[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketing_leads")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Failed to fetch marketing leads:", error);
    return [];
  }
  return (data || []) as MarketingLead[];
}

async function getRequestStats() {
  const supabase = createAdminClient();

  const { count: total } = await supabase
    .from("marketing_leads")
    .select("*", { count: "exact", head: true });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: weekCount } = await supabase
    .from("marketing_leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString());

  const { count: newCount } = await supabase
    .from("marketing_leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "new");

  return {
    total: total || 0,
    thisWeek: weekCount || 0,
    new: newCount || 0,
  };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const revalidate = 0;

export default async function RequestsPage() {
  const [leads, stats] = await Promise.all([getRequests(), getRequestStats()]);

  return (
    <div>
      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Total Requests</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">This Week</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{stats.thisWeek}</p>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">New</p>
          <p className="mt-1 text-3xl font-bold text-amber-600">{stats.new}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ad Requests</h1>
        <p className="text-sm text-gray-400">{leads.length} results</p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <p className="text-gray-400">
            No requests yet. They’ll appear here when someone submits the
            “Request yours” form.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Contact</th>
                <th className="hidden px-5 py-3 md:table-cell">Link</th>
                <th className="hidden px-5 py-3 lg:table-cell">Notes</th>
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900">
                      {lead.business_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {lead.business_type}
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                        {lead.source}
                      </span>
                    </p>
                    {lead.business_address && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {lead.business_address}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <a
                      href={`tel:${lead.phone}`}
                      className="block text-sm font-medium text-blue-600 hover:underline"
                    >
                      {lead.phone}
                    </a>
                    <a
                      href={`mailto:${lead.email}`}
                      className="block text-xs text-gray-400 hover:underline"
                    >
                      {lead.email}
                    </a>
                  </td>
                  <td className="hidden px-5 py-4 md:table-cell">
                    {lead.business_link ? (
                      <a
                        href={lead.business_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-amber-600 hover:underline"
                      >
                        Open link
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="hidden max-w-xs truncate px-5 py-4 text-sm text-gray-500 lg:table-cell">
                    {lead.notes || "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">
                    {timeAgo(lead.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <RequestActions
                      leadId={lead.id}
                      previewHref={buildWizardPrefillUrl(lead)}
                      status={lead.status}
                      previewGroupId={lead.preview_group_id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0; no errors for the new files.

- [ ] **Step 4: Manual verification**

Log in at `/login`, visit `/requests`. Expected: stat cards render; any submitted leads appear; "Create preview" opens `/preview?...` in a new tab; "Archive" removes the row from the list (after refresh); "Mark contacted" updates status.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/requests/page.tsx" "src/app/(admin)/requests/RequestActions.tsx"
git commit -m "feat: admin requests tab for ad-form leads"
```

---

## Task 8: Wizard prefill from lead + link-back on generate

**Files:**
- Modify: `src/app/(marketing)/preview/page.tsx`

- [ ] **Step 1: Capture the `lead` param.** In `PreviewWizard`, right after the existing line `const editGroupId = searchParams.get("edit");` (≈ line 129), add:

```ts
  const leadId = searchParams.get("lead");
```

- [ ] **Step 2: Add the prefill-from-lead effect.** Immediately after the closing of the existing `useEffect(() => { … }, [editGroupId]);` edit-loader block (≈ line 273), insert a new effect:

```ts
  // Prefill from an admin "Create preview" deep link (?lead=…&name=…&type=…).
  // Edit mode (?edit=) takes precedence and skips this.
  useEffect(() => {
    if (editGroupId) return;
    const name = searchParams.get("name");
    const type = searchParams.get("type");
    const ph = searchParams.get("phone");
    const addr = searchParams.get("address");
    const link = searchParams.get("link");
    const desc = searchParams.get("desc");
    if (!name && !type && !ph && !addr && !link && !desc) return;

    if (name) setBusinessName(name);
    if (type && BUSINESS_TYPES.some((bt) => bt.value === type)) {
      setBusinessType(type as BusinessType);
    }
    if (ph) setPhone(ph);
    if (addr) setAddress(addr);
    if (desc) setDescription(desc);
    if (link) setImportUrl(link);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Link the generated preview back to the lead.** In `handleGenerate`, locate the success block:

```ts
        const data = await res.json();
        router.push(`/preview/compare/${data.group_id}`);
        return;
```

Replace it with:

```ts
        const data = await res.json();
        if (leadId && data.group_id) {
          // Best-effort: tag the lead with this preview group. Only succeeds
          // when the founder is logged into admin (same-domain cookie).
          fetch("/api/admin/marketing-leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadId,
              preview_group_id: data.group_id,
            }),
          }).catch(() => {});
        }
        router.push(`/preview/compare/${data.group_id}`);
        return;
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0.

- [ ] **Step 5: Manual verification**

From `/requests`, click "Create preview" on a lead. Expected: the wizard step 1 shows the business name, mapped type selected (or none for Lashes/Spa/Other), phone, address, and notes prefilled, with the link in the Quick Import box. Generating a design redirects to the compare view; back in `/requests` the lead now shows "View preview" and status `contacted`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(marketing)/preview/page.tsx"
git commit -m "feat: prefill preview wizard from a request and link back"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run unit tests**

Run: `npx tsx --test src/lib/marketing-lead.test.ts`
Expected: PASS (all existing + new helper tests).

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all exit 0; `/requests` shows in the build output as a route under the `(admin)` group.

- [ ] **Step 3: End-to-end smoke (manual)**

1. Submit `/demo#request-yours` (with and without address) → row in `marketing_leads`, founder email received (if Resend configured).
2. `/requests` lists it under "New".
3. "Create preview" → wizard prefilled → generate → redirect to compare.
4. `/requests` shows the lead as `contacted` with a working "View preview" link.
5. "Archive" hides it; "Unarchive" restores it.

---

## Self-Review notes

- **Spec coverage:** persistence (Task 1, 3), email kept (Task 3), form address (Task 4), admin tab + gating (Task 5, 7), status actions (Task 6, 7), prefill wizard (Task 2, 8), link-back (Task 6, 8). All covered.
- **Naming consistency:** `preview_group_id` used identically in the migration, admin route, page, RequestActions prop (`previewGroupId`), and wizard link-back body. Helper names `mapMarketingTypeToWizardType` / `buildWizardPrefillUrl` match across Task 2, 7.
- **Type safety:** wizard prefill validates `type` against `BUSINESS_TYPES` before casting to `BusinessType`; mapping only emits the 5 valid wizard types.
