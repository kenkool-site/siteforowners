# Pickup Checkout Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-tenant "Pickup / pay in-store" checkout mode so client websites can collect real pickup orders that notify the shop by email and are persisted for a future dashboard.

**Architecture:** Tenant-level `checkout_mode` column plus a new `orders` table. One admin-gated API route for toggling the mode, one public API route for customer order submissions. `TemplateProducts` receives the mode as a prop and branches between the existing mockup flow and a new pickup flow that POSTs to the order endpoint. Emails fire via the existing Resend integration.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (PostgreSQL + RLS), Resend, Tailwind, Framer Motion.

**Related spec:** [`docs/superpowers/specs/2026-04-23-pickup-checkout-mode-design.md`](../specs/2026-04-23-pickup-checkout-mode-design.md)

**Note on testing:** The codebase has no automated test harness. Per-task verification uses `npm run typecheck` (or `tsc --noEmit` equivalent), plus a final manual smoke test in Task 9.

---

## File Structure

**Create:**
- `supabase/migrations/010_add_checkout_mode_and_orders.sql` — new column + orders table + RLS
- `src/app/api/place-order/route.ts` — public customer order submission
- `src/app/api/update-tenant/route.ts` — admin-gated tenant update

**Modify:**
- `src/lib/email.ts` — add `sendOrderShopNotification` + `sendOrderCustomerConfirmation`
- `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` — add Checkout section and wire into save
- `src/components/templates/TemplateOrchestrator.tsx` — thread new props to `TemplateProducts`
- `src/components/templates/TemplateProducts.tsx` — branch on `checkoutMode`, implement pickup submit
- `src/app/site/[slug]/page.tsx` — fetch `checkout_mode` and business contact, pass through
- `src/app/site/[slug]/SiteClient.tsx` — pass new props into `TemplateOrchestrator`

---

## Task 1: Branch + database migration

**Files:**
- Create: `supabase/migrations/010_add_checkout_mode_and_orders.sql`

- [ ] **Step 1: Create a feature branch**

```bash
cd /Users/aws/Downloads/web-project/siteforowners
git checkout -b feat/pickup-checkout-mode
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/010_add_checkout_mode_and_orders.sql`:

```sql
-- Adds per-tenant checkout mode and orders table.
-- v1 supports 'mockup' (default, unchanged behavior) and 'pickup'.
-- 'online' will be added later as a CHECK constraint alteration.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS checkout_mode text NOT NULL DEFAULT 'mockup'
  CHECK (checkout_mode IN ('mockup', 'pickup'));

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  items jsonb NOT NULL,
  subtotal_cents integer NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  customer_notes text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'ready', 'picked_up', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id_created_at
  ON orders (tenant_id, created_at DESC);

-- Rate-limit support: look up orders by phone in the last N minutes.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone_created_at
  ON orders (tenant_id, customer_phone, created_at DESC);

-- Service-role-only. The public /api/place-order uses the service role
-- via createAdminClient; there are no client-facing queries to this table.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- No policies = deny-all for anon/authenticated; service role bypasses RLS.
```

- [ ] **Step 3: Apply the migration in Supabase**

Open Supabase SQL Editor for the production project, paste the contents of the migration file, run it. Verify both of the following succeed:

```sql
-- Expect: column exists with default 'mockup'
select column_default, is_nullable from information_schema.columns
where table_name = 'tenants' and column_name = 'checkout_mode';

-- Expect: table exists
select count(*) from orders;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010_add_checkout_mode_and_orders.sql
git commit -m "feat: add checkout_mode column and orders table"
```

---

## Task 2: Email helpers

**Files:**
- Modify: `src/lib/email.ts` (append two new exports)

- [ ] **Step 1: Add shop notification + customer confirmation functions**

Append the following to `src/lib/email.ts` (after `sendBookingConfirmation`, before end of file):

```ts
interface OrderEmailData {
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  items: Array<{ name: string; price: string; qty: number }>;
  subtotalCents: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerNotes?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parsePriceCents(price: string): number {
  const n = parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function renderItemsHtml(items: OrderEmailData["items"]): string {
  return items
    .map((item) => {
      const lineCents = parsePriceCents(item.price) * item.qty;
      return `<tr>
        <td style="padding: 4px 0; font-size: 14px;">${escapeHtml(item.name)} × ${item.qty}</td>
        <td style="padding: 4px 0; font-size: 14px; text-align: right;">${formatCents(lineCents)}</td>
      </tr>`;
    })
    .join("");
}

/**
 * Notify the shop owner of a new pickup order.
 */
export async function sendOrderShopNotification(
  shopEmail: string,
  order: OrderEmailData
) {
  if (!resend) {
    console.log("Skipping order shop notification — RESEND_API_KEY not set");
    return;
  }
  if (!shopEmail) {
    console.error("sendOrderShopNotification called without shopEmail");
    return;
  }

  const customerEmailRow = order.customerEmail
    ? `<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Email</td><td style="padding: 8px 0; font-size: 14px;">${escapeHtml(order.customerEmail)}</td></tr>`
    : "";
  const notesRow = order.customerNotes
    ? `<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px; vertical-align: top;">Notes</td><td style="padding: 8px 0; font-size: 14px;">${escapeHtml(order.customerNotes)}</td></tr>`
    : "";

  await resend.emails.send({
    from: FROM,
    to: shopEmail,
    ...(order.customerEmail ? { replyTo: order.customerEmail } : {}),
    subject: `New pickup order — ${order.customerName} — ${formatCents(order.subtotalCents)}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 540px; margin: 0 auto;">
        <div style="background: #059669; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">New Pickup Order — ${escapeHtml(order.businessName)}</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px; width: 90px;">Customer</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${escapeHtml(order.customerName)}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Phone</td><td style="padding: 8px 0; font-size: 14px;"><a href="tel:${encodeURIComponent(order.customerPhone)}" style="color: #2563EB;">${escapeHtml(order.customerPhone)}</a></td></tr>
            ${customerEmailRow}
            ${notesRow}
          </table>
          <div style="margin-top: 16px; border-top: 1px solid #E5E7EB; padding-top: 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${renderItemsHtml(order.items)}
              <tr><td colspan="2" style="border-top: 1px solid #E5E7EB; padding-top: 8px; margin-top: 4px;"></td></tr>
              <tr>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700;">Subtotal</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700; text-align: right;">${formatCents(order.subtotalCents)}</td>
              </tr>
            </table>
          </div>
          <p style="margin-top: 16px; font-size: 13px; color: #6B7280;">When the order is ready, call or text the customer to let them know.</p>
        </div>
      </div>
    `,
  });
}

/**
 * Send confirmation to the customer who placed a pickup order.
 */
export async function sendOrderCustomerConfirmation(
  shopEmail: string,
  order: OrderEmailData
) {
  if (!resend || !order.customerEmail) return;
  const firstName = order.customerName.split(" ")[0];
  const addressBlock = order.businessAddress
    ? `<p style="margin: 0 0 6px; font-size: 14px;"><strong>Pickup at:</strong><br/>${escapeHtml(order.businessAddress)}</p>`
    : "";
  const phoneBlock = order.businessPhone
    ? `<p style="color: #6B7280; font-size: 13px; margin: 0;">Questions? Call <a href="tel:${encodeURIComponent(order.businessPhone)}" style="color: #2563EB;">${escapeHtml(order.businessPhone)}</a></p>`
    : "";

  await resend.emails.send({
    from: FROM,
    to: order.customerEmail,
    ...(shopEmail ? { replyTo: shopEmail } : {}),
    subject: `Your order at ${order.businessName} — we'll call you when it's ready`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 540px; margin: 0 auto;">
        <div style="background: #059669; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="margin: 0; color: #fff; font-size: 20px;">Order Received!</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="color: #4B5563; font-size: 15px; margin: 0 0 12px;">Hi ${escapeHtml(firstName)} — thanks for your order at <strong>${escapeHtml(order.businessName)}</strong>.</p>
          <div style="background: #F0FDF4; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${renderItemsHtml(order.items)}
              <tr><td colspan="2" style="border-top: 1px solid #D1FAE5; padding-top: 6px;"></td></tr>
              <tr>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700;">Subtotal</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700; text-align: right;">${formatCents(order.subtotalCents)}</td>
              </tr>
            </table>
          </div>
          <p style="color: #4B5563; font-size: 14px; margin: 0 0 12px;">We'll call or text you at <strong>${escapeHtml(order.customerPhone)}</strong> when your order is ready for pickup.</p>
          ${addressBlock}
          ${phoneBlock}
        </div>
      </div>
    `,
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/aws/Downloads/web-project/siteforowners
npx tsc --noEmit
```

Expected: no errors. If there are errors, fix them before committing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: add order shop and customer email helpers"
```

---

## Task 3: `/api/place-order` route

**Files:**
- Create: `src/app/api/place-order/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/place-order/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendOrderShopNotification,
  sendOrderCustomerConfirmation,
} from "@/lib/email";

const MAX_ITEMS = 50;
const MAX_QTY = 99;
const MAX_ITEM_NAME = 200;
const MAX_CUSTOMER_NAME = 100;
const MAX_NOTES = 500;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 20;
const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IncomingItem {
  name?: unknown;
  price?: unknown;
  qty?: unknown;
}

interface Body {
  tenant_id?: unknown;
  items?: unknown;
  customer_name?: unknown;
  customer_phone?: unknown;
  customer_email?: unknown;
  customer_notes?: unknown;
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parsePriceCents(price: string): number {
  const n = parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = trimStr(body.tenant_id);
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }

  // Items validation
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Max ${MAX_ITEMS} items` }, { status: 400 });
  }
  const items: Array<{ name: string; price: string; qty: number }> = [];
  let subtotalCents = 0;
  for (const raw of body.items as IncomingItem[]) {
    const name = trimStr(raw.name);
    const price = trimStr(raw.price);
    const qty = typeof raw.qty === "number" ? raw.qty : NaN;
    if (!name || name.length > MAX_ITEM_NAME) {
      return NextResponse.json({ error: "Invalid item name" }, { status: 400 });
    }
    if (!price) {
      return NextResponse.json({ error: "Invalid item price" }, { status: 400 });
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return NextResponse.json({ error: "Invalid item qty" }, { status: 400 });
    }
    const cents = parsePriceCents(price);
    if (!Number.isFinite(cents) || cents < 0) {
      return NextResponse.json({ error: "Invalid item price" }, { status: 400 });
    }
    items.push({ name, price, qty });
    subtotalCents += cents * qty;
  }

  // Customer fields
  const customerName = trimStr(body.customer_name);
  if (!customerName || customerName.length > MAX_CUSTOMER_NAME) {
    return NextResponse.json({ error: "Invalid customer_name" }, { status: 400 });
  }
  const phoneRaw = trimStr(body.customer_phone);
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < PHONE_MIN_DIGITS || phoneDigits.length > PHONE_MAX_DIGITS) {
    return NextResponse.json({ error: "Invalid customer_phone" }, { status: 400 });
  }
  const customerEmailRaw = trimStr(body.customer_email);
  const customerEmail = customerEmailRaw || null;
  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    return NextResponse.json({ error: "Invalid customer_email" }, { status: 400 });
  }
  const notesRaw = trimStr(body.customer_notes);
  if (notesRaw.length > MAX_NOTES) {
    return NextResponse.json({ error: "Notes too long" }, { status: 400 });
  }
  const customerNotes = notesRaw || null;

  const supabase = createAdminClient();

  // Load tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, business_name, email, phone, address, checkout_mode, subscription_status")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  if (tenant.checkout_mode !== "pickup") {
    return NextResponse.json(
      { error: "Orders are not enabled for this site" },
      { status: 400 }
    );
  }
  if (!["active", "trialing"].includes(tenant.subscription_status)) {
    return NextResponse.json(
      { error: "Orders are not enabled for this site" },
      { status: 400 }
    );
  }
  if (!tenant.email) {
    return NextResponse.json(
      { error: "Shop notification email not configured" },
      { status: 500 }
    );
  }

  // Rate limit: same tenant + phone ≥ 3 orders in the last 5 minutes.
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("orders")
    .select("id", { head: true, count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("customer_phone", phoneDigits)
    .gte("created_at", since);
  if ((recentCount ?? 0) >= RATE_LIMIT_COUNT) {
    return NextResponse.json(
      { error: "Too many orders. Try again in a few minutes." },
      { status: 429 }
    );
  }

  // Insert order
  const { data: inserted, error: insertError } = await supabase
    .from("orders")
    .insert({
      tenant_id: tenantId,
      items,
      subtotal_cents: subtotalCents,
      customer_name: customerName,
      customer_phone: phoneDigits,
      customer_email: customerEmail,
      customer_notes: customerNotes,
      status: "new",
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error("Order insert failed:", insertError);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }

  // Fire both emails in parallel; don't fail the request on email errors.
  const emailPayload = {
    businessName: tenant.business_name as string,
    businessPhone: (tenant.phone as string | null) || undefined,
    businessAddress: (tenant.address as string | null) || undefined,
    items,
    subtotalCents,
    customerName,
    customerPhone: phoneDigits,
    customerEmail: customerEmail || undefined,
    customerNotes: customerNotes || undefined,
  };
  const results = await Promise.allSettled([
    sendOrderShopNotification(tenant.email as string, emailPayload),
    sendOrderCustomerConfirmation(tenant.email as string, emailPayload),
  ]);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("Order email send failed:", r.reason);
    }
  }

  return NextResponse.json({ order_id: inserted.id, status: "ok" });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/place-order/route.ts
git commit -m "feat: add /api/place-order for pickup orders"
```

---

## Task 4: `/api/update-tenant` route

**Files:**
- Create: `src/app/api/update-tenant/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/update-tenant/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_CHECKOUT_MODES = new Set(["mockup", "pickup"]);

interface UpdatesBody {
  tenant_id?: unknown;
  updates?: {
    checkout_mode?: unknown;
    email?: unknown;
  };
}

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get("admin_session")?.value;
  if (!ADMIN_PASSWORD || sessionCookie !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdatesBody;
  try {
    body = (await request.json()) as UpdatesBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }
  const updates = body.updates || {};
  const allowed: Record<string, string | null> = {};

  if (updates.checkout_mode !== undefined) {
    if (typeof updates.checkout_mode !== "string" || !ALLOWED_CHECKOUT_MODES.has(updates.checkout_mode)) {
      return NextResponse.json({ error: "Invalid checkout_mode" }, { status: 400 });
    }
    allowed.checkout_mode = updates.checkout_mode;
  }

  if (updates.email !== undefined) {
    if (updates.email === null || updates.email === "") {
      allowed.email = null;
    } else if (typeof updates.email === "string" && EMAIL_RE.test(updates.email.trim())) {
      allowed.email = updates.email.trim();
    } else {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If caller is setting checkout_mode='pickup', verify the resulting row has an email.
  if (allowed.checkout_mode === "pickup") {
    const resultingEmail =
      "email" in allowed
        ? allowed.email
        : (
            await supabase
              .from("tenants")
              .select("email")
              .eq("id", tenantId)
              .maybeSingle()
          ).data?.email ?? null;
    if (!resultingEmail) {
      return NextResponse.json(
        { error: "Notification email required for pickup mode" },
        { status: 400 }
      );
    }
  }

  const { error: updateError } = await supabase
    .from("tenants")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (updateError) {
    console.error("update-tenant failed:", updateError);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/update-tenant/route.ts
git commit -m "feat: add /api/update-tenant admin endpoint"
```

---

## Task 5: Admin editor UI — Checkout section

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`

- [ ] **Step 1: Add tenant-level state near the top of the component**

Locate the existing editable state block (around lines 51–85, directly after the `preview`/`enCopy` destructuring). Insert the following two new `useState` calls anywhere inside that block:

```tsx
  // Tenant-level settings (separate save path via /api/update-tenant)
  const [checkoutMode, setCheckoutMode] = useState<"mockup" | "pickup">(
    (tenant.checkout_mode as "mockup" | "pickup" | null) || "mockup"
  );
  const [notificationEmail, setNotificationEmail] = useState<string>(
    (tenant.email as string | null) || ""
  );
```

- [ ] **Step 2: Extend `handleSave` to also POST tenant updates**

Replace the body of `handleSave` (lines 200–248) with:

```tsx
  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    const pickupNeedsEmail = checkoutMode === "pickup" && !notificationEmail.trim();
    if (pickupNeedsEmail) {
      setError("Notification email required for pickup mode.");
      setSaving(false);
      return;
    }

    try {
      const [previewRes, tenantRes] = await Promise.all([
        fetch("/api/update-site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            updates: {
              business_name: businessName,
              phone,
              address,
              booking_url: bookingUrl || null,
              services: services.filter((s) => s.name.trim()),
              products: products.filter((p) => p.name.trim()),
              images,
              hero_video_url: heroVideoUrl,
              hours: displayHours,
              imported_hours: importedHours,
              generated_copy: {
                en: {
                  hero_headline: headline,
                  hero_subheadline: subheadline,
                  about_paragraphs: aboutParagraphs,
                  footer_tagline: footerTagline,
                },
                section_settings: {
                  ...sectionSettings,
                  show_hours: showHoursOnSite,
                  about_image_url: sectionSettings.about_image_url || null,
                  template_override: sectionSettings.template_override || null,
                },
              },
            },
          }),
        }),
        fetch("/api/update-tenant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenant.id,
            updates: {
              checkout_mode: checkoutMode,
              email: notificationEmail.trim() || null,
            },
          }),
        }),
      ]);

      if (!previewRes.ok) throw new Error("Preview save failed");
      if (!tenantRes.ok) {
        const detail = await tenantRes.json().catch(() => ({}));
        throw new Error(detail?.error || "Tenant save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 3: Render the Checkout section in the edit panel**

Find a suitable insertion point in the JSX — a good spot is right after the Products section block (search for a `Products` heading). Insert the following panel:

```tsx
        {/* ── Checkout ─────────────────────────────────────── */}
        <section className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Checkout</h3>
          <p className="mb-4 text-xs text-gray-500">
            How customers check out from this site.
          </p>

          <div className="space-y-2">
            <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="checkout_mode"
                value="mockup"
                checked={checkoutMode === "mockup"}
                onChange={() => setCheckoutMode("mockup")}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Mockup</p>
                <p className="text-xs text-gray-500">
                  Shows the cart UI but orders aren&apos;t collected.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="checkout_mode"
                value="pickup"
                checked={checkoutMode === "pickup"}
                onChange={() => setCheckoutMode("pickup")}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Pickup — pay in store</p>
                <p className="text-xs text-gray-500">
                  Customer orders online, comes to the shop to pick up and pay.
                </p>
              </div>
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600">
              Notification email{checkoutMode === "pickup" ? " *" : ""}
            </label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="owner@example.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Where pickup orders are sent. Required when mode is Pickup.
            </p>
          </div>
        </section>
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/clients/\[tenantId\]/edit/SiteEditor.tsx
git commit -m "feat: add Checkout section to Site Editor"
```

---

## Task 6: Orchestrator prop wiring

**Files:**
- Modify: `src/components/templates/TemplateOrchestrator.tsx`

- [ ] **Step 1: Extend the props interface**

Find `interface TemplateOrchestratorProps` (around lines 55–60) and extend it:

```tsx
interface TemplateOrchestratorProps {
  data: PreviewData;
  locale?: "en" | "es";
  isLive?: boolean;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  checkoutMode?: "mockup" | "pickup";
  tenantId?: string | null;
}
```

- [ ] **Step 2: Accept and forward the new props**

Find the function signature (around lines 118–123) and add the new parameters with defaults:

```tsx
export function TemplateOrchestrator({
  data,
  locale: initialLocale = "en",
  isLive = false,
  bookingHours = null,
  checkoutMode = "mockup",
  tenantId = null,
}: TemplateOrchestratorProps) {
```

- [ ] **Step 3: Pass them into `TemplateProducts`**

Find the line that renders `TemplateProducts` (around line 176):

```tsx
  const productsSection = hasProducts ? (
    <div id="products"><TemplateProducts products={data.products!} colors={colors} /></div>
  ) : null;
```

Replace with:

```tsx
  const productsSection = hasProducts ? (
    <div id="products">
      <TemplateProducts
        products={data.products!}
        colors={colors}
        checkoutMode={checkoutMode}
        tenantId={tenantId}
        businessName={data.business_name}
        businessPhone={data.phone || undefined}
        businessAddress={data.address || undefined}
      />
    </div>
  ) : null;
```

- [ ] **Step 4: Typecheck** — expected to FAIL at this point because `TemplateProducts` doesn't accept the new props yet. Capture the error and move on to Task 8 which fixes it.

```bash
npx tsc --noEmit
```

Expected: errors in `TemplateOrchestrator.tsx` about extra props on `TemplateProducts`. Task 8 will resolve.

- [ ] **Step 5: Do NOT commit yet** — changes are intertwined with Task 8. Commit after Task 8 passes typecheck.

---

## Task 7: Live site page wiring

**Files:**
- Modify: `src/app/site/[slug]/page.tsx`
- Modify: `src/app/site/[slug]/SiteClient.tsx`

- [ ] **Step 1: Fetch checkout_mode and tenant id in `getSiteData`**

Open `src/app/site/[slug]/page.tsx`. Replace the entire `getSiteData` function (lines 7–39) with:

```tsx
type BookingHoursMap = Record<string, { open: string; close: string } | null> | null;

interface SiteData {
  preview: PreviewData;
  bookingHours: BookingHoursMap;
  tenantId: string | null;
  checkoutMode: "mockup" | "pickup";
}

async function getSiteData(slug: string): Promise<SiteData | null> {
  const supabase = createAdminClient();
  const { data: preview, error } = await supabase
    .from("previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !preview) return null;

  // Find the tenant that owns this preview, if any, then load booking hours + checkout mode.
  let bookingHours: BookingHoursMap = null;
  let tenantId: string | null = null;
  let checkoutMode: "mockup" | "pickup" = "mockup";

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, checkout_mode")
    .eq("preview_slug", slug)
    .maybeSingle();

  if (tenant?.id) {
    tenantId = tenant.id as string;
    const mode = tenant.checkout_mode as "mockup" | "pickup" | null;
    checkoutMode = mode === "pickup" ? "pickup" : "mockup";
    const { data: bs } = await supabase
      .from("booking_settings")
      .select("working_hours")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    bookingHours = (bs?.working_hours as BookingHoursMap) ?? null;
  }

  return { preview: preview as PreviewData, bookingHours, tenantId, checkoutMode };
}
```

- [ ] **Step 2: Pass new fields into `SiteClient`**

Replace the `SitePage` default export (lines 74–82) with:

```tsx
export default async function SitePage({
  params,
}: {
  params: { slug: string };
}) {
  const result = await getSiteData(params.slug);
  if (!result) notFound();
  return (
    <SiteClient
      data={result.preview}
      bookingHours={result.bookingHours}
      tenantId={result.tenantId}
      checkoutMode={result.checkoutMode}
    />
  );
}
```

- [ ] **Step 3: Accept the props in `SiteClient`**

Replace the entire contents of `src/app/site/[slug]/SiteClient.tsx` with:

```tsx
"use client";

import { TemplateOrchestrator } from "@/components/templates";
import type { PreviewData } from "@/lib/ai/types";

interface SiteClientProps {
  data: PreviewData;
  bookingHours?: Record<string, { open: string; close: string } | null> | null;
  tenantId?: string | null;
  checkoutMode?: "mockup" | "pickup";
}

export function SiteClient({
  data,
  bookingHours = null,
  tenantId = null,
  checkoutMode = "mockup",
}: SiteClientProps) {
  // Published site — no preview chrome, just the raw template
  return (
    <div className="min-h-screen">
      <TemplateOrchestrator
        data={data}
        locale="en"
        isLive
        bookingHours={bookingHours}
        tenantId={tenantId}
        checkoutMode={checkoutMode}
      />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck** — still expected to FAIL on `TemplateProducts` prop mismatch. Proceed to Task 8.

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Do NOT commit yet.** Combined commit after Task 8.

---

## Task 8: `TemplateProducts` pickup flow

**Files:**
- Modify: `src/components/templates/TemplateProducts.tsx`

- [ ] **Step 1: Extend `MockCartDrawer` props and signature**

Open `src/components/templates/TemplateProducts.tsx`. Find the `MockCartDrawer` function (around lines 24–35). Replace its props type and signature with the following:

```tsx
function MockCartDrawer({
  cart,
  colors,
  onUpdateQty,
  onClose,
  checkoutMode,
  tenantId,
  businessName,
  businessPhone,
  businessAddress,
}: {
  cart: CartItem[];
  colors: ThemeColors;
  onUpdateQty: (name: string, delta: number) => void;
  onClose: () => void;
  checkoutMode: "mockup" | "pickup";
  tenantId: string | null;
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
}) {
```

- [ ] **Step 2: Add pickup state + submit handler inside `MockCartDrawer`**

Immediately after the existing `useState` for `checkoutStep` and the `total` calculation (around lines 36–38), insert:

```tsx
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custNotes, setCustNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isPickup = checkoutMode === "pickup" && !!tenantId;

  const handleSubmitPickup = async () => {
    setSubmitError(null);
    if (!custName.trim() || !custPhone.trim()) {
      setSubmitError("Name and phone are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          items: cart.map((c) => ({
            name: c.product.name,
            price: c.product.price,
            qty: c.qty,
          })),
          customer_name: custName.trim(),
          customer_phone: custPhone.trim(),
          customer_email: custEmail.trim() || undefined,
          customer_notes: custNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to place order");
      }
      setCheckoutStep("confirmed");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  const maskedPhone = (() => {
    const digits = custPhone.replace(/\D/g, "");
    if (digits.length < 4) return digits;
    return `(***) ***-${digits.slice(-4)}`;
  })();
```

- [ ] **Step 3: Replace the Info step's "Place Order" button**

Find the "Place Order" button inside the `checkoutStep === "info"` block (around line 166–172):

```tsx
                <button
                  onClick={() => setCheckoutStep("confirmed")}
                  className="w-full rounded-full py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: colors.primary, color: btnText }}
                >
                  Place Order — {formatPrice(total)}
                </button>
```

Replace with:

```tsx
                {submitError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {submitError}
                  </p>
                )}
                <button
                  onClick={() => {
                    if (isPickup) {
                      handleSubmitPickup();
                    } else {
                      setCheckoutStep("confirmed");
                    }
                  }}
                  disabled={submitting}
                  className="w-full rounded-full py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
                  style={{ backgroundColor: colors.primary, color: btnText }}
                >
                  {submitting ? "Placing order…" : `Place Order — ${formatPrice(total)}`}
                </button>
```

- [ ] **Step 4: Wire the Info step's form inputs to state**

In the same `checkoutStep === "info"` block, replace the three existing uncontrolled `<input>` tags (Full Name / Email / Phone, around lines 138–152) with controlled inputs plus a new notes textarea. Insert these in place of the three inputs:

```tsx
                <input
                  type="text"
                  placeholder="Full Name"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder={isPickup ? "Email (optional)" : "Email"}
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                {isPickup && (
                  <textarea
                    placeholder="Any requests? (optional)"
                    value={custNotes}
                    onChange={(e) => setCustNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                )}
```

- [ ] **Step 5: Replace the Confirmation step to branch on mode**

Find the `checkoutStep === "confirmed"` block (around lines 184–215). Replace the *body* (everything between `<motion.div key="confirmed" ...>` and the matching `</motion.div>`) with:

```tsx
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.1 }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ backgroundColor: `${colors.primary}20` }}
              >
                <svg className="h-8 w-8" style={{ color: colors.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              {isPickup ? (
                <>
                  <h4 className="text-lg font-bold text-gray-900">Order placed!</h4>
                  <p className="mt-2 text-sm text-gray-500">
                    We&apos;ll call you at <strong>{maskedPhone}</strong> when your order is ready for pickup.
                  </p>
                  {businessAddress && (
                    <div className="mt-4 rounded-lg bg-gray-50 p-3 text-left text-sm">
                      <p className="text-xs font-medium text-gray-500">Pickup at</p>
                      <p className="mt-1 text-gray-900">{businessAddress}</p>
                    </div>
                  )}
                  {businessPhone && (
                    <p className="mt-3 text-xs text-gray-500">
                      Questions? Call <a href={`tel:${businessPhone}`} className="text-blue-600 hover:underline">{businessPhone}</a>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h4 className="text-lg font-bold text-gray-900">Thank You!</h4>
                  <p className="mt-2 text-sm text-gray-500">
                    Your order has been placed. You&apos;ll receive a confirmation shortly.
                  </p>
                  <p className="mt-1 text-xs text-gray-400">(This is a preview — no real order was placed)</p>
                </>
              )}
              <button
                onClick={onClose}
                className="mt-6 rounded-full px-8 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5"
                style={{ backgroundColor: colors.primary, color: btnText }}
              >
                Done
              </button>
```

- [ ] **Step 6: Extend the outer `TemplateProducts` props + forwarding**

Find the outer `TemplateProducts` function (around line 288–300). Update its props type and signature:

```tsx
export function TemplateProducts({
  products,
  colors,
  checkoutMode = "mockup",
  tenantId = null,
  businessName,
  businessPhone,
  businessAddress,
}: {
  products: ProductItem[];
  colors: ThemeColors;
  checkoutMode?: "mockup" | "pickup";
  tenantId?: string | null;
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
}) {
```

Find the `<MockCartDrawer ... />` render (near line 375) and pass the new props:

```tsx
            <MockCartDrawer
              cart={cart}
              colors={colors}
              onUpdateQty={updateQty}
              onClose={() => setShowCart(false)}
              checkoutMode={checkoutMode}
              tenantId={tenantId}
              businessName={businessName}
              businessPhone={businessPhone}
              businessAddress={businessAddress}
            />
```

- [ ] **Step 7: Typecheck — should now PASS**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors remain, fix them before committing.

- [ ] **Step 8: Commit the orchestrator + site page + products changes together**

```bash
git add src/components/templates/TemplateOrchestrator.tsx \
        src/components/templates/TemplateProducts.tsx \
        src/app/site/\[slug\]/page.tsx \
        src/app/site/\[slug\]/SiteClient.tsx
git commit -m "feat: thread checkout_mode through template and implement pickup flow"
```

---

## Task 9: End-to-end smoke test + deploy

- [ ] **Step 1: Deploy to preview / production**

```bash
git push origin feat/pickup-checkout-mode
```

Open a PR (or merge directly if solo), let Vercel deploy.

- [ ] **Step 2: Confirm database state in Supabase**

In the Supabase SQL Editor:

```sql
-- Confirm migration applied
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'tenants' and column_name = 'checkout_mode';

-- Confirm every tenant still defaults to 'mockup'
select id, business_name, checkout_mode from tenants;

-- Confirm orders table is empty and queryable
select count(*) from orders;
```

Expected: `checkout_mode` column exists with default `'mockup'`, all tenants show `mockup`, orders count is 0.

- [ ] **Step 3: Configure letstrylocs for pickup in the admin UI**

1. Visit `https://www.siteforowners.com/clients/<letstrylocs-tenant-id>/edit`.
2. Scroll to the new Checkout section.
3. Set notification email to a mailbox under your control (e.g., your own Gmail).
4. Select the "Pickup — pay in store" radio.
5. Click Save. Expect the green "Saved" confirmation with no error.

Verify in SQL:

```sql
select business_name, checkout_mode, email from tenants where subdomain = 'letstrylocs';
```

Expected: `checkout_mode = 'pickup'`, `email` set to your address.

- [ ] **Step 4: Submit a real pickup order as a fake customer**

1. Open a private/incognito window and go to `https://letstrylocs.com` (or `letstrylocs.siteforowners.com`).
2. Scroll to Products, click "Add to Cart" on at least one item.
3. Click the floating "View Cart" button.
4. Click "Checkout".
5. Fill in: your name, your phone (any real-looking number), your email, an optional note.
6. Click "Place Order — $X.XX".
7. Expect to see the new "Order placed! We'll call you at (***) ***-XXXX when your order is ready for pickup." confirmation with the shop address.

- [ ] **Step 5: Verify both emails arrived**

Check your inbox for:
1. "New pickup order — [your name] — $X.XX" — the shop owner email.
2. "Your order at letstrylocs — we'll call you when it's ready" — the customer email.

Both should render correctly on mobile and desktop.

- [ ] **Step 6: Verify DB row**

```sql
select id, tenant_id, items, subtotal_cents, customer_name, customer_phone,
       customer_email, customer_notes, status, created_at
from orders
order by created_at desc
limit 1;
```

Expected: row matches what you submitted; `status = 'new'`; `customer_phone` is digits-only (no parentheses or dashes); `items` JSON contains the expected name/price/qty.

- [ ] **Step 7: Negative test — flip back to mockup**

1. In Edit Site, switch mode to "Mockup", Save.
2. Reload letstrylocs.com, add items, go to checkout, submit.
3. Expect the old "Thank You! (This is a preview — no real order was placed)" confirmation — **no** new email, **no** new DB row.

Confirm with:

```sql
select count(*) from orders where tenant_id = '<letstrylocs-tenant-id>';
```

Expected: same count as before the mockup-mode submit.

- [ ] **Step 8: Negative test — pickup requires email**

1. In Edit Site, clear the notification email field.
2. Switch mode to "Pickup".
3. Click Save.
4. Expect the red error "Notification email required for pickup mode." and no save.

- [ ] **Step 9: Restore letstrylocs to desired final state**

Set notification email to the real shop owner address and confirm mode is "Pickup" (or whatever the client actually wants).

- [ ] **Step 10: Merge**

Once smoke test passes, merge the feature branch to main.

```bash
git checkout main
git merge --ff-only feat/pickup-checkout-mode
git push origin main
```

(Or close the PR via Vercel's UI, whichever your workflow uses.)

---

## Deferred follow-ups (out of scope, tracked in spec)

- Spanish (`es`) translations of both order emails.
- Admin dashboard view of orders per tenant.
- "Orders (N)" badge on the Clients list.
- Online (Stripe Connect) checkout mode.
- SMS notifications.
- Shared rate-limit infrastructure.
