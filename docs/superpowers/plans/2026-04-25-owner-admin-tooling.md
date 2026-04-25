# Owner Admin Tooling — Implementation Plan (Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the owner admin spec — ship the **Updates** page (owner-filed website-change requests), **Billing** page (Stripe Customer Portal redirect), **Settings** page (PIN change + email + sign out), and the **Forgot-PIN reset flow** (email link → tokenized reset). Plus a small founder-side enhancement: surface each tenant's pending update requests on the existing client edit page.

**Architecture:** Mostly server-rendered pages following the same patterns as Plans 1-3. The forgot-PIN flow lives at `/admin/forgot-pin` and `/admin/pin-reset?token=` — both ABOVE the auth gate via a small carve-out in the existing admin layout that reads `x-pathname` (already set by middleware). PIN reset tokens are stored hashed in `admin_pin_resets` with a 15-minute TTL. Update-request photos go to a new `update-attachments` Supabase Storage bucket. Stripe portal sessions reuse the existing `stripe` client; no new Stripe code.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (service-role only), Stripe (existing client), Resend (existing helper). No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-04-24-owner-admin-design.md` — sections "Update requests", "Billing", "Settings", "Forgot-PIN recovery"
**Builds on:** Plans 1-3 (all merged via PRs #32-#37). Rate-limit infrastructure from `api-rate-limit.ts` is available.

---

## Environment variables
Existing env vars cover everything. The plan assumes:
- `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` (email helpers)
- `NEXT_PUBLIC_APP_URL` — used in reset emails so the owner clicks back to their tenant domain (we'll derive the link from the request host instead, see Task 4)
- `STRIPE_SECRET_KEY` (already wired)

No new env vars.

---

## File Structure

### Create

**Migration + storage:**
- `supabase/migrations/014_owner_admin_tooling.sql` — `update_requests` table, `admin_pin_resets` table, `update-attachments` Storage bucket + policies

**Email helpers:**
- (modify) `src/lib/email.ts` — add `sendPinResetEmail(toEmail, resetUrl, businessName)` and `sendUpdateRequestNotification(...)`

**API routes:**
- `src/app/api/admin/pin/change/route.ts` — POST current+new PIN
- `src/app/api/admin/pin/forgot/route.ts` — POST email → emails reset link
- `src/app/api/admin/pin/reset/route.ts` — POST token + new PIN
- `src/app/api/admin/updates/route.ts` — POST create update request
- `src/app/api/admin/updates/attachment/route.ts` — POST upload photo
- `src/app/api/admin/updates/[id]/route.ts` — PATCH (founder-only) update status
- `src/app/api/admin/billing/portal/route.ts` — POST create Stripe portal session

**Pages:**
- `src/app/site/[slug]/admin/forgot-pin/page.tsx` — email entry (pre-auth)
- `src/app/site/[slug]/admin/pin-reset/page.tsx` — set-new-PIN with `?token=` (pre-auth)
- `src/app/site/[slug]/admin/settings/page.tsx`
- `src/app/site/[slug]/admin/billing/page.tsx`
- `src/app/site/[slug]/admin/updates/page.tsx` — list
- `src/app/site/[slug]/admin/updates/new/page.tsx` — form

**Components:**
- `src/app/site/[slug]/admin/_components/ChangePinForm.tsx` (client)
- `src/app/site/[slug]/admin/_components/NewUpdateRequestForm.tsx` (client)
- `src/app/site/[slug]/admin/_components/BillingPortalButton.tsx` (client)

### Modify
- `src/app/site/[slug]/admin/layout.tsx` — carve out `/admin/forgot-pin` and `/admin/pin-reset` from the auth gate
- `src/app/site/[slug]/admin/_components/PinEntry.tsx` — replace the disabled "Forgot PIN?" placeholder with a real `<Link href="/admin/forgot-pin">`
- `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` — add a small panel listing this tenant's last 5 update requests (founder-side triage)

### Responsibility per file
- `update_requests` is read by `/admin/updates`, written by `/api/admin/updates` (owner) and `/api/admin/updates/[id]` (founder), surfaced read-only on the founder client-edit page.
- `admin_pin_resets` is touched only by `/api/admin/pin/forgot` (insert) and `/api/admin/pin/reset` (consume); rows expire after 15 min and are single-use.
- `update-attachments` bucket: written by `/api/admin/updates/attachment`, read by founder admin (signed URLs) — never publicly exposed.
- `BillingPortalButton` is the only place that calls `/api/admin/billing/portal` from client code.

---

## Shared patterns (recap from Plan 3)

Every `/api/admin/*` POST that requires owner auth uses `requireOwnerSession` first. Routes that mutate a row by ID also verify ownership:

```ts
const { data: row } = await supabase.from(TABLE).select("tenant_id").eq("id", id).maybeSingle();
if (!row || row.tenant_id !== session.tenant.id) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

I won't repeat this in every task body.

---

## Task 1: Migration 014

**Files:**
- Create: `supabase/migrations/014_owner_admin_tooling.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/014_owner_admin_tooling.sql`:

```sql
-- Owner admin tooling: Updates page + forgot-PIN reset flow.
-- Final part of the 4-migration owner-admin series.

CREATE TABLE IF NOT EXISTS update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN ('hours', 'photo', 'service', 'pricing', 'text', 'other')),
  description text NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_update_requests_tenant_status
  ON update_requests (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_requests_pending
  ON update_requests (created_at DESC) WHERE status != 'done';
ALTER TABLE update_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_pin_resets (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_admin_pin_resets_tenant
  ON admin_pin_resets (tenant_id);
ALTER TABLE admin_pin_resets ENABLE ROW LEVEL SECURITY;

-- Storage bucket for update-request attachments. Private (signed URLs only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('update-attachments', 'update-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: only the service role can read/write. Tenant scoping is enforced
-- in the API layer (the route validates the owner session and constructs the
-- path as {tenant_id}/{request_id}.{ext}).
DROP POLICY IF EXISTS "service_role_all" ON storage.objects;
CREATE POLICY "service_role_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'update-attachments')
  WITH CHECK (bucket_id = 'update-attachments');
```

- [ ] **Step 2: Apply manually in Supabase SQL editor**

Verify with:
```sql
SELECT to_regclass('update_requests'), to_regclass('admin_pin_resets');
SELECT id FROM storage.buckets WHERE id = 'update-attachments';
-- All three should return non-null.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_owner_admin_tooling.sql
git commit -m "feat(owner-admin): migration 014 — update_requests + admin_pin_resets + storage"
```

---

## Task 2: Email helpers

**Files:**
- Modify: `src/lib/email.ts`

Add two new exports — `sendPinResetEmail` and `sendUpdateRequestNotification`. Match the existing pattern (no-op if `RESEND_API_KEY` not set).

- [ ] **Step 1: Read the current `email.ts`**

Run: `cat src/lib/email.ts`. Note the existing `sendFounderNotification` and `sendLeadConfirmation` for the patterns: `if (!resend) return; resend.emails.send({ from: FROM, to, subject, html })`.

- [ ] **Step 2: Append the new helpers**

Append to `src/lib/email.ts`:

```ts
/**
 * Email an owner a PIN reset link (15-minute TTL on the token).
 * The reset URL points back to their own tenant domain — we don't
 * surface SiteForOwners branding to the owner's customers.
 */
export async function sendPinResetEmail(
  toEmail: string,
  resetUrl: string,
  businessName: string
): Promise<void> {
  if (!resend) {
    console.log("Skipping PIN reset email — RESEND_API_KEY not set", { toEmail });
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Reset your ${businessName} dashboard PIN`,
    html: `
      <p>Hi,</p>
      <p>Someone (hopefully you) requested a PIN reset for your <b>${businessName}</b> dashboard.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#D8006B;color:white;text-decoration:none;border-radius:6px">Set a new PIN</a></p>
      <p>This link expires in 15 minutes. If you didn't request this, you can ignore this email — your PIN won't change.</p>
    `,
  });
}

/**
 * Notify the founder when a new update request is filed.
 */
export async function sendUpdateRequestNotification(req: {
  tenantId: string;
  businessName: string;
  category: string;
  description: string;
  attachmentUrl?: string | null;
}): Promise<void> {
  if (!resend || !ADMIN_EMAIL) {
    console.log("Skipping update-request notification — RESEND_API_KEY or ADMIN_EMAIL not set");
    return;
  }
  const editLink = `${APP_URL}/clients/${req.tenantId}/edit`;
  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New update request — ${req.businessName}`,
    html: `
      <p><b>${req.businessName}</b> filed an update request.</p>
      <p><b>Category:</b> ${req.category}</p>
      <p><b>Description:</b><br/>${req.description.replace(/\n/g, "<br/>")}</p>
      ${req.attachmentUrl ? `<p><b>Attachment:</b> <a href="${req.attachmentUrl}">${req.attachmentUrl}</a></p>` : ""}
      <p><a href="${editLink}">Open client edit page →</a></p>
    `,
  });
}
```

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/email.ts
git commit -m "feat(owner-admin): sendPinResetEmail + sendUpdateRequestNotification"
```

---

## Task 3: PIN change API

**Files:**
- Create: `src/app/api/admin/pin/change/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/admin/pin/change/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, hashPin, verifyPin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const currentPin = typeof b.currentPin === "string" ? b.currentPin : "";
  const newPin = typeof b.newPin === "string" ? b.newPin : "";

  if (!/^\d{4,8}$/.test(currentPin) || !/^\d{4,8}$/.test(newPin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }
  if (newPin === currentPin) {
    return NextResponse.json({ error: "New PIN must be different" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("admin_pin_hash")
    .eq("id", session.tenant.id)
    .maybeSingle();
  if (!tenant?.admin_pin_hash) {
    return NextResponse.json({ error: "PIN not set" }, { status: 400 });
  }

  const ok = await verifyPin(currentPin, tenant.admin_pin_hash);
  if (!ok) return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });

  const newHash = await hashPin(newPin);
  const { error } = await supabase
    .from("tenants")
    .update({ admin_pin_hash: newHash, admin_pin_updated_at: new Date().toISOString() })
    .eq("id", session.tenant.id);
  if (error) {
    console.error("[admin/pin/change] update failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

Note: `hashPin` and `verifyPin` are already exported from `@/lib/admin-auth`. Verify the imports work via `npx tsc --noEmit`.

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/pin/change/route.ts
git commit -m "feat(owner-admin): POST /api/admin/pin/change"
```

---

## Task 4: Forgot-PIN + reset routes

**Files:**
- Create: `src/app/api/admin/pin/forgot/route.ts`
- Create: `src/app/api/admin/pin/reset/route.ts`

- [ ] **Step 1: Implement /api/admin/pin/forgot**

Create `src/app/api/admin/pin/forgot/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPinResetEmail } from "@/lib/email";
import { checkRateLimit, hashIp, getClientIp } from "@/lib/api-rate-limit";
import { createHash, randomBytes } from "node:crypto";

const FORGOT_WINDOW_SECONDS = 60 * 60; // 1 hour
const FORGOT_MAX_REQUESTS = 5;
const TOKEN_TTL_MINUTES = 15;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  // Generic response either way — don't reveal whether the host or email matched.
  const genericResponse = NextResponse.json({ ok: true });
  if (!tenant) return genericResponse;

  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(
    `pin_forgot:${tenant.id}:${ipHash}`,
    FORGOT_WINDOW_SECONDS,
    FORGOT_MAX_REQUESTS
  );
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const email = typeof (body as Record<string, unknown>).email === "string"
    ? ((body as Record<string, unknown>).email as string).trim().toLowerCase()
    : "";
  if (!email) return genericResponse;

  const tenantEmails = [tenant.email, tenant.admin_email].filter(Boolean).map((e) => e!.toLowerCase());
  if (!tenantEmails.includes(email)) return genericResponse;

  // Generate token, store hash, email plaintext link
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const { error: insertErr } = await supabase
    .from("admin_pin_resets")
    .insert({ token_hash: tokenHash, tenant_id: tenant.id, expires_at: expiresAt });
  if (insertErr) {
    console.error("[admin/pin/forgot] insert failed", { tenantId: tenant.id, error: insertErr });
    return genericResponse;
  }

  const proto = request.headers.get("x-forwarded-proto") || "https";
  const resetUrl = `${proto}://${host}/admin/pin-reset?token=${encodeURIComponent(token)}`;
  await sendPinResetEmail(email, resetUrl, tenant.business_name);

  return genericResponse;
}
```

- [ ] **Step 2: Implement /api/admin/pin/reset**

Create `src/app/api/admin/pin/reset/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost, hashPin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const token = typeof b.token === "string" ? b.token : "";
  const newPin = typeof b.newPin === "string" ? b.newPin : "";
  if (!token || !/^\d{4,8}$/.test(newPin)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tokenHash = hashToken(token);
  const { data: row } = await supabase
    .from("admin_pin_resets")
    .select("tenant_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row || row.tenant_id !== tenant.id || row.used_at !== null || new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  }

  const newHash = await hashPin(newPin);
  // Mark token used + update PIN in two writes; even if the second fails the
  // owner can request a new link.
  const { error: updateTokenErr } = await supabase
    .from("admin_pin_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  if (updateTokenErr) {
    console.error("[admin/pin/reset] mark used failed", { error: updateTokenErr });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const { error: updatePinErr } = await supabase
    .from("tenants")
    .update({ admin_pin_hash: newHash, admin_pin_updated_at: new Date().toISOString() })
    .eq("id", tenant.id);
  if (updatePinErr) {
    console.error("[admin/pin/reset] PIN update failed", { error: updatePinErr });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/pin/forgot/route.ts src/app/api/admin/pin/reset/route.ts
git commit -m "feat(owner-admin): forgot-PIN + reset routes"
```

---

## Task 5: Auth-bypass carve-out + reset/forgot pages

**Files:**
- Modify: `src/app/site/[slug]/admin/layout.tsx` — bypass auth gate for `/admin/forgot-pin` and `/admin/pin-reset`
- Modify: `src/app/site/[slug]/admin/_components/PinEntry.tsx` — wire "Forgot PIN?" link
- Create: `src/app/site/[slug]/admin/forgot-pin/page.tsx`
- Create: `src/app/site/[slug]/admin/pin-reset/page.tsx`

- [ ] **Step 1: Carve out auth-bypass paths in layout**

Read the current layout at `src/app/site/[slug]/admin/layout.tsx`. Update it to:

```tsx
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/admin-auth";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { PinEntry } from "./_components/PinEntry";
import { AdminShell, ShellTenant } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

const AUTH_BYPASS_PATHS = ["/admin/forgot-pin", "/admin/pin-reset"];

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const pathname = headers().get("x-pathname") || "";
  if (AUTH_BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    // Pre-auth pages render bare (no shell, no PinEntry interception).
    return <div className="min-h-screen bg-gray-50">{children}</div>;
  }

  const sessionCookie = cookies().get("owner_session")?.value;
  const session = sessionCookie ? verifySession(sessionCookie) : null;
  const authed = !!session && session.tenant_id === tenant.id;

  if (!authed) {
    return <PinEntry businessName={tenant.business_name} />;
  }

  const shellTenant: ShellTenant = {
    business_name: tenant.business_name,
    booking_tool: tenant.booking_tool,
    checkout_mode: tenant.checkout_mode,
  };

  return <AdminShell tenant={shellTenant}>{children}</AdminShell>;
}
```

- [ ] **Step 2: Wire "Forgot PIN?" link in PinEntry**

In `src/app/site/[slug]/admin/_components/PinEntry.tsx`, find this block near the bottom:

```tsx
<div className="text-center mt-6">
  <button type="button" className="text-sm text-pink-600 opacity-50 cursor-not-allowed" disabled>
    Forgot PIN?
  </button>
  <div className="text-[10px] text-gray-400 mt-1">(coming soon)</div>
</div>
```

Replace with:

```tsx
<div className="text-center mt-6">
  <a href="/admin/forgot-pin" className="text-sm text-pink-600 hover:underline">
    Forgot PIN?
  </a>
</div>
```

- [ ] **Step 3: Create forgot-pin page**

Create `src/app/site/[slug]/admin/forgot-pin/page.tsx`:

```tsx
import { ForgotPinForm } from "../_components/ForgotPinForm";

export const dynamic = "force-dynamic";

export default function ForgotPinPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <ForgotPinForm />
    </div>
  );
}
```

Create `src/app/site/[slug]/admin/_components/ForgotPinForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export function ForgotPinForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/admin/pin/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true); // don't leak; still show generic confirmation
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-xs">
      <div className="text-center mb-5">
        <div className="text-pink-600 font-semibold text-lg">Reset your PIN</div>
      </div>

      {submitted ? (
        <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-700">
          If an account exists for that email, a reset link is on its way. The link expires in 15 minutes.
          <div className="mt-3">
            <a href="/admin" className="text-pink-600 hover:underline text-sm">Back to sign in</a>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email on file"
            className="w-full bg-white border border-gray-300 rounded-lg py-3 px-4 text-base"
          />
          <button
            type="submit"
            disabled={pending || !email}
            className="w-full bg-pink-600 text-white font-medium py-3 rounded-lg disabled:opacity-50"
          >
            {pending ? "Sending..." : "Email me a reset link"}
          </button>
          <a href="/admin" className="block text-center text-sm text-gray-500 hover:underline">
            Back to sign in
          </a>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create pin-reset page**

Create `src/app/site/[slug]/admin/pin-reset/page.tsx`:

```tsx
import { PinResetForm } from "../_components/PinResetForm";

export const dynamic = "force-dynamic";

export default function PinResetPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <PinResetForm token={token} />
    </div>
  );
}
```

Create `src/app/site/[slug]/admin/_components/PinResetForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export function PinResetForm({ token }: { token: string }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="w-full max-w-xs text-center">
        <div className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-700">
          Missing reset token. Please request a new reset link.
          <div className="mt-3">
            <a href="/admin/forgot-pin" className="text-pink-600 hover:underline">Request new link</a>
          </div>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN must be exactly 6 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/pin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPin: pin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || "Could not reset PIN");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-xs text-center">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="text-pink-600 font-semibold mb-2">PIN updated ✓</div>
          <div className="text-sm text-gray-700 mb-3">You can now sign in with your new PIN.</div>
          <a href="/admin" className="inline-block bg-pink-600 text-white font-medium px-4 py-2 rounded-lg">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xs">
      <div className="text-center mb-5">
        <div className="text-pink-600 font-semibold text-lg">Set a new PIN</div>
        <div className="text-gray-500 text-sm mt-1">6 digits</div>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="New PIN"
          className="w-full bg-white border border-gray-300 rounded-lg py-3 px-4 text-base text-center tracking-widest"
        />
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
          placeholder="Confirm new PIN"
          className="w-full bg-white border border-gray-300 rounded-lg py-3 px-4 text-base text-center tracking-widest"
        />
        {error && <div className="text-red-600 text-sm text-center" role="alert">{error}</div>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-pink-600 text-white font-medium py-3 rounded-lg disabled:opacity-50"
        >
          {pending ? "Updating..." : "Set PIN"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Type check + commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/layout.tsx' 'src/app/site/[slug]/admin/_components/PinEntry.tsx' 'src/app/site/[slug]/admin/forgot-pin/page.tsx' 'src/app/site/[slug]/admin/pin-reset/page.tsx' 'src/app/site/[slug]/admin/_components/ForgotPinForm.tsx' 'src/app/site/[slug]/admin/_components/PinResetForm.tsx'
git commit -m "feat(owner-admin): forgot-PIN + reset pages with auth-bypass carve-out"
```

---

## Task 6: Settings page

**Files:**
- Create: `src/app/site/[slug]/admin/settings/page.tsx`
- Create: `src/app/site/[slug]/admin/_components/ChangePinForm.tsx`

- [ ] **Step 1: Create the ChangePinForm**

Create `src/app/site/[slug]/admin/_components/ChangePinForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export function ChangePinForm() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(newPin)) {
      setError("PIN must be exactly 6 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PINs don't match");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/pin/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || "Could not change PIN");
        return;
      }
      setDone(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-semibold">Change PIN</div>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={currentPin}
        onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
        placeholder="Current PIN"
        className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm tracking-widest"
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={newPin}
        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
        placeholder="New PIN"
        className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm tracking-widest"
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={confirmPin}
        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
        placeholder="Confirm new PIN"
        className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm tracking-widest"
      />
      {error && <div className="text-red-600 text-xs" role="alert">{error}</div>}
      {done && <div className="text-green-700 text-xs">✓ PIN updated</div>}
      <button
        type="submit"
        disabled={pending}
        className="bg-pink-600 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50 text-sm"
      >
        {pending ? "Updating..." : "Update PIN"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create the Settings page**

Create `src/app/site/[slug]/admin/settings/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { ChangePinForm } from "../_components/ChangePinForm";
import { SignOutButton } from "../_components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const emailOnFile = tenant.admin_email ?? tenant.email ?? "(none)";
  const subdomain = tenant.preview_slug;

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Settings</div>
      </div>

      <div className="px-3 md:px-8 mt-4 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-semibold mb-2">Account</div>
          <div className="text-xs text-gray-500">Email on file</div>
          <div className="text-sm">{emailOnFile}</div>
          <div className="text-[10px] text-gray-400 mt-2">
            Need to change your email? File an update request.
          </div>
        </div>

        <ChangePinForm />

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-semibold mb-2">Your website</div>
          <div className="text-sm">{tenant.business_name}</div>
          {subdomain && (
            <div className="text-xs text-gray-500 mt-1">{subdomain}.siteforowners.com</div>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {tenant.site_published ? "Published" : "Draft"} · Subscription: {tenant.subscription_status}
          </div>
        </div>

        <div className="bg-white border border-red-200 rounded-lg p-4">
          <SignOutButton className="w-full text-center text-sm font-medium text-red-600 border border-red-600 rounded-lg py-2" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/settings/page.tsx' 'src/app/site/[slug]/admin/_components/ChangePinForm.tsx'
git commit -m "feat(owner-admin): Settings page with Change PIN + Sign out"
```

---

## Task 7: Updates API + attachment upload

**Files:**
- Create: `src/app/api/admin/updates/route.ts`
- Create: `src/app/api/admin/updates/attachment/route.ts`

- [ ] **Step 1: Implement /api/admin/updates POST**

Create `src/app/api/admin/updates/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendUpdateRequestNotification } from "@/lib/email";

const VALID_CATEGORIES = ["hours", "photo", "service", "pricing", "text", "other"];

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const category = typeof b.category === "string" ? b.category : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  const attachmentUrl = typeof b.attachmentUrl === "string" ? b.attachmentUrl : null;

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (description.length < 5) {
    return NextResponse.json({ error: "Description must be at least 5 characters" }, { status: 400 });
  }
  if (description.length > 5000) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase
    .from("update_requests")
    .insert({
      tenant_id: session.tenant.id,
      category,
      description,
      attachment_url: attachmentUrl,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[admin/updates] insert failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  // Notify founder (don't block response on email failure)
  sendUpdateRequestNotification({
    tenantId: session.tenant.id,
    businessName: session.tenant.business_name,
    category,
    description,
    attachmentUrl,
  }).catch((err) => console.error("[admin/updates] email failed", err));

  return NextResponse.json({ ok: true, id: inserted.id });
}
```

- [ ] **Step 2: Implement /api/admin/updates/attachment POST**

Create `src/app/api/admin/updates/attachment/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const BUCKET = "update-attachments";

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF allowed" }, { status: 400 });
  }

  const ext = file.type.split("/")[1] || "bin";
  const path = `${session.tenant.id}/${randomBytes(16).toString("hex")}.${ext}`;

  const supabase = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("[admin/updates/attachment] upload failed", { tenantId: session.tenant.id, error: uploadErr });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Return a long-lived signed URL (24h) so the founder email link works
  // for at least a day. The founder admin can re-sign on demand if needed.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24);
  if (signErr || !signed) {
    console.error("[admin/updates/attachment] sign failed", { error: signErr });
    return NextResponse.json({ error: "Sign failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/updates/route.ts src/app/api/admin/updates/attachment/route.ts
git commit -m "feat(owner-admin): /api/admin/updates POST + photo attachment upload"
```

---

## Task 8: Updates list + new request pages

**Files:**
- Create: `src/app/site/[slug]/admin/updates/page.tsx`
- Create: `src/app/site/[slug]/admin/updates/new/page.tsx`
- Create: `src/app/site/[slug]/admin/_components/NewUpdateRequestForm.tsx`

- [ ] **Step 1: Create the list page**

Create `src/app/site/[slug]/admin/updates/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type UpdateRequest = {
  id: string;
  category: string;
  description: string;
  attachment_url: string | null;
  status: "pending" | "in_progress" | "done";
  created_at: string;
  completed_at: string | null;
};

const STATUS_PILL: Record<string, string> = {
  pending: "bg-pink-100 text-pink-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
};

const CATEGORY_LABEL: Record<string, string> = {
  hours: "Hours",
  photo: "Photo",
  service: "Service",
  pricing: "Pricing",
  text: "Text",
  other: "Other",
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

async function getRequests(tenantId: string): Promise<UpdateRequest[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("update_requests")
    .select("id, category, description, attachment_url, status, created_at, completed_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin/updates] fetch failed", { tenantId, error });
    return [];
  }
  return (data ?? []) as UpdateRequest[];
}

export default async function UpdatesPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();
  const requests = await getRequests(tenant.id);

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Update requests</div>
        <Link href="/admin/updates/new" className="text-xs text-pink-700 underline">+ New</Link>
      </div>
      <div className="px-4 md:px-8 mt-1 text-xs text-gray-500">
        Ask us to change something on your website.
      </div>

      <div className="px-3 md:px-8 mt-4">
        {requests.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No update requests yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg">
            {requests.map((r) => (
              <div key={r.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Submitted {formatRelative(r.created_at)}
                      {r.attachment_url && " · with photo"}
                    </div>
                    <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                      {r.description}
                    </div>
                  </div>
                  <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap " + (STATUS_PILL[r.status] ?? STATUS_PILL.pending)}>
                    {r.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the NewUpdateRequestForm component**

Create `src/app/site/[slug]/admin/_components/NewUpdateRequestForm.tsx`:

```tsx
"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "hours", label: "Hours" },
  { value: "photo", label: "Photo / image" },
  { value: "service", label: "Service" },
  { value: "pricing", label: "Pricing" },
  { value: "text", label: "Text / wording" },
  { value: "other", label: "Other" },
];

export function NewUpdateRequestForm() {
  const [category, setCategory] = useState("hours");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (description.trim().length < 5) {
      setError("Please describe what needs to change (at least 5 characters)");
      return;
    }
    setPending(true);
    try {
      let attachmentUrl: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const upRes = await fetch("/api/admin/updates/attachment", { method: "POST", body: fd });
        if (!upRes.ok) {
          const d = await upRes.json().catch(() => ({}));
          setError(d?.error || "Photo upload failed");
          return;
        }
        const upData = await upRes.json();
        attachmentUrl = upData.url ?? null;
      }

      const res = await fetch("/api/admin/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, description: description.trim(), attachmentUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || "Could not submit");
        return;
      }
      window.location.href = "/admin/updates";
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
          What needs to change?
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
          Describe the change
        </div>
        <textarea
          rows={5}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Change Tuesday hours to 11–7..."
          className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm"
          maxLength={5000}
        />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
          Attach photo (optional)
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
        {file && <div className="text-xs text-gray-500 mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
      </div>

      {error && <div className="text-red-600 text-sm" role="alert">{error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-pink-600 text-white font-medium py-3 rounded-lg disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send request"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create the new-request page**

Create `src/app/site/[slug]/admin/updates/new/page.tsx`:

```tsx
import Link from "next/link";
import { NewUpdateRequestForm } from "../../_components/NewUpdateRequestForm";

export const dynamic = "force-dynamic";

export default function NewUpdateRequestPage() {
  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">New request</div>
        <Link href="/admin/updates" className="text-xs text-gray-500 underline">Cancel</Link>
      </div>
      <div className="px-3 md:px-8 mt-4">
        <NewUpdateRequestForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add 'src/app/site/[slug]/admin/updates/page.tsx' 'src/app/site/[slug]/admin/updates/new/page.tsx' 'src/app/site/[slug]/admin/_components/NewUpdateRequestForm.tsx'
git commit -m "feat(owner-admin): Updates list + new request form"
```

---

## Task 9: Billing portal API + page

**Files:**
- Create: `src/app/api/admin/billing/portal/route.ts`
- Create: `src/app/site/[slug]/admin/billing/page.tsx`
- Create: `src/app/site/[slug]/admin/_components/BillingPortalButton.tsx`

- [ ] **Step 1: Implement the API route**

Create `src/app/api/admin/billing/portal/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", session.tenant.id)
    .maybeSingle();
  if (error || !tenant?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer" }, { status: 404 });
  }

  const host = request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const returnUrl = `${proto}://${host}/admin/billing`;

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("[admin/billing/portal] stripe failed", { tenantId: session.tenant.id, err });
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the BillingPortalButton**

Create `src/app/site/[slug]/admin/_components/BillingPortalButton.tsx`:

```tsx
"use client";

import { useState } from "react";

export function BillingPortalButton() {
  const [pending, setPending] = useState(false);

  async function open() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Could not open billing portal");
        return;
      }
      const data = await res.json();
      if (typeof data.url === "string") {
        window.location.href = data.url;
      } else {
        alert("Could not open billing portal");
      }
    } catch {
      alert("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="w-full bg-pink-600 text-white font-medium py-3 rounded-lg disabled:opacity-50"
    >
      {pending ? "Opening..." : "Manage billing"}
    </button>
  );
}
```

- [ ] **Step 3: Create the Billing page**

Create `src/app/site/[slug]/admin/billing/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadTenantBySlug } from "@/lib/admin-tenant";
import { BillingPortalButton } from "../_components/BillingPortalButton";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, { class: string; label: string }> = {
  active: { class: "bg-green-100 text-green-700", label: "Active" },
  trialing: { class: "bg-blue-100 text-blue-700", label: "Trial" },
  past_due: { class: "bg-red-100 text-red-700", label: "Past due" },
  canceled: { class: "bg-gray-200 text-gray-600", label: "Canceled" },
  pending: { class: "bg-pink-100 text-pink-700", label: "Pending" },
};

export default async function BillingPage({ params }: { params: { slug: string } }) {
  const tenant = await loadTenantBySlug(params.slug);
  if (!tenant) notFound();

  const pill = STATUS_PILL[tenant.subscription_status] ?? STATUS_PILL.pending;
  const isPastDue = tenant.subscription_status === "past_due";

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8">
        <div className="text-lg font-semibold">Billing</div>
      </div>

      <div className="px-3 md:px-8 mt-4 space-y-4">
        {isPastDue && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-sm text-red-700" role="alert">
            <div className="font-semibold">Payment past due</div>
            <div className="mt-1">Update your payment method below to keep your site online.</div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="text-xs text-gray-500">Subscription</div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">SiteForOwners</span>
            <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + pill.class}>
              {pill.label.toUpperCase()}
            </span>
          </div>
        </div>

        <BillingPortalButton />

        <div className="text-[10px] text-gray-400 text-center">
          Click above to view invoices, update payment, or cancel through Stripe.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/billing/portal/route.ts 'src/app/site/[slug]/admin/billing/page.tsx' 'src/app/site/[slug]/admin/_components/BillingPortalButton.tsx'
git commit -m "feat(owner-admin): Billing page + portal redirect"
```

---

## Task 10: Founder-side update queue on client edit page

**Files:**
- Create: `src/app/api/admin/updates/[id]/route.ts` — founder-only PATCH to update status
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` — add a panel listing this tenant's recent update_requests

The founder is gated by the existing `admin_session === ADMIN_PASSWORD` cookie pattern (same as other founder routes). We surface the status-change action so the founder can mark requests `in_progress` or `done`.

- [ ] **Step 1: Create the founder PATCH route**

Create `src/app/api/admin/updates/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["pending", "in_progress", "done"];

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!cookie && cookie === process.env.ADMIN_PASSWORD;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const status = typeof (body as Record<string, unknown>).status === "string"
    ? ((body as Record<string, unknown>).status as string)
    : "";
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const completed_at = status === "done" ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("update_requests")
    .update({ status, completed_at })
    .eq("id", params.id);
  if (error) {
    console.error("[admin/updates/:id] PATCH failed", { id: params.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add inline updates panel to SiteEditor**

`src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` is the founder's per-tenant edit screen. Read it first:

```bash
cat src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx | head -50
```

It's a client component that takes the tenant + preview as props. Find a good place for a new panel (e.g. near the top, after the header). Add this panel — exact placement is at the engineer's discretion since the file is large; just put it inside the main content column where existing panels live:

```tsx
{tenant?.id && <FounderUpdatesPanel tenantId={tenant.id} />}
```

And import at top:
```tsx
import { FounderUpdatesPanel } from "./FounderUpdatesPanel";
```

Then create `src/app/(admin)/clients/[tenantId]/edit/FounderUpdatesPanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type UpdateRequest = {
  id: string;
  category: string;
  description: string;
  attachment_url: string | null;
  status: "pending" | "in_progress" | "done";
  created_at: string;
};

const STATUS_PILL: Record<string, string> = {
  pending: "bg-pink-100 text-pink-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
};

export function FounderUpdatesPanel({ tenantId }: { tenantId: string }) {
  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/updates/list?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } catch {
      // ignore — empty list shows
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function setStatus(id: string, status: string) {
    const prev = requests;
    setRequests((list) => list.map((r) => (r.id === id ? { ...r, status: status as UpdateRequest["status"] } : r)));
    try {
      const res = await fetch(`/api/admin/updates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) setRequests(prev);
    } catch {
      setRequests(prev);
    }
  }

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-4">
      <div className="text-sm font-semibold text-amber-900 mb-2">
        📥 Update requests ({requests.filter((r) => r.status !== "done").length} open)
      </div>
      <div className="space-y-2">
        {requests.slice(0, 5).map((r) => (
          <div key={r.id} className="bg-white rounded p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs uppercase tracking-wider text-gray-500">
                  {r.category} · {new Date(r.created_at).toLocaleDateString()}
                </div>
                <div className="mt-1 whitespace-pre-wrap">{r.description}</div>
                {r.attachment_url && (
                  <a
                    href={r.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-pink-700 underline mt-1 inline-block"
                  >
                    View attachment ↗
                  </a>
                )}
              </div>
              <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap " + STATUS_PILL[r.status]}>
                {r.status.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              {r.status === "pending" && (
                <button onClick={() => setStatus(r.id, "in_progress")} className="text-xs text-amber-700 underline">
                  Start
                </button>
              )}
              {r.status !== "done" && (
                <button onClick={() => setStatus(r.id, "done")} className="text-xs text-green-700 underline">
                  Mark done
                </button>
              )}
              {r.status === "done" && (
                <button onClick={() => setStatus(r.id, "pending")} className="text-xs text-gray-500 underline">
                  Reopen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add a list endpoint for founder fetching**

Create `src/app/api/admin/updates/list/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!cookie && cookie === process.env.ADMIN_PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = new URL(request.url).searchParams.get("tenantId") || "";
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "Invalid tenantId" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("update_requests")
    .select("id, category, description, attachment_url, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[admin/updates/list] fetch failed", { tenantId, error });
    return NextResponse.json({ requests: [] });
  }
  return NextResponse.json({ requests: data ?? [] });
}
```

- [ ] **Step 4: Type check + commit**

```bash
npx tsc --noEmit
git add src/app/api/admin/updates/\[id\]/route.ts src/app/api/admin/updates/list/route.ts 'src/app/(admin)/clients/[tenantId]/edit/FounderUpdatesPanel.tsx' 'src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx'
git commit -m "feat(owner-admin): founder-side update-request triage panel"
```

---

## Post-plan verification

- [ ] All tests pass:
  ```bash
  npx tsx --test src/lib/admin-auth.test.ts \
                 src/lib/admin-rate-limit.test.ts \
                 src/lib/admin-rollups.test.ts \
                 src/lib/admin-visits.test.ts \
                 src/lib/api-rate-limit.test.ts \
                 src/lib/admin-bookings.test.ts
  ```
  Should still be 41/41 (no new tests in this plan — all I/O-bound code).

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean except the pre-existing TemplateBooking warning
- [ ] Migration 014 + storage bucket applied in Supabase

- [ ] **Manual smoke tests:**
  - **Forgot PIN**: visit `/admin`, click "Forgot PIN?", enter the email on file → check inbox → click reset link → set 6-digit PIN → confirm message → `/admin` accepts the new PIN.
  - **Change PIN** from Settings: enter current → new → confirm → "PIN updated" → sign out → sign back in with new PIN.
  - **Update request**: file one with a photo → confirm it appears in `/admin/updates` with PENDING status → check founder email arrives → on `/clients/[id]/edit`, see the panel → click Start → status changes → click Mark done → row turns green.
  - **Billing**: visit `/admin/billing` → click Manage billing → redirected to Stripe portal → close → returns to `/admin/billing`.

---

## What is NOT in this plan

- **i18n** — still hardcoded English. Cross-cutting cleanup PR.
- **Cross-tenant founder updates queue** (`/admin/updates-queue` listing requests across all tenants). The current per-tenant inline panel covers the typical workflow; a global queue is nice-to-have.
- **`tenants.timezone` column** for proper local-time date math — separate hardening PR (also fixes Plan 2/3 follow-ups F1).
- **Founder-auth HMAC migration** — still uses `cookie === ADMIN_PASSWORD`. Separate PR.
- **Editable `admin_email`** — not surfaced in Settings. Founder sets it via SQL if needed (rare).

---

## Self-review notes

**Spec coverage (§Update requests):**
- Owner files request via /admin/updates/new with category + description + optional photo → Tasks 7, 8.
- List with pills → Task 8.
- Founder triage with status changes → Task 10.

**Spec coverage (§Billing):**
- Status badge → Task 9.
- Past-due banner → Task 9.
- Stripe portal redirect → Task 9.

**Spec coverage (§Settings):**
- Email read-only → Task 6.
- Change PIN form → Tasks 3, 6.
- Sign out → Task 6 (uses existing SignOutButton).

**Spec coverage (§Forgot-PIN recovery — A+B):**
- Email-link self-serve via `tenants.email`/`admin_email` → Tasks 4, 5.
- Founder reset (already shipped in Plan 1's `/api/admin/pin/set`) — for owners with no email on file, Settings page surfaces "no email — contact site manager" implicitly via the Forgot PIN form returning generic confirmation if email doesn't match.

**Placeholder scan:** No "TBD"/"TODO"/"add validation". Every step has complete code or commands. Task 10 Step 2 says "exact placement is at the engineer's discretion" for the SiteEditor panel — that's because SiteEditor.tsx is large and we don't want to dictate file structure; the inserted import + JSX line are explicit.

**Type consistency:**
- `UpdateRequest` shape defined in `updates/page.tsx` (Task 8) and `FounderUpdatesPanel.tsx` (Task 10). Same fields. Acceptable duplication — different consumers.
- `requireOwnerSession` signature unchanged, used by Tasks 3, 7, 9.
- `requireFounder` pattern identical to Plan 1's `/api/admin/pin/set` route.
- `hashPin`/`verifyPin` from Plan 1 reused in Tasks 3, 4.
