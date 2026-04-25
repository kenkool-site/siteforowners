# Owner Admin Features — Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three day-to-day action tabs on the owner admin dashboard: **Leads**, **Orders**, and **Schedule**. After this plan, owners can triage contact-form leads, transition pickup orders through their lifecycle, and view/edit the internal booking schedule + working hours.

**Architecture:** Each feature page is a server component that queries the relevant table, then delegates row-level interactions (mark read, status change, action sheet) to small client components. Optimistic UI via local state; server mutations via POST endpoints that validate the owner session + tenant ownership of the row. Contact form on published tenant sites gets a dedicated `/api/contact` endpoint (tenant derived from Host, same pattern as `/api/track`).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (service-role only), Tailwind. Tests use Node's built-in `node:test` via `tsx`. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-04-24-owner-admin-design.md`
**Builds on:** Plans 1+2 (PRs #32+#33+#34+#35 merged). Rate-limit infrastructure from `api-rate-limit.ts` is available.

---

## Environment variables
No new env vars.

---

## File Structure

### Create

**Leads (5 files):**
- `src/app/api/contact/route.ts` — public tenant-site contact form POST
- `src/app/api/admin/leads/read/route.ts` — owner marks a lead read/unread
- `src/app/site/[slug]/admin/leads/page.tsx` — server-rendered list
- `src/app/site/[slug]/admin/_components/LeadRow.tsx` — client, optimistic read-toggle

**Orders (3 files):**
- `src/app/api/admin/orders/status/route.ts` — transition status
- `src/app/site/[slug]/admin/orders/page.tsx` — server, active/history tabs via `?tab=`
- `src/app/site/[slug]/admin/_components/OrdersList.tsx` — client, drawer state + rows
- `src/app/site/[slug]/admin/_components/OrderDetailDrawer.tsx` — client, detail + status action

**Schedule (6 files):**
- `src/app/api/admin/bookings/status/route.ts`
- `src/app/api/admin/bookings/block-date/route.ts`
- `src/app/api/admin/bookings/hours/route.ts`
- `src/app/site/[slug]/admin/schedule/page.tsx` — server, today/upcoming/hours tabs via `?tab=`
- `src/app/site/[slug]/admin/_components/BookingRow.tsx` — client, row + action sheet
- `src/app/site/[slug]/admin/_components/HoursEditor.tsx` — client, weekly schedule form
- `src/app/site/[slug]/admin/_components/BlockDateDialog.tsx` — client, date multi-picker

**Shared:**
- `src/lib/admin-bookings.ts` — server-side grouping/fetching helpers (+ test for date grouping)

### Modify
- `src/components/templates/TemplateContact.tsx` — wire the form to POST `/api/contact`, with loading + error states

### Responsibility per file
- `/api/contact` is the **only** public endpoint that writes `contact_leads`.
- `/api/admin/leads/read`, `/api/admin/orders/status`, `/api/admin/bookings/*` are the **only** endpoints that mutate their respective tables; all require `requireOwnerSession` + verify the row belongs to the session's tenant.
- `admin-bookings.ts` is the **only** module that knows how to group bookings into Today/Upcoming buckets.

---

## Shared patterns for all admin mutation routes

Every `/api/admin/*` POST in this plan follows the same skeleton:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  // ... validate body fields, verify row ownership, perform mutation ...
}
```

Ownership check pattern (prevents tenant A from mutating tenant B's row):
```ts
const supabase = createAdminClient();
const { data: row } = await supabase
  .from(TABLE)
  .select("tenant_id")
  .eq("id", rowId)
  .maybeSingle();
if (!row || row.tenant_id !== session.tenant.id) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

Every task below uses these two patterns verbatim; I won't re-explain them.

---

## Task 1: /api/contact endpoint

**Files:**
- Create: `src/app/api/contact/route.ts`

Public tenant-site contact form submissions. Tenant derived from Host header (same pattern as `/api/track`). Rate-limited via the existing `checkRateLimit` — 10 submissions per hour per (tenant, IP).

- [ ] **Step 1: Implement**

Create `src/app/api/contact/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, hashIp, getClientIp } from "@/lib/api-rate-limit";

const CONTACT_WINDOW_SECONDS = 60 * 60; // 1 hour
const CONTACT_MAX_REQUESTS = 10;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(
    `contact:${tenant.id}:${ipHash}`,
    CONTACT_WINDOW_SECONDS,
    CONTACT_MAX_REQUESTS
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const name = str(b.name);
  const message = str(b.message);
  const phone = str(b.phone);
  const email = str(b.email);
  const source_page = str(b.source_page);

  if (!name || !message) {
    return NextResponse.json({ error: "Name and message are required" }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: "Phone or email is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("contact_leads").insert({
    tenant_id: tenant.id,
    name,
    phone,
    email,
    message,
    source_page,
  });
  if (error) {
    console.error("[api/contact] insert failed", { tenantId: tenant.id, error });
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/app/api/contact/route.ts
git commit -m "feat(owner-admin): POST /api/contact for tenant site contact form"
```

---

## Task 2: Wire TemplateContact form to /api/contact

**Files:**
- Modify: `src/components/templates/TemplateContact.tsx`

The form currently has uncontrolled inputs (no `name` attributes) and a no-op submit handler with a `// TODO: Wire to /api/leads in Week 2` comment. Add `name` attributes, read via `FormData`, POST to `/api/contact`, and handle loading + error states.

- [ ] **Step 1: Update the component**

Open `src/components/templates/TemplateContact.tsx`. Make these changes:

1. Add state for loading + error at the top of the component (near the existing `const [submitted, setSubmitted] = useState(false);`):

```tsx
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

2. Replace the entire `handleSubmit` function:

```tsx
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (previewMode) {
    setSubmitted(true);
    return;
  }
  const form = e.currentTarget;
  const fd = new FormData(form);
  const payload = {
    name: fd.get("name"),
    phone: fd.get("phone"),
    email: fd.get("email"),
    message: fd.get("message"),
    source_page: typeof window !== "undefined" ? window.location.pathname : null,
  };

  setLoading(true);
  setError(null);
  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data && data.error) || "Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  } catch {
    setError("Network error. Please try again.");
  } finally {
    setLoading(false);
  }
};
```

3. Add `name` attributes to each input/textarea inside the `<form>`. The order of existing inputs is: Name → Phone → Email → Message. Add:
   - `name="name"` to the first `<input type="text">`
   - `name="phone"` to the `<input type="tel">`
   - `name="email"` to the `<input type="email">`
   - `name="message"` to the `<textarea>`

4. Insert an error banner below the title (before the form), rendered when `error` is set:

```tsx
{error && (
  <div
    className="mb-4 rounded-lg border px-4 py-2 text-sm"
    style={{ borderColor: "#dc2626", color: "#dc2626", backgroundColor: "#fee2e2" }}
    role="alert"
  >
    {error}
  </div>
)}
```

5. Update the submit button — change `<Button type="submit"` to include `disabled={loading}`, and change the child text from `Send Message` to `{loading ? "Sending..." : "Send Message"}`.

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/components/templates/TemplateContact.tsx
git commit -m "feat(owner-admin): wire TemplateContact form to /api/contact"
```

---

## Task 3: /api/admin/leads/read route

**Files:**
- Create: `src/app/api/admin/leads/read/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/admin/leads/read/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const leadId = typeof b.leadId === "string" ? b.leadId : "";
  const isRead = b.isRead === true;
  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("contact_leads")
    .select("tenant_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("contact_leads")
    .update({ is_read: isRead })
    .eq("id", leadId);
  if (error) {
    console.error("[admin/leads/read] update failed", { leadId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/leads/read/route.ts
git commit -m "feat(owner-admin): POST /api/admin/leads/read"
```

---

## Task 4: Leads page + LeadRow component

**Files:**
- Create: `src/app/site/[slug]/admin/leads/page.tsx`
- Create: `src/app/site/[slug]/admin/_components/LeadRow.tsx`

- [ ] **Step 1: Create the LeadRow (client component)**

Create `src/app/site/[slug]/admin/_components/LeadRow.tsx`:

```tsx
"use client";

import { useState } from "react";

export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source_page: string | null;
  is_read: boolean;
  created_at: string;
};

function formatRelative(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " hr ago";
  const d = Math.round(h / 24);
  if (d < 7) return d + " day" + (d === 1 ? "" : "s") + " ago";
  return new Date(iso).toLocaleDateString();
}

export function LeadRow({ lead }: { lead: Lead }) {
  const [isRead, setIsRead] = useState(lead.is_read);

  async function markRead() {
    if (isRead) return;
    setIsRead(true); // optimistic
    try {
      const res = await fetch("/api/admin/leads/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, isRead: true }),
      });
      if (!res.ok) setIsRead(false); // rollback
    } catch {
      setIsRead(false);
    }
  }

  return (
    <div
      className={
        "px-4 py-3 border-b border-gray-100 last:border-b-0 " +
        (isRead ? "opacity-60" : "")
      }
      onClick={markRead}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            <span>{lead.name}</span>
            {!isRead && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-600 text-white">
                NEW
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            {lead.phone && (
              <a
                href={"tel:" + lead.phone}
                onClick={(e) => e.stopPropagation()}
                className="text-pink-700 underline"
              >
                {lead.phone}
              </a>
            )}
            {lead.email && (
              <a
                href={"mailto:" + lead.email}
                onClick={(e) => e.stopPropagation()}
                className="text-pink-700 underline"
              >
                {lead.email}
              </a>
            )}
            <span>{formatRelative(lead.created_at)}</span>
          </div>
          {lead.message && (
            <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{lead.message}</div>
          )}
          {lead.source_page && (
            <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
              from {lead.source_page}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the page (server component)**

Create `src/app/site/[slug]/admin/leads/page.tsx`:

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { notFound } from "next/navigation";
import { LeadRow, Lead } from "../_components/LeadRow";

export const dynamic = "force-dynamic";

async function getLeads(tenantId: string): Promise<Lead[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contact_leads")
    .select("id, name, phone, email, message, source_page, is_read, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin/leads] fetch failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as Lead[];
}

export default async function LeadsPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const leads = await getLeads(tenant.id);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Leads</div>
        <div className="text-xs text-gray-500">{leads.length} total</div>
      </div>
      <div className="px-3 md:px-8 mt-4">
        {leads.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No leads yet. Messages from your contact form will show up here.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg">
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/leads/page.tsx' 'src/app/site/[slug]/admin/_components/LeadRow.tsx'
git commit -m "feat(owner-admin): Leads page with tap-to-mark-read"
```

---

## Task 5: /api/admin/orders/status route

**Files:**
- Create: `src/app/api/admin/orders/status/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/admin/orders/status/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Allowed transitions. Terminal statuses have no outgoing transitions.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  new: ["ready", "canceled"],
  ready: ["picked_up", "canceled"],
  picked_up: [],
  canceled: [],
};

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const orderId = typeof b.orderId === "string" ? b.orderId : "";
  const toStatus = typeof b.toStatus === "string" ? b.toStatus : "";

  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  if (!["new", "ready", "picked_up", "canceled"].includes(toStatus)) {
    return NextResponse.json({ error: "invalid toStatus" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("orders")
    .select("tenant_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentStatus = row.status as string;
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowedNext.includes(toStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${currentStatus} to ${toStatus}` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    console.error("[admin/orders/status] update failed", { orderId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/orders/status/route.ts
git commit -m "feat(owner-admin): POST /api/admin/orders/status with transition validation"
```

---

## Task 6: Orders page + list + drawer components

**Files:**
- Create: `src/app/site/[slug]/admin/orders/page.tsx`
- Create: `src/app/site/[slug]/admin/_components/OrdersList.tsx`
- Create: `src/app/site/[slug]/admin/_components/OrderDetailDrawer.tsx`

The drawer uses optimistic UI: click "Mark ready" → immediately update local state + close button label → fire API → rollback on error.

- [ ] **Step 1: Create the OrderDetailDrawer (client)**

Create `src/app/site/[slug]/admin/_components/OrderDetailDrawer.tsx`:

```tsx
"use client";

import { useState } from "react";

export type OrderItem = { name?: string; qty?: number; price_cents?: number };

export type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_notes: string | null;
  items: OrderItem[];
  subtotal_cents: number;
  status: "new" | "ready" | "picked_up" | "canceled";
  created_at: string;
};

const NEXT_LABEL: Record<Order["status"], string> = {
  new: "Mark ready",
  ready: "Mark picked up",
  picked_up: "Picked up ✓",
  canceled: "Canceled",
};
const NEXT_STATUS: Record<Order["status"], Order["status"] | null> = {
  new: "ready",
  ready: "picked_up",
  picked_up: null,
  canceled: null,
};

function formatRelative(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " hr ago";
  const d = Math.round(h / 24);
  return d + " day" + (d === 1 ? "" : "s") + " ago";
}

export function OrderDetailDrawer({
  order,
  onClose,
  onChange,
}: {
  order: Order;
  onClose: () => void;
  onChange: (next: Order) => void;
}) {
  const [pending, setPending] = useState(false);

  async function transition(toStatus: Order["status"]) {
    if (pending) return;
    const prev = order;
    const optimistic = { ...order, status: toStatus };
    onChange(optimistic); // optimistic
    setPending(true);
    try {
      const res = await fetch("/api/admin/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, toStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Could not update order");
        onChange(prev); // rollback
      }
    } catch {
      alert("Network error");
      onChange(prev);
    } finally {
      setPending(false);
    }
  }

  const primaryNext = NEXT_STATUS[order.status];
  const canCancel = order.status === "new" || order.status === "ready";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl md:mb-10 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded mx-auto mb-3 md:hidden" />
        <div className="flex justify-between items-start">
          <div>
            <div className="text-base font-semibold">{order.customer_name}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              <a href={"tel:" + order.customer_phone} className="text-pink-700 underline">
                {order.customer_phone}
              </a>
              {" · "}
              {formatRelative(order.created_at)}
            </div>
          </div>
          <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " +
            (order.status === "new" ? "bg-pink-100 text-pink-700"
              : order.status === "ready" ? "bg-amber-100 text-amber-700"
              : order.status === "picked_up" ? "bg-green-100 text-green-700"
              : "bg-gray-200 text-gray-600")}
          >
            {order.status.replace("_", " ").toUpperCase()}
          </span>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
          {order.items.map((it, i) => (
            <div key={i} className="flex justify-between py-1">
              <span>
                {(it.name ?? "Item")}{it.qty ? " × " + it.qty : ""}
              </span>
              <span>${(((it.price_cents ?? 0) * (it.qty ?? 1)) / 100).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold pt-2 mt-1 border-t border-gray-100">
            <span>Subtotal</span>
            <span>${(order.subtotal_cents / 100).toFixed(2)}</span>
          </div>
        </div>

        {order.customer_notes && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
            <span className="font-semibold">Notes: </span>
            {order.customer_notes}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={pending || primaryNext === null}
            onClick={() => primaryNext && transition(primaryNext)}
            className="w-full bg-pink-600 text-white font-medium py-3 rounded-lg disabled:opacity-50"
          >
            {NEXT_LABEL[order.status]}
          </button>
          <div className="flex gap-2">
            <a
              href={"tel:" + order.customer_phone}
              className="flex-1 text-center text-sm font-medium text-pink-700 border border-pink-600 rounded-lg py-2"
            >
              📞 Call
            </a>
            {canCancel && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("Cancel this order?")) transition("canceled");
                }}
                className="flex-1 text-sm font-medium text-red-600 border border-red-600 rounded-lg py-2 disabled:opacity-50"
              >
                Cancel order
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the OrdersList (client)**

Create `src/app/site/[slug]/admin/_components/OrdersList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Order, OrderDetailDrawer } from "./OrderDetailDrawer";

const STATUS_PILL: Record<Order["status"], string> = {
  new: "bg-pink-100 text-pink-700",
  ready: "bg-amber-100 text-amber-700",
  picked_up: "bg-green-100 text-green-700",
  canceled: "bg-gray-200 text-gray-600",
};

export function OrdersList({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [openId, setOpenId] = useState<string | null>(null);
  const openOrder = openId ? orders.find((o) => o.id === openId) ?? null : null;

  function patch(next: Order) {
    setOrders((list) => list.map((o) => (o.id === next.id ? next : o)));
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
        No orders here yet.
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg">
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOpenId(o.id)}
            className="w-full px-4 py-3 border-b border-gray-100 last:border-b-0 text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {o.customer_name} · ${(o.subtotal_cents / 100).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {o.items.length} item{o.items.length === 1 ? "" : "s"}
                </div>
              </div>
              <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + STATUS_PILL[o.status]}>
                {o.status.replace("_", " ").toUpperCase()}
              </span>
            </div>
          </button>
        ))}
      </div>
      {openOrder && (
        <OrderDetailDrawer
          order={openOrder}
          onClose={() => setOpenId(null)}
          onChange={patch}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Create the page (server)**

Create `src/app/site/[slug]/admin/orders/page.tsx`:

```tsx
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { notFound } from "next/navigation";
import { OrdersList } from "../_components/OrdersList";
import type { Order } from "../_components/OrderDetailDrawer";

export const dynamic = "force-dynamic";

async function getOrders(tenantId: string, tab: "active" | "history"): Promise<Order[]> {
  const supabase = createAdminClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const query = supabase
    .from("orders")
    .select("id, customer_name, customer_phone, customer_email, customer_notes, items, subtotal_cents, status, created_at")
    .eq("tenant_id", tenantId);

  if (tab === "active") {
    query.in("status", ["new", "ready"]).order("created_at", { ascending: false });
  } else {
    query.in("status", ["picked_up", "canceled"]).lt("created_at", todayStartIso).order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/orders] fetch failed", { tenantId, tab, error });
    return [];
  }
  return (data ?? []) as Order[];
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const tab = searchParams.tab === "history" ? "history" : "active";
  const orders = await getOrders(tenant.id, tab);

  const tabClass = (active: boolean) =>
    "px-4 py-2 text-sm border-b-2 " +
    (active ? "border-pink-600 text-pink-700 font-medium" : "border-transparent text-gray-500");

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Orders</div>
      </div>
      <div className="px-4 md:px-8 mt-3 flex gap-2 border-b border-gray-200">
        <Link href="?tab=active" className={tabClass(tab === "active")}>Active</Link>
        <Link href="?tab=history" className={tabClass(tab === "history")}>History</Link>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <OrdersList initialOrders={orders} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type check + commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/orders/page.tsx' 'src/app/site/[slug]/admin/_components/OrdersList.tsx' 'src/app/site/[slug]/admin/_components/OrderDetailDrawer.tsx'
git commit -m "feat(owner-admin): Orders page with Active/History tabs + detail drawer"
```

---

## Task 7: /api/admin/bookings/status route

**Files:**
- Create: `src/app/api/admin/bookings/status/route.ts`

Allowed statuses: `confirmed | completed | canceled | no_show`. Any transition to any of these is allowed (owners may correct mistakes).

- [ ] **Step 1: Implement**

Create `src/app/api/admin/bookings/status/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["confirmed", "completed", "canceled", "no_show"];

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
    .select("tenant_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!row || row.tenant_id !== session.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: toStatus })
    .eq("id", bookingId);
  if (error) {
    console.error("[admin/bookings/status] update failed", { bookingId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/bookings/status/route.ts
git commit -m "feat(owner-admin): POST /api/admin/bookings/status"
```

---

## Task 8: /api/admin/bookings/block-date route

**Files:**
- Create: `src/app/api/admin/bookings/block-date/route.ts`

Writes to `booking_settings.blocked_dates` (text[]). Supports both add (mode:"add") and remove (mode:"remove").

- [ ] **Step 1: Implement**

Create `src/app/api/admin/bookings/block-date/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const mode = b.mode === "remove" ? "remove" : "add";
  const dates = Array.isArray(b.dates) ? b.dates.filter((d) => typeof d === "string" && ISO_DATE_RE.test(d)) as string[] : [];
  if (dates.length === 0) {
    return NextResponse.json({ error: "dates required (YYYY-MM-DD)" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("booking_settings")
    .select("blocked_dates")
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  const existing = new Set(((row?.blocked_dates as string[] | null) ?? []));
  if (mode === "add") dates.forEach((d) => existing.add(d));
  else dates.forEach((d) => existing.delete(d));
  const next = Array.from(existing).sort();

  const { error } = await supabase
    .from("booking_settings")
    .upsert(
      { tenant_id: session.tenant.id, blocked_dates: next, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    );
  if (error) {
    console.error("[admin/bookings/block-date] upsert failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, blocked_dates: next });
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/bookings/block-date/route.ts
git commit -m "feat(owner-admin): POST /api/admin/bookings/block-date"
```

---

## Task 9: /api/admin/bookings/hours route

**Files:**
- Create: `src/app/api/admin/bookings/hours/route.ts`

Writes `booking_settings.working_hours` JSON. Shape: `Record<Weekday, { open: string, close: string } | null>` where `null` means closed. Weekdays: Monday..Sunday.

- [ ] **Step 1: Implement**

Create `src/app/api/admin/bookings/hours/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_RE = /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i;

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

function sanitize(raw: unknown): WorkingHours | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: WorkingHours = {};
  for (const day of WEEKDAYS) {
    const v = r[day];
    if (v === null || v === undefined) {
      out[day] = null;
      continue;
    }
    if (typeof v !== "object") return null;
    const d = v as Record<string, unknown>;
    if (typeof d.open !== "string" || typeof d.close !== "string") return null;
    if (!TIME_RE.test(d.open) || !TIME_RE.test(d.close)) return null;
    out[day] = { open: d.open, close: d.close };
  }
  return out;
}

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const hours = sanitize((body as Record<string, unknown>).hours);
  if (!hours) return NextResponse.json({ error: "Invalid hours shape" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("booking_settings")
    .upsert(
      { tenant_id: session.tenant.id, working_hours: hours, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" }
    );
  if (error) {
    console.error("[admin/bookings/hours] upsert failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/bookings/hours/route.ts
git commit -m "feat(owner-admin): POST /api/admin/bookings/hours"
```

---

## Task 10: Bookings helper module (TDD for date grouping)

**Files:**
- Create: `src/lib/admin-bookings.ts`
- Create: `src/lib/admin-bookings.test.ts`

Groups bookings by date into sections; the pure helper is unit-tested.

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin-bookings.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBookingsByDate, BookingRow } from "./admin-bookings";

function b(id: string, date: string, time = "10:00 AM"): BookingRow {
  return {
    id,
    booking_date: date,
    booking_time: time,
    customer_name: "Cust",
    customer_phone: "555",
    service_name: "Svc",
    status: "confirmed",
  };
}

test("groupBookingsByDate: groups rows by date, sorted ascending", () => {
  const rows = [
    b("3", "2026-04-26"),
    b("1", "2026-04-24"),
    b("2", "2026-04-24"),
    b("4", "2026-04-25"),
  ];
  const groups = groupBookingsByDate(rows);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].date, "2026-04-24");
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[1].date, "2026-04-25");
  assert.equal(groups[2].date, "2026-04-26");
});

test("groupBookingsByDate: empty input returns empty array", () => {
  assert.deepEqual(groupBookingsByDate([]), []);
});

test("groupBookingsByDate: preserves row order within a date group", () => {
  const rows = [b("a", "2026-04-24", "10:00 AM"), b("b", "2026-04-24", "2:00 PM")];
  const groups = groupBookingsByDate(rows);
  assert.equal(groups[0].rows[0].id, "a");
  assert.equal(groups[0].rows[1].id, "b");
});
```

- [ ] **Step 2: Run — should fail**

```bash
npx tsx --test src/lib/admin-bookings.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/admin-bookings.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export type BookingRow = {
  id: string;
  booking_date: string;
  booking_time: string;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  status: string;
};

export type BookingGroup = {
  date: string;
  rows: BookingRow[];
};

/** Group bookings by date ascending. Input order within a date is preserved. */
export function groupBookingsByDate(rows: BookingRow[]): BookingGroup[] {
  const byDate = new Map<string, BookingRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.booking_date) ?? [];
    list.push(r);
    byDate.set(r.booking_date, list);
  }
  const dates = Array.from(byDate.keys()).sort();
  return dates.map((date) => ({ date, rows: byDate.get(date)! }));
}

/** Today (UTC) or later. */
export async function getUpcomingBookings(tenantId: string): Promise<BookingRow[]> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, customer_name, customer_phone, service_name, status")
    .eq("tenant_id", tenantId)
    .gte("booking_date", today)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });
  if (error) {
    console.error("[admin-bookings] getUpcomingBookings failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Today only. */
export async function getTodayBookings(tenantId: string): Promise<BookingRow[]> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_date, booking_time, customer_name, customer_phone, service_name, status")
    .eq("tenant_id", tenantId)
    .eq("booking_date", today)
    .order("booking_time", { ascending: true });
  if (error) {
    console.error("[admin-bookings] getTodayBookings failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Fetch booking_settings for a tenant (may be null on first load). */
export async function getBookingSettings(tenantId: string): Promise<{
  working_hours: Record<string, { open: string; close: string } | null> | null;
  blocked_dates: string[];
} | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("booking_settings")
    .select("working_hours, blocked_dates")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[admin-bookings] getBookingSettings failed", { tenantId, error });
    return null;
  }
  if (!data) return { working_hours: null, blocked_dates: [] };
  return {
    working_hours: (data.working_hours as Record<string, { open: string; close: string } | null>) ?? null,
    blocked_dates: (data.blocked_dates as string[] | null) ?? [],
  };
}
```

- [ ] **Step 4: Run — should pass**

```bash
npx tsx --test src/lib/admin-bookings.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-bookings.ts src/lib/admin-bookings.test.ts
git commit -m "feat(owner-admin): booking data helpers + date grouping"
```

---

## Task 11: BookingRow client component (action sheet)

**Files:**
- Create: `src/app/site/[slug]/admin/_components/BookingRow.tsx`

- [ ] **Step 1: Create**

Create `src/app/site/[slug]/admin/_components/BookingRow.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { BookingRow as BookingRowType } from "@/lib/admin-bookings";

const STATUS_PILL: Record<string, string> = {
  confirmed: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  canceled: "bg-gray-200 text-gray-600",
  no_show: "bg-red-100 text-red-700",
  pending: "bg-pink-100 text-pink-700",
};

export function BookingRow({ row: initialRow }: { row: BookingRowType }) {
  const [row, setRow] = useState(initialRow);
  const [openSheet, setOpenSheet] = useState(false);
  const [pending, setPending] = useState(false);

  async function setStatus(toStatus: string) {
    if (pending) return;
    const prev = row;
    setRow({ ...row, status: toStatus });
    setOpenSheet(false);
    setPending(true);
    try {
      const res = await fetch("/api/admin/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: row.id, toStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not update booking");
        setRow(prev);
      }
    } catch {
      alert("Network error");
      setRow(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenSheet(true)}
        className="w-full px-4 py-3 border-b border-gray-100 last:border-b-0 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              {row.booking_time} · {row.customer_name}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {row.service_name} · {row.customer_phone}
            </div>
          </div>
          <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (STATUS_PILL[row.status] ?? STATUS_PILL.confirmed)}>
            {row.status.replace("_", " ").toUpperCase()}
          </span>
        </div>
      </button>

      {openSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onClick={() => setOpenSheet(false)}
        >
          <div
            className="w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl md:mb-10 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-300 rounded mx-auto mb-3 md:hidden" />
            <div className="text-sm font-semibold mb-3">
              {row.customer_name} · {row.booking_time}
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setStatus("completed")}
                className="w-full bg-pink-600 text-white font-medium py-3 rounded-lg"
              >
                Mark completed
              </button>
              <button
                type="button"
                onClick={() => setStatus("no_show")}
                className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-3 rounded-lg"
              >
                Mark no-show
              </button>
              <button
                type="button"
                onClick={() => setStatus("canceled")}
                className="w-full bg-white border border-red-600 text-red-600 font-medium py-3 rounded-lg"
              >
                Cancel
              </button>
              <a
                href={"tel:" + row.customer_phone}
                className="block w-full text-center bg-white border border-pink-600 text-pink-700 font-medium py-3 rounded-lg"
              >
                📞 Call customer
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/_components/BookingRow.tsx'
git commit -m "feat(owner-admin): BookingRow + action sheet"
```

---

## Task 12: HoursEditor + BlockDateDialog components

**Files:**
- Create: `src/app/site/[slug]/admin/_components/HoursEditor.tsx`
- Create: `src/app/site/[slug]/admin/_components/BlockDateDialog.tsx`

- [ ] **Step 1: Create the HoursEditor**

Create `src/app/site/[slug]/admin/_components/HoursEditor.tsx`:

```tsx
"use client";

import { useState } from "react";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type DayHours = { open: string; close: string };
type WorkingHours = Record<string, DayHours | null>;

const DEFAULT_HOURS: WorkingHours = {
  Monday: { open: "10:00 AM", close: "7:00 PM" },
  Tuesday: { open: "10:00 AM", close: "7:00 PM" },
  Wednesday: { open: "10:00 AM", close: "7:00 PM" },
  Thursday: { open: "10:00 AM", close: "7:00 PM" },
  Friday: { open: "10:00 AM", close: "7:00 PM" },
  Saturday: { open: "10:00 AM", close: "5:00 PM" },
  Sunday: null,
};

export function HoursEditor({ initial }: { initial: WorkingHours | null }) {
  const [hours, setHours] = useState<WorkingHours>(initial ?? DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setDay(day: string, next: DayHours | null) {
    setHours((h) => ({ ...h, [day]: next }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/bookings/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not save hours");
        return;
      }
      setSaved(true);
    } catch {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      {WEEKDAYS.map((day) => {
        const value = hours[day];
        const isClosed = value === null;
        return (
          <div key={day} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="w-24 text-sm font-medium">{day}</div>
            {isClosed ? (
              <div className="flex-1 text-sm text-gray-500">Closed</div>
            ) : (
              <div className="flex-1 flex items-center gap-2 text-sm">
                <input
                  type="text"
                  value={value!.open}
                  onChange={(e) => setDay(day, { open: e.target.value, close: value!.close })}
                  className="w-24 rounded border border-gray-200 px-2 py-1"
                  placeholder="10:00 AM"
                />
                <span>→</span>
                <input
                  type="text"
                  value={value!.close}
                  onChange={(e) => setDay(day, { open: value!.open, close: e.target.value })}
                  className="w-24 rounded border border-gray-200 px-2 py-1"
                  placeholder="7:00 PM"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setDay(day, isClosed ? { open: "10:00 AM", close: "5:00 PM" } : null)}
              className="text-xs text-pink-700 underline"
            >
              {isClosed ? "Open" : "Closed"}
            </button>
          </div>
        );
      })}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {saved ? "✓ Saved" : saving ? "Saving..." : " "}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="bg-pink-600 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Save hours
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the BlockDateDialog**

Create `src/app/site/[slug]/admin/_components/BlockDateDialog.tsx`:

```tsx
"use client";

import { useState } from "react";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BlockDateDialog({ initial }: { initial: string[] }) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState(todayIso());
  const [blocked, setBlocked] = useState(initial);
  const [pending, setPending] = useState(false);

  async function mutate(mode: "add" | "remove", dates: string[]) {
    setPending(true);
    try {
      const res = await fetch("/api/admin/bookings/block-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, dates }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not update");
        return;
      }
      const data = await res.json();
      setBlocked((data.blocked_dates as string[]) ?? []);
    } catch {
      alert("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-white/90 underline"
      >
        + Block date
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold mb-3">Blocked dates</div>

            <div className="flex gap-2 mb-3">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 rounded border border-gray-200 px-3 py-2 text-sm"
                min={todayIso()}
              />
              <button
                type="button"
                disabled={pending || !newDate}
                onClick={() => mutate("add", [newDate])}
                className="bg-pink-600 text-white font-medium px-3 py-2 rounded text-sm disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {blocked.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-3">No blocked dates.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {blocked.map((d) => (
                  <div key={d} className="flex items-center justify-between py-2 text-sm">
                    <span>{d}</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => mutate("remove", [d])}
                      className="text-xs text-red-600 underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full mt-4 text-sm text-gray-600"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/_components/HoursEditor.tsx' 'src/app/site/[slug]/admin/_components/BlockDateDialog.tsx'
git commit -m "feat(owner-admin): HoursEditor + BlockDateDialog"
```

---

## Task 13: Schedule page

**Files:**
- Create: `src/app/site/[slug]/admin/schedule/page.tsx`

Tab routing via `?tab=today|upcoming|hours` (defaults to `today`).

- [ ] **Step 1: Create the page**

Create `src/app/site/[slug]/admin/schedule/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import {
  getTodayBookings,
  getUpcomingBookings,
  getBookingSettings,
  groupBookingsByDate,
} from "@/lib/admin-bookings";
import { BookingRow } from "../_components/BookingRow";
import { HoursEditor } from "../_components/HoursEditor";
import { BlockDateDialog } from "../_components/BlockDateDialog";

export const dynamic = "force-dynamic";

type Tab = "today" | "upcoming" | "hours";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const tab: Tab =
    searchParams.tab === "upcoming" ? "upcoming"
      : searchParams.tab === "hours" ? "hours"
      : "today";

  const settings = await getBookingSettings(tenant.id);

  const tabClass = (active: boolean) =>
    "px-4 py-2 text-sm border-b-2 " +
    (active ? "border-pink-600 text-pink-700 font-medium" : "border-transparent text-gray-500");

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Schedule</div>
        <BlockDateDialog initial={settings?.blocked_dates ?? []} />
      </div>

      <div className="px-4 md:px-8 mt-3 flex gap-2 border-b border-gray-200">
        <Link href="?tab=today" className={tabClass(tab === "today")}>Today</Link>
        <Link href="?tab=upcoming" className={tabClass(tab === "upcoming")}>Upcoming</Link>
        <Link href="?tab=hours" className={tabClass(tab === "hours")}>Hours</Link>
      </div>

      <div className="px-3 md:px-8 mt-4">
        {tab === "hours" ? (
          <HoursEditor initial={settings?.working_hours ?? null} />
        ) : (
          <ScheduleList tab={tab} tenantId={tenant.id} />
        )}
      </div>
    </div>
  );
}

async function ScheduleList({ tab, tenantId }: { tab: "today" | "upcoming"; tenantId: string }) {
  const rows = tab === "today"
    ? await getTodayBookings(tenantId)
    : await getUpcomingBookings(tenantId);

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
        {tab === "today" ? "No bookings today." : "No upcoming bookings."}
      </div>
    );
  }

  if (tab === "today") {
    return (
      <div className="bg-white border border-gray-200 rounded-lg">
        {rows.map((r) => <BookingRow key={r.id} row={r} />)}
      </div>
    );
  }

  const groups = groupBookingsByDate(rows);
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.date}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2 px-1">
            {g.date}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg">
            {g.rows.map((r) => <BookingRow key={r.id} row={r} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type check + final tests + commit**

```bash
npx tsc --noEmit
npx tsx --test src/lib/admin-auth.test.ts src/lib/admin-rate-limit.test.ts src/lib/admin-rollups.test.ts src/lib/admin-visits.test.ts src/lib/api-rate-limit.test.ts src/lib/admin-bookings.test.ts
# Expect 41 tests pass (29 + 9 api-rate-limit + 3 bookings)
npm run lint
git add 'src/app/site/[slug]/admin/schedule/page.tsx'
git commit -m "feat(owner-admin): Schedule page — Today/Upcoming/Hours tabs + block dates"
```

---

## Post-plan verification

- [ ] All tests pass: 41 total (29 from prior plans + 3 new in admin-bookings + 9 in api-rate-limit).
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean on new files
- [ ] Manual smoke tests:
  - Public site: submit contact form → appears on `/admin/leads` with NEW pill
  - `/admin/leads` → tap a lead → NEW pill disappears, row dims
  - `/admin/orders?tab=active` → tap row → drawer opens → click "Mark ready" → pill updates optimistically → reload confirms server saved
  - `/admin/schedule?tab=hours` → edit a day, save → reload confirms persisted
  - `/admin/schedule` → "+ Block date" → add a date → shows in list → remove → disappears

---

## What is NOT in this plan (later)

- **Plan 4 scope**: Updates (website change requests), Billing (Stripe portal), Settings (PIN change, sign out in sidebar footer already exists), Forgot PIN reset flow
- **Slot-duration / buffer / max-per-slot editing** — founder-configured only, not surfaced in Schedule UI (per spec)
- **Push/SMS notifications on new leads/orders/bookings** — phase 2+
- **i18n** — still hardcoded English; cross-cutting pass scheduled before Plan 4 lands more copy
- **Mark multiple leads read at once / archive** — not in spec

---

## Self-review notes

**Spec coverage:**
- §Leads page → Task 4 (page, component, tap-to-mark-read, source_page, read-dimming)
- §Orders page → Tasks 5, 6 (Active/History tabs, detail drawer, status transitions, Call + Cancel)
- §Schedule page → Tasks 7-13 (Today/Upcoming with action sheet, Hours editor, Block date picker)
- §"Existing /api/leads behavior" — spec said "extend with hostname check"; plan chose instead to create a separate `/api/contact` endpoint (cleaner: different purposes, preserves wizard flow, avoids host-sniffing coupling). Task 1 + Task 2 cover this alternative.

**Placeholder scan:** No "TBD" / "TODO" / "add validation" — all steps have complete code + exact commands.

**Type consistency:**
- `Lead` defined in Task 4 (LeadRow), consumed by Task 4's page.
- `Order` + `OrderItem` defined in Task 6's OrderDetailDrawer, re-used by OrdersList and page.
- `BookingRow` type defined in Task 10 (admin-bookings), imported by Task 11 (BookingRow component) and Task 13 (Schedule page).
- `WorkingHours` shape is consistent across Task 9 (API sanitizer), Task 12 (HoursEditor component), Task 10 (getBookingSettings return type).
- `requireOwnerSession` signature (returning `{ tenant: AdminTenant } | null`) matches Plan 1 — every mutation route in this plan consumes `session.tenant.id`.
