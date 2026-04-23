# Pickup checkout mode — design

**Status:** approved, pending implementation plan
**Date:** 2026-04-23
**Scope:** v1 — "Pickup / pay in-store" checkout mode for client websites

## Problem

Client websites currently render a product cart that ends in a fake "Thank You!" confirmation — no real order is recorded and the shop owner never hears about customer interest. Some clients (first case: letstrylocs) want to let customers place a pickup order online and come to the shop to pay. Other clients may want traditional online checkout later. We need a per-tenant checkout mode setting and a working pickup flow end-to-end.

## Non-goals

- Online payment (Stripe Connect, tax handling, per-client onboarding) — deferred until we have demand from multiple clients.
- SMS notifications — email is sufficient for v1.
- Spanish email translations — scaffold English only for v1, add `es` as a follow-up.
- Client-facing dashboard for viewing orders — orders are persisted to unblock future dashboard work, but the dashboard itself is out of scope.
- Automated tests — no harness exists yet; manual smoke test on deploy.

## Data model

### New column on `tenants`

```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS checkout_mode text NOT NULL DEFAULT 'mockup'
  CHECK (checkout_mode IN ('mockup', 'pickup'));
```

Default `'mockup'` preserves current behavior for every existing tenant. The `CHECK` constraint is extensible — adding `'online'` later is an `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT`.

### New `orders` table

```sql
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  items jsonb NOT NULL,           -- [{ name, price, qty }]
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

CREATE INDEX idx_orders_tenant_id_created_at
  ON orders (tenant_id, created_at DESC);
```

- `items` is a denormalized snapshot — later price/menu changes don't rewrite history.
- `subtotal_cents` computed server-side at write time so emails/dashboards don't re-parse JSON.
- `status` column included now to avoid a migration when the dashboard adds `ready` / `picked_up` transitions. Only `new` is written in v1.
- RLS enabled; no public policies. Only the service role (`createAdminClient`) reads or writes.

### Notification email requirement

`tenants.email` must be set before a tenant can be moved to `checkout_mode = 'pickup'`. Enforced in the admin editor UI and re-checked server-side in `/api/place-order`.

## API

### `POST /api/place-order`

Public (no admin auth). Called by the template on the live site when a customer submits a cart.

**Request body:**

```ts
{
  tenant_id: string;              // uuid
  items: Array<{
    name: string;                 // ≤ 200 chars
    price: string;                // e.g. "$25"
    qty: number;                  // integer 1–99
  }>;                             // length 1–50
  customer_name: string;          // 1–100 chars
  customer_phone: string;         // stored as digits-only; 7–20 digits after stripping non-digits
  customer_email?: string;        // validated if present
  customer_notes?: string;        // ≤ 500 chars
}
```

**Server logic:**

1. Validate payload shape and lengths. Reject with 400 on failure.
2. Load tenant. Reject if:
   - `checkout_mode !== 'pickup'` → 400 `"Orders are not enabled for this site"`
   - `subscription_status` not in `['active', 'trialing']` → 400
   - `email` is null → 500 (should never happen — UI enforces it)
3. Parse each item price (reuse `parsePrice` from `TemplateProducts.tsx`). Reject if `NaN` or negative. Compute `subtotal_cents`.
4. Rate-limit check: reject 429 if the same `tenant_id + customer_phone` has ≥ 3 orders in the last 5 minutes.
5. Insert `orders` row with `status='new'`.
6. Fire both emails via `Promise.allSettled` (see below). Log failures; do not fail the request.
7. Return `{ order_id, status: 'ok' }`.

**Error codes:** 400 validation / mode / subscription, 404 tenant not found, 429 rate limit, 500 DB write failure. Email failure is swallowed.

### `POST /api/update-tenant`

Admin-gated (`NextRequest.cookies.get("admin_session")`). Used by the Edit Site form to update tenant-level fields — `publish-site` remains dedicated to publishing.

**Request body:**

```ts
{ tenant_id: string; updates: { checkout_mode?: string; email?: string } }
```

Allowlisted fields only. Validates `checkout_mode` against the CHECK set and `email` against a basic regex. Rejects `checkout_mode='pickup'` if the resulting tenant row would have no email.

## Admin editor UI

New "**Checkout**" section in `SiteEditor`, added alongside the existing section panels.

**Contents:**

- Radio group:
  - "Mockup — shows cart but no real orders"
  - "Pickup — customer orders, comes to shop"
- Notification email input — populated from `tenants.email`, editable.
  - Labeled "Where pickup orders are sent. Required when mode is Pickup."
- Save button disabled with helper text `"Notification email required for pickup mode."` if radio is Pickup and email is empty.

**Save flow:**

When the Checkout section has dirty state, the editor's save button calls `/api/update-tenant` in parallel with the existing `/api/update-site` call. Both succeed → UI goes green. Either fails → show error, keep dirty state for retry.

## Template behavior

### Data flow

`checkout_mode` reaches `TemplateProducts` via:

1. **Live site route** (the one middleware rewrites to after subdomain/custom-domain lookup) — adds `checkout_mode`, `email`, `address`, `phone` to the tenant select.
2. **TemplateOrchestrator** receives a new prop `checkoutMode`, defaults to `'mockup'` when absent.
3. **TemplateProducts** receives `checkoutMode` and `tenantId` as props.

Preview pages (`/previews/[slug]`, `/preview/[slug]`) always render `'mockup'` — no tenant yet on unpaid previews, nothing to submit to.

### Mockup mode (default) — unchanged

Existing optimistic confirmation with "(This is a preview — no real order was placed)" stays as-is.

### Pickup mode — new

Cart step → Info step → network submit → Confirmed step.

**Info step changes:**

- Fields: Full Name (required), Phone (required), Email (optional), Notes (optional textarea).
- "Place Order — $total" button → disabled during submit, shows spinner.
- On submit: `POST /api/place-order`.
- On success: advance to confirmed step.
- On error: inline error below button; form state preserved.

**Confirmed step — pickup variant:**

```
✓ Order placed!

We'll call you at (***) ***-1234 when your order
is ready for pickup.

Pickup at:
  {business_address}

Questions? Call {business_phone}
```

Address and phone come from the tenant row. Phone is masked in the customer-facing text for privacy; full phone goes to the shop owner's email.

## Email notifications

Both sent via Resend. Both emails dispatched in parallel via `Promise.allSettled`; failures are logged but don't fail the API call.

### To shop owner (`tenants.email`)

- **Subject:** `New pickup order — {customer_name} — ${subtotal}`
- **From:** `EMAIL_FROM` env (existing `hello@siteforowners.com`)
- **Reply-To:** `customer_email` if provided, else unset
- **Body:** business name, customer name/phone/email, itemized list with line totals, subtotal, notes, instruction to call/text the customer when ready.

### To customer (`customer_email`, only if provided)

- **Subject:** `Your order at {business_name} — we'll call you when it's ready`
- **From:** `EMAIL_FROM`
- **Reply-To:** `tenants.email` (so replies go to the shop, not the founder)
- **Body:** thanks, itemized list, subtotal, pickup address, shop phone for questions.

## Edge cases & security

- **Input guards:** items 1–50, qty 1–99, name ≤ 200 chars; customer_name 1–100, phone 7–20 digits after stripping non-digits, email passes regex, notes ≤ 500. All strings trimmed. Empty after trim → missing.
- **Price parse failures:** reject 400.
- **XSS in emails:** React Email default text interpolation escapes. No raw HTML passthrough for customer-supplied fields.
- **RLS:** `orders` service-role-only. `tenants` updates via admin-gated endpoint only.
- **Stale mode:** if the shop toggles from pickup → mockup while a customer has the cart open, the server re-checks `checkout_mode` and rejects with 400. Template shows "Orders temporarily unavailable — please contact the shop directly."
- **Double-submit:** submit button disabled during request; rate limit catches scripted retries.

## Rollback

Reverting one tenant or all tenants back to the previous behavior is a single SQL statement — no code deploy needed:

```sql
update tenants set checkout_mode = 'mockup' where id = '…';    -- one tenant
update tenants set checkout_mode = 'mockup';                   -- all tenants
```

The `orders` table remains populated; no data loss.

## Testing

**Manual smoke test on deploy:**

1. Flip letstrylocs to `checkout_mode='pickup'`; set notification email to a mailbox under your control for dogfooding.
2. Visit `letstrylocs.com`, add items, submit as a fake customer using your own email as `customer_email`.
3. Verify: two emails arrive (shop + customer); `orders` row written with correct `items`, `subtotal_cents`, customer fields, `status='new'`.
4. Flip back to mockup, retry submit — verify 400 rejection.
5. Clear `tenants.email`, try to toggle to pickup in Edit Site — verify save is blocked with the helper text.

No automated tests in v1 — project has no test harness set up. Adding one is its own separate project.

## Deferred follow-ups

- Spanish (`es`) translations of both email templates.
- Dashboard view of orders per tenant (read-only list + status transitions).
- "Orders (N)" badge next to each client on the admin Clients list.
- Online (Stripe Connect) checkout mode.
- SMS notifications.
- Shared rate-limit infrastructure (move from inline SQL check to a proper per-IP + per-tenant limiter).
