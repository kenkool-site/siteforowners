# InviteSpot Landing Page & Lead Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invitespot.app placeholder with a real landing page:
done-for-you positioning, a referral-personalized banner, and a WhatsApp-free
(email/phone) lead capture form backed by a new table and admin tab.

**Architecture:** A new `invitespot_leads` table + validation lib + API route
+ admin tab, built by closely mirroring the existing `marketing_leads`/
Requests pattern already proven in this codebase (kept as a separate table —
different business line, different fields). A small new function in
`public-access.ts` resolves an inviting event's honoree names for the
referral banner, reusing data that's already fully public. The page itself
is a Server Component (static sections + the async referral lookup) with one
Client Component for the interactive lead form.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, `node:test` /
`tsx --test`, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-27-invitespot-landing-page-design.md`

## Global Constraints

- Lead contact is **email and/or phone** — at least one required, neither
  mandatory alone. Never WhatsApp-only; the product has no WhatsApp
  integration anywhere (confirmed: `InvitationNotificationChannel = "email"
  | "sms"` in `src/lib/invitations/types.ts`).
- **No invented pricing, turnaround days, or retention months.** Every tier's
  price slot is a "Get a quote" link to the form; timing language is "we'll
  confirm when we reach out."
- **No automated outreach** (no auto-email/SMS on submission beyond the
  founder's own best-effort notification) — the founder follows up manually,
  matching the `marketing_leads` precedent exactly.
- `invitespot_leads` is a **new, separate table** from `marketing_leads` —
  do not add InviteSpot fields to the existing table or vice versa.
- Visual direction: cream `#F4EEE4` background, dark forest-green `#1F3A2E`
  accent, serif "InviteSpot" wordmark (Georgia/serif stack, matching the
  invitation pages' own typography choices) — confirmed via mockup.
- All page copy goes through next-intl under a new top-level `invitespot`
  namespace in `messages/en.json` / `messages/es.json` (English content is
  required for both tasks that touch these files; Spanish translations are
  provided verbatim in each task's brief — do not invent your own Spanish
  wording).

---

### Task 1: `invitespot_leads` table and validation lib

**Files:**
- Create: `supabase/migrations/064_invitespot_leads.sql`
- Create: `src/lib/invitespot-lead.ts`
- Test: `src/lib/invitespot-lead.test.ts`

**Interfaces:**
- Produces: `EVENT_TYPES` (`readonly ["birthday", "wedding", "naming", "burial", "anniversary", "other"]`), `type EventType`, `type InvitespotLeadStatus = "new" | "contacted" | "archived"`, `interface InvitespotLeadRow` (the full DB row shape, snake_case, for the admin table), `type InvitespotLead` (the parsed/camelCase shape for the API route to insert), `type ParseInvitespotLeadResult = { ok: true; value: InvitespotLead } | { ok: false; error: string }`, `function parseInvitespotLead(body: unknown): ParseInvitespotLeadResult`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/invitespot-lead.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseInvitespotLead } from "./invitespot-lead";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Chidinma O.",
    email: "chidinma@example.com",
    phone: "",
    eventType: "birthday",
    roughDate: "March",
    guestCount: 300,
    referralSlug: "mercy-john-lx9cwn",
    ...overrides,
  };
}

test("parses a valid lead with email only", () => {
  const result = parseInvitespotLead(validBody());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    name: "Chidinma O.",
    email: "chidinma@example.com",
    phone: "",
    eventType: "birthday",
    roughDate: "March",
    guestCount: 300,
    referralSlug: "mercy-john-lx9cwn",
  });
});

test("parses a valid lead with phone only, no email", () => {
  const result = parseInvitespotLead(validBody({ email: "", phone: "+1 555 000 0000" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.email, "");
  assert.equal(result.value.phone, "+1 555 000 0000");
});

test("rejects when both email and phone are blank", () => {
  const result = parseInvitespotLead(validBody({ email: "", phone: "" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /email or phone/i);
});

test("rejects a missing name", () => {
  const result = parseInvitespotLead(validBody({ name: "" }));
  assert.equal(result.ok, false);
});

test("rejects an invalid eventType", () => {
  const result = parseInvitespotLead(validBody({ eventType: "quinceanera" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /planning/i);
});

test("roughDate, guestCount, and referralSlug are all optional", () => {
  const result = parseInvitespotLead(validBody({ roughDate: undefined, guestCount: undefined, referralSlug: undefined }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.roughDate, "");
  assert.equal(result.value.guestCount, null);
  assert.equal(result.value.referralSlug, "");
});

test("guestCount coerces a non-numeric value to null rather than throwing", () => {
  const result = parseInvitespotLead(validBody({ guestCount: "not a number" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.guestCount, null);
});

test("trims and length-caps free text fields", () => {
  const result = parseInvitespotLead(validBody({ name: "  Chidinma O.  ", roughDate: "x".repeat(300) }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, "Chidinma O.");
  assert.equal(result.value.roughDate.length, 120);
});

test("rejects a non-object body", () => {
  const result = parseInvitespotLead(null);
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/invitespot-lead.test.ts`
Expected: FAIL — `./invitespot-lead` module does not exist yet.

- [ ] **Step 3: Create `src/lib/invitespot-lead.ts`**

```ts
export const EVENT_TYPES = ["birthday", "wedding", "naming", "burial", "anniversary", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type InvitespotLeadStatus = "new" | "contacted" | "archived";

export interface InvitespotLeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  event_type: string;
  rough_date: string | null;
  guest_count: number | null;
  referral_slug: string | null;
  status: InvitespotLeadStatus;
  created_at: string;
}

export type InvitespotLead = {
  name: string;
  email: string;
  phone: string;
  eventType: EventType;
  roughDate: string;
  guestCount: number | null;
  referralSlug: string;
};

type ParseResult =
  | { ok: true; value: InvitespotLead }
  | { ok: false; error: string };

function cleanString(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function cleanGuestCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export function parseInvitespotLead(body: unknown): ParseResult {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = cleanString(data.name);
  const email = cleanString(data.email);
  const phone = cleanString(data.phone, 40);
  const eventType = cleanString(data.eventType, 20);
  const roughDate = cleanString(data.roughDate, 120);
  const guestCount = cleanGuestCount(data.guestCount);
  const referralSlug = cleanString(data.referralSlug, 120);

  if (!name) {
    return { ok: false, error: "Your name is required." };
  }
  if (!email && !phone) {
    return { ok: false, error: "An email or phone number is required." };
  }
  if (!isEventType(eventType)) {
    return { ok: false, error: "Let us know what you're planning." };
  }

  return {
    ok: true,
    value: { name, email, phone, eventType, roughDate, guestCount, referralSlug },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitespot-lead.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Create the migration**

Create `supabase/migrations/064_invitespot_leads.sql`:

```sql
-- Lead capture from the invitespot.app landing page's "Tell us about your
-- event" form. Separate from marketing_leads (SiteForOwners' own salon/
-- barbershop lead funnel) — different business line, different fields.
CREATE TABLE IF NOT EXISTS invitespot_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text,
  phone         text,
  event_type    text NOT NULL,
  rough_date    text,
  guest_count   integer,
  referral_slug text,
  status        text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'archived')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitespot_leads_created_at
  ON invitespot_leads (created_at DESC);

-- No public policies: all access is via the service-role admin client,
-- matching marketing_leads.
ALTER TABLE invitespot_leads ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/064_invitespot_leads.sql src/lib/invitespot-lead.ts src/lib/invitespot-lead.test.ts
git commit -m "feat: add invitespot_leads table and lead validation"
```

---

### Task 2: Lead submission API route

**Files:**
- Create: `src/app/api/invitespot-leads/route.ts`
- Test: `src/app/api/invitespot-leads/route.test.ts`

**Interfaces:**
- Consumes: `parseInvitespotLead`, `InvitespotLead` from Task 1. `checkRateLimit`, `getClientIp`, `hashIp` from `src/lib/api-rate-limit.ts` (existing, signatures: `checkRateLimit(bucket: string, windowSeconds: number, maxRequests: number): Promise<boolean>`; `hashIp(ip: string): string`; `getClientIp(headers: Headers): string`).
- Produces: `POST` handler at `/api/invitespot-leads`. No other exports (this is a `route.ts` file — per this repo's own convention, it may only export HTTP handlers and framework config constants, or `npm run build` fails a typed-routes check that `tsc --noEmit` does not catch).

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/invitespot-leads/route.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

const ENDPOINT = "http://localhost:3000/api/invitespot-leads";

function request(body: unknown): NextRequest {
  return new NextRequest(new URL(ENDPOINT), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

test("rejects malformed JSON with 400", async () => {
  const { POST } = await import("./route");
  const req = new NextRequest(new URL(ENDPOINT), { method: "POST", body: "not json" });
  const response = await POST(req);
  assert.equal(response.status, 400);
});

// A syntactically valid body that fails parseInvitespotLead's own rules
// (both contact fields blank) must 400 before any rate-limit/DB call —
// confirmed by the response body carrying parseInvitespotLead's own error text.
test("rejects a body with no email or phone with 400 and the validation error", async () => {
  const { POST } = await import("./route");
  const response = await POST(request({ name: "Chidinma O.", email: "", phone: "", eventType: "birthday" }));
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.match(data.error, /email or phone/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/app/api/invitespot-leads/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Create `src/app/api/invitespot-leads/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/api-rate-limit";
import { parseInvitespotLead } from "@/lib/invitespot-lead";
import { createAdminClient } from "@/lib/supabase/admin";

const LEAD_WINDOW_SECONDS = 60 * 60;
const LEAD_MAX_REQUESTS = 5;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const FROM = process.env.EMAIL_FROM || "SiteForOwners <hello@siteforowners.com>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(`invitespot-leads:${ipHash}`, LEAD_WINDOW_SECONDS, LEAD_MAX_REQUESTS);
  if (!allowed) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = parseInvitespotLead(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, email, phone, eventType, roughDate, guestCount, referralSlug } = parsed.value;

  // 1) Persist the lead first so it is captured even if email is unconfigured
  //    or Resend fails. Service-role insert bypasses RLS (matches marketing_leads).
  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("invitespot_leads").insert({
    name,
    email: email || null,
    phone: phone || null,
    event_type: eventType,
    rough_date: roughDate || null,
    guest_count: guestCount,
    referral_slug: referralSlug || null,
  });
  if (insertError) {
    // Don't lose the lead to the user — log and continue to email.
    console.error("invitespot_leads insert failed", insertError);
  }

  // 2) Email the founder, best-effort. Never fail the request on email errors.
  if (!resend || !ADMIN_EMAIL) {
    console.log("Skipping invitespot lead email — RESEND_API_KEY or ADMIN_EMAIL not set", { name, email, phone, eventType });
    return NextResponse.json({ ok: true });
  }

  const safeName = escapeHtml(name);
  const safeEmail = email ? escapeHtml(email) : "";
  const safePhone = phone ? escapeHtml(phone) : "";
  const safeEventType = escapeHtml(eventType);
  const safeRoughDate = roughDate ? escapeHtml(roughDate) : "";
  const safeReferral = referralSlug ? escapeHtml(referralSlug) : "";

  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      replyTo: email || undefined,
      subject: `New InviteSpot lead: ${name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto;">
          <div style="background: #1F3A2E; padding: 20px 24px; border-radius: 16px 16px 0 0;">
            <p style="margin: 0 0 4px; color: rgba(244,238,228,0.78); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700;">InviteSpot lead</p>
            <h1 style="margin: 0; color: #F4EEE4; font-size: 22px;">${safeName}</h1>
          </div>
          <div style="background: #fff; border: 1px solid #d8cedc; border-top: 0; padding: 24px; border-radius: 0 0 16px 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; width: 132px; color: #6b7280; font-size: 14px;">Planning</td>
                <td style="padding: 8px 0; color: #111827; font-weight: 700;">${safeEventType}</td>
              </tr>
              ${safeEmail ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email</td>
                  <td style="padding: 8px 0;"><a href="mailto:${safeEmail}" style="color: #1F3A2E;">${safeEmail}</a></td>
                </tr>
              ` : ""}
              ${safePhone ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td>
                  <td style="padding: 8px 0;"><a href="tel:${safePhone}" style="color: #1F3A2E;">${safePhone}</a></td>
                </tr>
              ` : ""}
              ${safeRoughDate ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Roughly when</td>
                  <td style="padding: 8px 0; color: #111827;">${safeRoughDate}</td>
                </tr>
              ` : ""}
              ${guestCount ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Guests</td>
                  <td style="padding: 8px 0; color: #111827;">${guestCount}</td>
                </tr>
              ` : ""}
              ${safeReferral ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Referred by</td>
                  <td style="padding: 8px 0; color: #111827;">${safeReferral}</td>
                </tr>
              ` : ""}
            </table>
            <p style="margin: 20px 0 0; color: #6b7280; font-size: 13px;">View it in the admin InviteSpot Leads tab.</p>
          </div>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("invitespot lead email failed", emailError);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/app/api/invitespot-leads/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors (the build step matters here — this repo's own convention
is that a `route.ts` with an extra named export fails a typed-routes check
`tsc --noEmit` alone does not catch; this file has no extra exports, but
verify the build succeeds regardless).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/invitespot-leads/route.ts src/app/api/invitespot-leads/route.test.ts
git commit -m "feat: add invitespot lead submission API route"
```

---

### Task 3: Admin "InviteSpot Leads" tab

**Files:**
- Create: `src/app/(admin)/invitespot-leads/page.tsx`
- Create: `src/app/(admin)/invitespot-leads/InvitespotLeadsTable.tsx`
- Create: `src/app/(admin)/invitespot-leads/InvitespotLeadActions.tsx`
- Create: `src/app/api/admin/invitespot-leads/route.ts`
- Test: `src/app/api/admin/invitespot-leads/route.test.ts`
- Modify: `src/middleware.ts`
- Modify: `src/lib/admin-navigation.ts`

**Interfaces:**
- Consumes: `InvitespotLeadRow`, `InvitespotLeadStatus` from Task 1. `StatCards` from `src/app/(admin)/_components/StatCards.tsx` (existing: `StatCards({ stats: { label: string; value: ReactNode; tone?: "default" | "amber" | "green" }[] })`).
- Produces: no new shared exports — this is a self-contained admin surface.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/invitespot-leads/route.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

const URL = "http://localhost:3000/api/admin/invitespot-leads";

test("rejects an unauthenticated request with 401", async () => {
  const original = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-admin-password";
  try {
    const { POST } = await import("./route");
    const request = new NextRequest(new URL(URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: "11111111-1111-1111-1111-111111111111", status: "contacted" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 401);
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});

test("rejects a malformed leadId with 400, past the auth check", async () => {
  const original = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-admin-password";
  try {
    const { POST } = await import("./route");
    const request = new NextRequest(new URL(URL), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "admin_session=test-admin-password" },
      body: JSON.stringify({ leadId: "not-a-uuid", status: "contacted" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});

test("rejects an invalid status, past the leadId check", async () => {
  const original = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "test-admin-password";
  try {
    const { POST } = await import("./route");
    const request = new NextRequest(new URL(URL), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "admin_session=test-admin-password" },
      body: JSON.stringify({ leadId: "11111111-1111-1111-1111-111111111111", status: "banana" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  } finally {
    if (original === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = original;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/app/api/admin/invitespot-leads/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Create `src/app/api/admin/invitespot-leads/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["new", "contacted", "archived"]);

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!ADMIN_PASSWORD && cookie === ADMIN_PASSWORD;
}

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

  const status = typeof body.status === "string" ? body.status : "";
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("invitespot_leads").update({ status }).eq("id", leadId);
  if (error) {
    console.error("[admin/invitespot-leads] update failed", { leadId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/app/api/admin/invitespot-leads/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Create `src/app/(admin)/invitespot-leads/InvitespotLeadActions.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InvitespotLeadStatus } from "@/lib/invitespot-lead";

export function InvitespotLeadActions({ leadId, status }: { leadId: string; status: InvitespotLeadStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (next: InvitespotLeadStatus) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invitespot-leads", {
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
      <div className="flex items-center gap-2">
        {status !== "contacted" && (
          <button onClick={() => setStatus("contacted")} disabled={loading} className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50">
            Mark contacted
          </button>
        )}
        {status !== "archived" ? (
          <button onClick={() => setStatus("archived")} disabled={loading} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">
            Archive
          </button>
        ) : (
          <button onClick={() => setStatus("new")} disabled={loading} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50">
            Unarchive
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Create `src/app/(admin)/invitespot-leads/InvitespotLeadsTable.tsx`**

```tsx
"use client";

import type { InvitespotLeadRow } from "@/lib/invitespot-lead";
import { InvitespotLeadActions } from "./InvitespotLeadActions";

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

function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

export function InvitespotLeadsTable({ leads }: { leads: InvitespotLeadRow[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Contact</th>
              <th className="px-5 py-3">Planning</th>
              <th className="px-5 py-3">When / guests</th>
              <th className="px-5 py-3">Referred by</th>
              <th className="px-5 py-3">When submitted</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 text-sm font-semibold text-gray-900">{lead.name}</td>
                <td className="px-5 py-4">
                  {lead.email && <a href={`mailto:${lead.email}`} className="block text-sm font-medium text-blue-600 hover:underline">{lead.email}</a>}
                  {lead.phone && <a href={`tel:${lead.phone}`} className="block text-xs text-gray-400 hover:underline">{lead.phone}</a>}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700">{lead.event_type}</td>
                <td className="px-5 py-4 text-sm text-gray-500">
                  {lead.rough_date || "—"}{lead.guest_count ? ` · ${lead.guest_count} guests` : ""}
                </td>
                <td className="px-5 py-4 text-sm text-gray-500">{lead.referral_slug || "—"}</td>
                <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">{timeAgo(lead.created_at)}</td>
                <td className="px-5 py-4" onClick={stop}>
                  <InvitespotLeadActions leadId={lead.id} status={lead.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {leads.map((lead) => (
          <div key={lead.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate text-sm font-semibold text-gray-900">{lead.name}</p>
              <span className="shrink-0 text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
            </div>
            <div className="mt-2 space-y-0.5">
              {lead.email && <a href={`mailto:${lead.email}`} className="block text-sm font-medium text-blue-600 hover:underline">{lead.email}</a>}
              {lead.phone && <a href={`tel:${lead.phone}`} className="block text-xs text-gray-400 hover:underline">{lead.phone}</a>}
              <p className="text-xs text-gray-500">{lead.event_type} · {lead.rough_date || "no date yet"}{lead.guest_count ? ` · ${lead.guest_count} guests` : ""}</p>
              {lead.referral_slug && <p className="text-xs text-gray-400">Referred by {lead.referral_slug}</p>}
            </div>
            <div className="mt-3 border-t pt-3" onClick={stop}>
              <InvitespotLeadActions leadId={lead.id} status={lead.status} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 7: Create `src/app/(admin)/invitespot-leads/page.tsx`**

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import type { InvitespotLeadRow } from "@/lib/invitespot-lead";
import { InvitespotLeadsTable } from "./InvitespotLeadsTable";
import { StatCards } from "../_components/StatCards";

async function getLeads(): Promise<InvitespotLeadRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invitespot_leads")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("Failed to fetch invitespot leads:", error);
    return [];
  }
  return (data || []) as InvitespotLeadRow[];
}

async function getLeadStats() {
  const supabase = createAdminClient();
  const { count: total } = await supabase.from("invitespot_leads").select("*", { count: "exact", head: true });
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: weekCount } = await supabase
    .from("invitespot_leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString());
  const { count: newCount } = await supabase
    .from("invitespot_leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "new");
  return { total: total || 0, thisWeek: weekCount || 0, new: newCount || 0 };
}

export const revalidate = 0;

export default async function InvitespotLeadsPage() {
  const [leads, stats] = await Promise.all([getLeads(), getLeadStats()]);

  return (
    <div>
      <StatCards
        stats={[
          { label: "Total Leads", value: stats.total },
          { label: "This Week", value: stats.thisWeek },
          { label: "New", value: stats.new, tone: "amber" },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">InviteSpot Leads</h1>
        <p className="text-sm text-gray-400">{leads.length} results</p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center">
          <p className="text-gray-400">No leads yet. They&rsquo;ll appear here when someone submits the invitespot.app form.</p>
        </div>
      ) : (
        <InvitespotLeadsTable leads={leads} />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Add the route to founder-session gating**

In `src/middleware.ts`, find:

```ts
const ADMIN_ROUTES = [
  "/admin/invitations",
  "/prospects",
  "/clients",
  "/previews",
  "/requests",
  "/onboard",
];
```

Replace it with:

```ts
const ADMIN_ROUTES = [
  "/admin/invitations",
  "/prospects",
  "/clients",
  "/previews",
  "/requests",
  "/invitespot-leads",
  "/onboard",
];
```

- [ ] **Step 9: Add the nav entry**

In `src/lib/admin-navigation.ts`, find:

```ts
export const FOUNDER_ADMIN_LINKS: readonly FounderAdminLink[] = [
  { href: "/previews", label: "Previews" },
  { href: "/demos", label: "Demos" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/requests", label: "Requests" },
  { href: "/prospects", label: "Prospects" },
  { href: "/clients", label: "Clients" },
];
```

Replace it with:

```ts
export const FOUNDER_ADMIN_LINKS: readonly FounderAdminLink[] = [
  { href: "/previews", label: "Previews" },
  { href: "/demos", label: "Demos" },
  { href: "/admin/invitations", label: "Invitations" },
  { href: "/requests", label: "Requests" },
  { href: "/invitespot-leads", label: "InviteSpot Leads" },
  { href: "/prospects", label: "Prospects" },
  { href: "/clients", label: "Clients" },
];
```

- [ ] **Step 10: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/app/\(admin\)/invitespot-leads src/app/api/admin/invitespot-leads src/middleware.ts src/lib/admin-navigation.ts
git commit -m "feat: add admin InviteSpot Leads tab"
```

---

### Task 4: Referral personalization

**Files:**
- Modify: `src/lib/invitations/public-access.ts`
- Test: `src/lib/invitations/public-access.test.ts`
- Modify: `src/components/invitations/InvitationFooter.tsx`
- Modify: `src/components/invitations/PublicInvitation.tsx`
- Modify (ripple): `src/components/invitations/PublicInvitation.render.test.tsx`

**Interfaces:**
- Produces: `getInvitationReferralDisplayName(slug: string, find?: (slug: string) => Promise<PublicInvitationLookup | null>): Promise<string | null>` from `public-access.ts` — the optional `find` parameter defaults to the real `getPublicInvitationBySlug`, matching this file's existing dependency-injection convention (its other functions take `find` as an injected dependency for testability without a live Supabase instance) so tests can inject a fake.
- `InvitationFooter` gains a required `slug: string` prop.

- [ ] **Step 1: Write the failing tests**

In `src/lib/invitations/public-access.test.ts`, add these tests (this file
already defines a top-level `invitation: PublicInvitationLookup` fixture
with `event.status: "published"` and `event.expireAt: "2026-10-12T04:00:00.000Z"`
— reuse it directly; `getEffectiveEventState` (`src/lib/invitations/state.ts`)
derives lifecycle state purely from `status`/`rsvpDeadline`/`expireAt`, not
from `startsAt`/`endsAt`, so only those three fields need overriding below):

```ts
test("getInvitationReferralDisplayName returns the honoree names for a published event", async () => {
  const name = await getInvitationReferralDisplayName("mia-and-lee", async () => invitation);
  assert.equal(name, "Mia and Lee");
});

test("getInvitationReferralDisplayName returns the honoree names for an rsvp_closed event", async () => {
  const fixture = { ...invitation, event: { ...invitation.event, status: "rsvp_closed" as const } };
  const name = await getInvitationReferralDisplayName("mia-and-lee", async () => fixture);
  assert.equal(name, "Mia and Lee");
});

test("getInvitationReferralDisplayName returns null for a draft event", async () => {
  const fixture = { ...invitation, event: { ...invitation.event, status: "draft" as const } };
  const name = await getInvitationReferralDisplayName("mia-and-lee", async () => fixture);
  assert.equal(name, null);
});

test("getInvitationReferralDisplayName returns null when the slug doesn't resolve", async () => {
  const name = await getInvitationReferralDisplayName("no-such-slug", async () => null);
  assert.equal(name, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/invitations/public-access.test.ts`
Expected: FAIL — `getInvitationReferralDisplayName` doesn't exist yet.

- [ ] **Step 3: Add the function to `public-access.ts`**

Add this import to the top of `src/lib/invitations/public-access.ts`,
alongside the existing imports:

```ts
import { getPublicInvitationBySlug } from "./repository";
```

Add this function anywhere after `resolvePublicInvitationPage`:

```ts
// Powers the invitation footer's "Hosting your own event?" referral banner
// on the invitespot.app landing page: given the slug of the invitation that
// sent a visitor there (via ?from=), returns just its honoree names — never
// anything else about the event, and never for an event a stranger couldn't
// already see by visiting its own invitation page directly (the exact same
// state gate resolvePublicInvitationPage itself applies).
export async function getInvitationReferralDisplayName(
  slug: string,
  find: (slug: string) => Promise<PublicInvitationLookup | null> = getPublicInvitationBySlug,
): Promise<string | null> {
  const invitation = await find(slug);
  if (!invitation) return null;
  const state = getEffectiveEventState(invitation.event, new Date());
  if (state !== "published" && state !== "rsvp_closed") return null;
  return invitation.event.honoreeNames;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/public-access.test.ts`
Expected: PASS (all existing tests plus the 4 new ones)

- [ ] **Step 5: Thread `slug` through `InvitationFooter`**

The current full contents of `src/components/invitations/InvitationFooter.tsx`:

```tsx
import { useTranslations } from "next-intl";

export function InvitationFooter() {
  const t = useTranslations("invitations.public.footer");
  return (
    <footer data-invitation-footer="true" className="px-5 pb-24 pt-14 text-center text-xs">
      <p className="font-medium">
        <a href="https://www.invitespot.app/" className="underline decoration-current/40 underline-offset-4">{t("marketingCta")}</a>
      </p>
      <p className="mt-2 opacity-65">
        <a href="https://www.invitespot.app/" className="underline decoration-current/40 underline-offset-4">{t("poweredBy")}</a>
        <span aria-hidden="true" className="mx-2">·</span>
        <a href="https://www.siteforowners.com/invitations/login" className="underline decoration-current/40 underline-offset-4">{t("hostSignIn")}</a>
      </p>
    </footer>
  );
}
```

Replace it with:

```tsx
import { useTranslations } from "next-intl";

export function InvitationFooter({ slug }: { slug: string }) {
  const t = useTranslations("invitations.public.footer");
  return (
    <footer data-invitation-footer="true" className="px-5 pb-24 pt-14 text-center text-xs">
      <p className="font-medium">
        <a href={`https://www.invitespot.app/?from=${encodeURIComponent(slug)}`} className="underline decoration-current/40 underline-offset-4">{t("marketingCta")}</a>
      </p>
      <p className="mt-2 opacity-65">
        <a href="https://www.invitespot.app/" className="underline decoration-current/40 underline-offset-4">{t("poweredBy")}</a>
        <span aria-hidden="true" className="mx-2">·</span>
        <a href="https://www.siteforowners.com/invitations/login" className="underline decoration-current/40 underline-offset-4">{t("hostSignIn")}</a>
      </p>
    </footer>
  );
}
```

Note the "Powered by InviteSpot" link (second `<a>`) keeps its bare URL,
unchanged — only the marketing CTA (first `<a>`) carries the `?from=`
referral param.

- [ ] **Step 6: Update the one call site**

In `src/components/invitations/PublicInvitation.tsx`, find:

```tsx
      <InvitationFooter />
```

Replace it with:

```tsx
      <InvitationFooter slug={event.slug} />
```

- [ ] **Step 7: Fix the resulting ripple in `PublicInvitation.render.test.tsx`**

This file's fixture event uses `slug: "mia-and-lee"` (line 26). One existing
test asserts the marketing CTA's href has no query string, which no longer
holds once it carries `?from=`. Find:

```ts
  assert.match(html, /href="https:\/\/www\.invitespot\.app\/"[^>]*>Hosting your own event\? Create your invitation with InviteSpot/);
```

Replace it with:

```ts
  assert.match(html, /href="https:\/\/www\.invitespot\.app\/\?from=mia-and-lee"[^>]*>Hosting your own event\? Create your invitation with InviteSpot/);
```

The next two lines in that same test (checking "Powered by InviteSpot" and
"Host sign in") are unaffected — leave them exactly as they are.

- [ ] **Step 8: Run the affected tests**

Run: `npx tsx --test src/components/invitations/PublicInvitation.render.test.tsx`
Expected: PASS (all tests in the file, including the updated one).

- [ ] **Step 9: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/invitations/public-access.ts src/lib/invitations/public-access.test.ts src/components/invitations/InvitationFooter.tsx src/components/invitations/PublicInvitation.tsx src/components/invitations/PublicInvitation.render.test.tsx
git commit -m "feat: personalize invitespot.app referral banner from the inviting event"
```

---

### Task 5: The landing page itself

**Files:**
- Modify: `src/app/invitespot/page.tsx`
- Create: `src/components/invitespot/InvitespotLeadForm.tsx`
- Create: `src/components/invitespot/InviteSpotLandingContent.tsx`
- Modify: `src/app/invitespot/page.render.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `getInvitationReferralDisplayName` from Task 4. `EVENT_TYPES`, `type EventType` from Task 1 (for the form's chip options — the client component needs only the value strings, not the DB row/status types). The `/api/invitespot-leads` route from Task 2 (the form POSTs there). `InvitationPublicProvider` from `src/components/invitations/InvitationPublicProvider.tsx` (existing, unmodified — a `"use client"` wrapper providing `NextIntlClientProvider` with both locale message files already loaded: `InvitationPublicProvider({ locale: "en" | "es", timeZone: string, children })`).
- Produces: no new shared exports — this is the page itself plus two Client Components (`InvitespotLeadForm`, `InviteSpotLandingContent`).

- [ ] **Step 1: Add the `invitespot` i18n namespace**

In `messages/en.json`, find the file's closing sequence (the very end of
the file):

```json
    "footer": {
      "contact": "Contact",
      "hours": "Hours",
      "closed": "Closed"
    }
  }
}
```

Replace it with (adding a comma after the `homeServices` object's closing
`}`, then the new top-level `invitespot` key):

```json
    "footer": {
      "contact": "Contact",
      "hours": "Hours",
      "closed": "Closed"
    }
  },
  "invitespot": {
    "nav": { "getStarted": "Get started" },
    "referralBanner": "You came from {names}'s page",
    "hero": {
      "title": "You send the details. We build the page.",
      "subtitle": "Invitations, RSVPs, and guest photos — for weddings, birthdays, naming ceremonies, burials, and anniversaries. Nothing to design yourself.",
      "cta": "Tell us about your event",
      "microcopy": "We'll reply by email or phone with examples and a quote."
    },
    "whatYouGet": {
      "heading": "What you get",
      "address": { "title": "Your own web address", "body": "Your names, not a booking code. Everything lives in one place guests can find again." },
      "rsvps": { "title": "RSVPs people actually answer", "body": "Reminders go out by text and email, not just one channel a guest might miss." },
      "photos": { "title": "Every guest's photos, in one place", "body": "One printed QR code on the tables. Guests upload from their phones — no app, no sign-up — and it's all sorted for you after." }
    },
    "howItWorks": {
      "heading": "How it works",
      "step1": { "title": "Send us the details", "body": "Date, venue, colours, programme, a few photos. A quick message is enough." },
      "step2": { "title": "We build it and send you the link", "body": "You never touch an editor — we handle the whole build." },
      "step3": { "title": "Share it, and we do the chasing", "body": "Printed QR cards for the tables, and reminders that go out before and after the day." }
    },
    "pricing": {
      "heading": "What it costs",
      "tier1": { "title": "Up to 150 guests", "body": "One event · invitation, RSVP, photos" },
      "tier2": { "title": "150–400 guests", "body": "Two events · traditional and white wedding" },
      "tier3": { "title": "400 guests and up", "body": "We send the messages and chase the replies" },
      "cta": "Get a quote",
      "note": "One payment, no subscription — every plan includes your page and photo gallery. We'll confirm exact pricing and how long everything stays up when we reach out."
    },
    "form": {
      "heading": "Tell us about your event",
      "subtitle": "A few questions. We reply by email or phone with a real example and a quote.",
      "nameLabel": "Your name",
      "namePlaceholder": "Chidinma O.",
      "contactLabel": "How should we reach you? (at least one)",
      "emailPlaceholder": "Email",
      "phonePlaceholder": "Phone",
      "planningLabel": "What are you planning?",
      "eventTypes": { "birthday": "Birthday", "wedding": "Wedding", "naming": "Naming", "burial": "Burial", "anniversary": "Anniversary", "other": "Something else" },
      "whenLabel": "Roughly when",
      "whenPlaceholder": "March",
      "guestsLabel": "Guests",
      "guestsPlaceholder": "300",
      "submit": "Send",
      "submitting": "Sending…",
      "reassurance": "We reply once. No list, no newsletter.",
      "success": "Thanks — we'll be in touch by email or phone shortly.",
      "genericError": "Something went wrong — please try again."
    },
    "footer": { "wordmark": "InviteSpot", "domain": "invitespot.app" }
  }
}
```

In `messages/es.json`, find the matching closing sequence:

```json
    "footer": {
      "contact": "Contacto",
      "hours": "Horario",
      "closed": "Cerrado"
    }
  }
}
```

Replace it with:

```json
    "footer": {
      "contact": "Contacto",
      "hours": "Horario",
      "closed": "Cerrado"
    }
  },
  "invitespot": {
    "nav": { "getStarted": "Comenzar" },
    "referralBanner": "Llegaste desde la página de {names}",
    "hero": {
      "title": "Tú nos das los detalles. Nosotros creamos la página.",
      "subtitle": "Invitaciones, confirmaciones de asistencia y fotos de invitados — para bodas, cumpleaños, ceremonias de nombramiento, funerales y aniversarios. No tienes que diseñar nada.",
      "cta": "Cuéntanos sobre tu evento",
      "microcopy": "Te responderemos por correo o teléfono con ejemplos y una cotización."
    },
    "whatYouGet": {
      "heading": "Qué obtienes",
      "address": { "title": "Tu propia dirección web", "body": "Tus nombres, no un código de reserva. Todo vive en un solo lugar que los invitados pueden volver a encontrar." },
      "rsvps": { "title": "Confirmaciones que la gente sí responde", "body": "Los recordatorios se envían por mensaje de texto y correo, no solo por un canal que un invitado podría pasar por alto." },
      "photos": { "title": "Las fotos de cada invitado, en un solo lugar", "body": "Un código QR impreso en las mesas. Los invitados suben fotos desde su teléfono — sin apps, sin registro — y todo queda organizado para ti después." }
    },
    "howItWorks": {
      "heading": "Cómo funciona",
      "step1": { "title": "Envíanos los detalles", "body": "Fecha, lugar, colores, programa, algunas fotos. Un mensaje breve es suficiente." },
      "step2": { "title": "La creamos y te enviamos el enlace", "body": "Nunca tocas un editor — nosotros hacemos todo el trabajo." },
      "step3": { "title": "Compártelo, y nosotros damos seguimiento", "body": "Tarjetas con código QR para las mesas, y recordatorios antes y después del evento." }
    },
    "pricing": {
      "heading": "Qué cuesta",
      "tier1": { "title": "Hasta 150 invitados", "body": "Un evento · invitación, confirmaciones, fotos" },
      "tier2": { "title": "150–400 invitados", "body": "Dos eventos · boda tradicional y boda de blanco" },
      "tier3": { "title": "400 invitados o más", "body": "Nosotros enviamos los mensajes y damos seguimiento a las respuestas" },
      "cta": "Solicitar cotización",
      "note": "Un solo pago, sin suscripción — cada plan incluye tu página y galería de fotos. Confirmaremos el precio exacto y cuánto tiempo estará todo disponible cuando te contactemos."
    },
    "form": {
      "heading": "Cuéntanos sobre tu evento",
      "subtitle": "Unas preguntas. Te responderemos por correo o teléfono con un ejemplo real y una cotización.",
      "nameLabel": "Tu nombre",
      "namePlaceholder": "Chidinma O.",
      "contactLabel": "¿Cómo prefieres que te contactemos? (al menos uno)",
      "emailPlaceholder": "Correo",
      "phonePlaceholder": "Teléfono",
      "planningLabel": "¿Qué estás planeando?",
      "eventTypes": { "birthday": "Cumpleaños", "wedding": "Boda", "naming": "Nombramiento", "burial": "Funeral", "anniversary": "Aniversario", "other": "Otra cosa" },
      "whenLabel": "Aproximadamente cuándo",
      "whenPlaceholder": "Marzo",
      "guestsLabel": "Invitados",
      "guestsPlaceholder": "300",
      "submit": "Enviar",
      "submitting": "Enviando…",
      "reassurance": "Respondemos una sola vez. Sin listas, sin boletines.",
      "success": "Gracias — te contactaremos pronto por correo o teléfono.",
      "genericError": "Algo salió mal — inténtalo de nuevo."
    },
    "footer": { "wordmark": "InviteSpot", "domain": "invitespot.app" }
  }
}
```

- [ ] **Step 2: Create the lead form Client Component**

Create `src/components/invitespot/InvitespotLeadForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EVENT_TYPES, type EventType } from "@/lib/invitespot-lead";

export function InvitespotLeadForm({ referralSlug }: { referralSlug: string | null }) {
  const t = useTranslations("invitespot.form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [roughDate, setRoughDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("genericError"));
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError(t("genericError"));
      return;
    }
    if (!eventType) {
      setError(t("genericError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/invitespot-leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          eventType,
          roughDate,
          guestCount: guestCount ? Number(guestCount) : null,
          referralSlug: referralSlug ?? "",
        }),
      });
      if (!response.ok) throw new Error("failed");
      setSuccess(true);
    } catch {
      setError(t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section id="event-form" className="bg-[#1F3A2E] px-6 py-16 text-center">
        <p className="mx-auto max-w-md text-lg font-medium text-[#F4EEE4]">{t("success")}</p>
      </section>
    );
  }

  return (
    <section id="event-form" className="bg-[#1F3A2E] px-6 py-16">
      <form onSubmit={handleSubmit} className="mx-auto max-w-md">
        <h2 className="font-serif text-3xl text-[#F4EEE4]">{t("heading")}</h2>
        <p className="mt-1.5 text-sm text-[#B9C4BC]">{t("subtitle")}</p>

        <label className="mt-6 block text-xs font-semibold text-[#D8E0DA]">{t("nameLabel")}</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("namePlaceholder")}
          className="mt-1.5 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm text-[#241F1A]"
        />

        <label className="mt-4 block text-xs font-semibold text-[#D8E0DA]">{t("contactLabel")}</label>
        <div className="mt-1.5 flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("emailPlaceholder")}
            className="min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm text-[#241F1A]"
          />
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("phonePlaceholder")}
            className="min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm text-[#241F1A]"
          />
        </div>

        <label className="mt-4 block text-xs font-semibold text-[#D8E0DA]">{t("planningLabel")}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEventType(type)}
              className={`min-h-11 rounded-full px-4 py-2 text-sm ${
                eventType === type
                  ? "border-2 border-[#F4EEE4] bg-[#F4EEE4] font-bold text-[#1F3A2E]"
                  : "border border-[#5C7268] bg-transparent text-[#F4EEE4]"
              }`}
            >
              {t(`eventTypes.${type}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-[#D8E0DA]">{t("whenLabel")}</label>
            <input
              value={roughDate}
              onChange={(event) => setRoughDate(event.target.value)}
              placeholder={t("whenPlaceholder")}
              className="mt-1.5 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm text-[#241F1A]"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-[#D8E0DA]">{t("guestsLabel")}</label>
            <input
              type="number"
              min="1"
              value={guestCount}
              onChange={(event) => setGuestCount(event.target.value)}
              placeholder={t("guestsPlaceholder")}
              className="mt-1.5 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-3.5 py-3 text-sm text-[#241F1A]"
            />
          </div>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 min-h-11 w-full rounded-lg bg-[#F4EEE4] px-4 py-3 text-sm font-bold text-[#1F3A2E] disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
        </button>
        <p className="mt-3.5 text-center text-xs text-[#8FA095]">{t("reassurance")}</p>
      </form>
    </section>
  );
}
```

- [ ] **Step 3: Create the static landing content Client Component**

This codebase's async Server Components don't call `useTranslations`
directly — they wrap their content in the existing
`src/components/invitations/InvitationPublicProvider.tsx` (a `"use client"`
component that provides `NextIntlClientProvider` with both locale message
files already loaded), and a nested Client Component does the actual
rendering via `useTranslations`. This mirrors that exact pattern (see
`src/app/invitations/login/page.tsx` for the same shape applied to a
simpler page).

Create `src/components/invitespot/InviteSpotLandingContent.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { InvitespotLeadForm } from "./InvitespotLeadForm";

export function InviteSpotLandingContent({ referralName, referralSlug }: { referralName: string | null; referralSlug: string | null }) {
  const t = useTranslations("invitespot");

  return (
    <main className="bg-[#F4EEE4] text-[#241F1A]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-serif text-xl font-semibold text-[#1F3A2E]">InviteSpot</span>
        <a href="#event-form" className="text-sm font-medium text-[#1F3A2E]">{t("nav.getStarted")}</a>
      </header>

      {referralName && (
        <div className="mx-auto max-w-5xl px-6">
          <p className="rounded-lg bg-[#E7E0D3] px-4 py-2.5 text-sm text-[#5b4f3f]">
            ♡ {t("referralBanner", { names: referralName })}
          </p>
        </div>
      )}

      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold leading-tight sm:text-5xl">{t("hero.title")}</h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-[#5b5147]">{t("hero.subtitle")}</p>
        <a href="#event-form" className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#1F3A2E] px-8 py-3.5 text-base font-semibold text-[#F4EEE4]">
          {t("hero.cta")}
        </a>
        <p className="mt-3 text-xs text-[#8a7f70]">{t("hero.microcopy")}</p>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7f70]">{t("whatYouGet.heading")}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {(["address", "rsvps", "photos"] as const).map((key) => (
            <div key={key} className="rounded-xl border border-[#e5dfd0] bg-white p-5">
              <h3 className="font-semibold">{t(`whatYouGet.${key}.title`)}</h3>
              <p className="mt-2 text-sm text-[#5b5147]">{t(`whatYouGet.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7f70]">{t("howItWorks.heading")}</p>
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          {(["step1", "step2", "step3"] as const).map((key, index) => (
            <div key={key}>
              <div className="flex size-8 items-center justify-center rounded-full bg-[#1F3A2E] text-sm font-semibold text-[#F4EEE4]">{index + 1}</div>
              <h3 className="mt-3 font-semibold">{t(`howItWorks.${key}.title`)}</h3>
              <p className="mt-2 text-sm text-[#5b5147]">{t(`howItWorks.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8a7f70]">{t("pricing.heading")}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {(["tier1", "tier2", "tier3"] as const).map((key) => (
            <div key={key} className="rounded-xl border border-[#e5dfd0] bg-white p-5">
              <h3 className="font-semibold">{t(`pricing.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm text-[#5b5147]">{t(`pricing.${key}.body`)}</p>
              <a href="#event-form" className="mt-3 inline-block text-sm font-semibold text-[#1F3A2E] underline underline-offset-4">{t("pricing.cta")}</a>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-[#5b5147]">{t("pricing.note")}</p>
      </section>

      <InvitespotLeadForm referralSlug={referralSlug} />

      <footer className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 text-xs text-[#8a7f70]">
        <span>{t("footer.wordmark")}</span>
        <span>{t("footer.domain")}</span>
      </footer>
    </main>
  );
}
```

- [ ] **Step 4: Rewrite the page**

Replace the full contents of `src/app/invitespot/page.tsx`:

```tsx
import type { Metadata } from "next";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { getInvitationReferralDisplayName } from "@/lib/invitations/public-access";
import { InviteSpotLandingContent } from "@/components/invitespot/InviteSpotLandingContent";

export const metadata: Metadata = {
  title: "InviteSpot",
  description: "Digital invitations and shared photos for your event.",
  applicationName: "InviteSpot",
  // Hardcoded (not NEXT_PUBLIC_INVITESPOT_APP_URL-driven) deliberately — a
  // canonical/OG URL should stay stable regardless of env config, unlike
  // invitationPublicUrl's no-subdomain fallback in
  // src/lib/invitations/public-url.ts.
  alternates: {
    canonical: "https://www.invitespot.app/",
  },
  openGraph: {
    type: "website",
    url: "https://www.invitespot.app/",
    siteName: "InviteSpot",
    title: "InviteSpot",
    description: "Digital invitations and shared photos for your event.",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "InviteSpot",
    description: "Digital invitations and shared photos for your event.",
    images: [],
  },
};

export default async function InviteSpotLandingPage({ searchParams }: { searchParams: { from?: string; lang?: string } }) {
  const locale = searchParams.lang === "es" ? "es" : "en";
  const referralSlug = typeof searchParams.from === "string" ? searchParams.from : null;
  let referralName: string | null = null;
  if (referralSlug) {
    try {
      referralName = await getInvitationReferralDisplayName(referralSlug);
    } catch (error) {
      // A referral-lookup hiccup must never 500 the whole landing page for a
      // guest who followed a link with a slug that happens to error — degrade
      // to "no banner" instead.
      console.error("[invitespot] referral lookup failed", { referralSlug, error });
    }
  }

  return (
    <InvitationPublicProvider locale={locale} timeZone="UTC">
      <InviteSpotLandingContent referralName={referralName} referralSlug={referralSlug} />
    </InvitationPublicProvider>
  );
}
```

- [ ] **Step 5: Update the render test**

Replace the full contents of `src/app/invitespot/page.render.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InviteSpotLandingPage from "./page";

Object.assign(globalThis, { React });

async function render(searchParams: { from?: string } = {}): Promise<string> {
  // The page wraps its own content in InvitationPublicProvider (which
  // supplies NextIntlClientProvider itself) — call the async Server
  // Component directly (valid in a plain Node test, matching how
  // src/app/invitations/login/page.render.test.tsx tests the same kind of
  // component) and render the resolved JSX with no additional wrapping.
  const element = await InviteSpotLandingPage({ searchParams });
  return renderToStaticMarkup(element);
}

test("the invitespot.app landing page renders the hero and form without a referral param", async () => {
  const html = await render();
  assert.match(html, /You send the details\. We build the page\./);
  assert.match(html, /Tell us about your event/);
  assert.doesNotMatch(html, /You came from/);
});

test("the invitespot.app landing page shows no referral banner for an unknown slug", async () => {
  const html = await render({ from: "no-such-event-slug-at-all" });
  assert.doesNotMatch(html, /You came from/);
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --test src/app/invitespot/page.render.test.tsx`
Expected: PASS (2 tests) — the page's own try/catch around the referral
lookup (Step 4) means a Supabase-credential-less test environment degrades
to "no banner" rather than throwing, so both tests pass without needing a
live database.

- [ ] **Step 7: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors. The build's route summary should show `/invitespot` as
dynamic now (it reads `searchParams`), not static like the placeholder was.

- [ ] **Step 8: Full verification**

Run the complete set of files this plan touched:

```bash
npx tsx --test \
  src/lib/invitespot-lead.test.ts \
  "src/app/api/invitespot-leads/route.test.ts" \
  "src/app/api/admin/invitespot-leads/route.test.ts" \
  src/lib/invitations/public-access.test.ts \
  src/app/invitespot/page.render.test.tsx
```

Expected: all PASS. Then run the full project suite to catch any other
ripple (this codebase has no single `npm test` script — use the same
`find ... | xargs npx tsx --test` sweep this branch's other work has used):

```bash
find src -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) -not -path "*/node_modules/*" -print0 | xargs -0 npx tsx --test
```

Expected: no failures anywhere in the project (a stray hardcoded assertion
elsewhere referencing the old two-line placeholder page, for example, would
show up here).

- [ ] **Step 9: Commit**

```bash
git add src/app/invitespot src/components/invitespot messages/en.json messages/es.json
git commit -m "feat: build the real invitespot.app landing page"
```

---

## After implementation

This plan produces working code end to end — unlike the domain migration
before it, nothing here depends on manual DNS/infrastructure work. Once
merged, the landing page and lead form are live as soon as this deploys.
Two things worth surfacing to the user once done:

- The founder should confirm `RESEND_API_KEY` and `ADMIN_EMAIL` are set in
  the production environment — without them, leads still save to the
  database (visible in the new admin tab) but no notification email is
  sent, exactly matching `marketing_leads`' own existing behavior.
- Every dollar figure, turnaround time, and retention period is
  deliberately absent per this plan's Global Constraints — filling those in
  later is a copy-only change to `messages/en.json` / `messages/es.json`
  (the `invitespot.pricing` and `invitespot.hero`/`invitespot.pricing.note`
  keys), no code change needed.
