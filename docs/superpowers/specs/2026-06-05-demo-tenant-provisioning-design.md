# Demo Tenant Provisioning — "Make Previews Real"

**Date:** 2026-06-05
**Status:** Approved (pending spec review)
**Branch:** `feat/demo-tenant-provisioning`

## Problem

A preview (`/preview/{slug}`) is a deliberately *mocked* artifact: mock booking
calendar, contact form that doesn't submit, synthetic admin data, and heavy
preview chrome (top bar, "Preview" label, mobile bezel, dominant bottom CTA). A
converted client is a real `tenants` row served on a subdomain through the
`/site/{slug}` path with `isLive=true` — clean render, real booking, real
contact→leads, real `/admin` dashboard, analytics.

The founder wants to turn a chosen preview into something that renders **exactly
like a converted client on a subdomain** — to pitch prospects with a real,
working site — while keeping a small, non-dominant "activate" CTA. Conversion to
a paying client should then be a simple upgrade of the same record.

## Goals

- One founder click turns a preview into a real, subdomain-backed site that
  reuses all existing live infrastructure.
- The demo site renders like a converted client: clean (no preview chrome),
  working booking, working contact form, real `/admin` dashboard, analytics.
- A small, non-dominant CTA remains, nudging activation.
- Paying later **upgrades the same tenant** (no duplicate rows, no data loss).
- The founder can tear a demo back down ("Revert to preview") without touching
  the original preview.

## Non-Goals

- No change to the existing `/preview/{slug}` flow, the onboarding wizard, cold
  outreach previews, or the synthetic `/preview/{slug}/admin` mock.
- No prospect-facing auth/invite flow — the founder views the demo admin.
- No automatic provisioning. Demos are created only by an explicit founder click.
- No new DNS/Vercel infra: `*.siteforowners.com` already wildcard-routes to the
  Vercel project (live tenants depend on it), so assigning a subdomain in the DB
  is sufficient for the middleware to resolve it.

## Approach

**Provision a real "demo" tenant from the preview.** The founder action creates a
`tenants` row in a `trialing` state with `is_demo = true`, assigns a subdomain,
and copies the preview's pending booking/deposit settings into `booking_settings`
— i.e. exactly what the Stripe webhook does today, minus payment. Because it is a
real tenant, it reuses every live surface unchanged: subdomain routing
(`src/middleware.ts`), `isLive=true` rendering (`/site/{slug}`), real booking,
contact→leads, the real `/admin` dashboard, and analytics.

**Why `trialing`:** `PUBLIC_LIVE_STATUSES` (`src/lib/tenant-access.ts`) already
includes `trialing`, so a tenant with `subscription_status="trialing"` +
`site_published=true` + a `preview_slug` is served live by the middleware with
**no gating change**. The unpaid-demo-vs-paid distinction is carried explicitly by
`is_demo`, not by status.

**Rejected alternative — serve the `previews` row live-style on a subdomain with
no tenant.** This would require teaching every tenant-scoped surface (leads,
`/admin`, `booking_settings`, analytics) to accept a second `preview_slug` scope.
Far more invasive and not "converted-like." Rejected.

## Data Model

One new column:

```sql
ALTER TABLE tenants
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
```

- `is_demo = true` → founder demo (unpaid). Drives the CTA banner, `noindex`,
  and the "Revert to preview" teardown guard.
- `is_demo = false` → a real paying/converted tenant (today's behavior).

`tenants.subdomain` is reused as-is. The demo links to its preview via the
existing `tenants.preview_slug` FK. No new tables.

## Components

### 1. Shared provisioning helper — `src/lib/provision-tenant.ts`

Extract the tenant + `booking_settings` creation currently inlined in the Stripe
webhook into one reusable, testable function:

```
provisionTenantFromPreview(supabaseAdmin, {
  previewSlug,
  businessName,
  ownerName,
  status,            // "trialing" (demo) | "active" (paid)
  isDemo,            // true (demo) | false (paid)
  subdomain?,        // set for demo; null for the webhook path
  stripeCustomerId?, // paid path only
  stripeSubscriptionId?, // paid path only
}): Promise<{ tenantId: string }>
```

Responsibilities (mirrors webhook lines 46–95):
- Read the preview's pending settings (`booking_mode`, `notification_email`,
  `deposit_*`).
- Insert the `tenants` row (or upsert — see §4).
- Upsert `booking_settings` from the pending deposit fields.

Both the demo action and the webhook call this. This removes the current
duplication and is the single place the two flows converge.

### 2. Founder endpoint — `POST /api/admin/provision-demo`

- Auth: founder `admin_session` only (same guard as other `/api/admin/*`).
- Body: `{ preview_slug, subdomain }`.
- Validates the subdomain (reuse `parseCustomDomainForStorage` conventions /
  slug normalization) and rejects collisions against existing
  `tenants.subdomain`.
- Calls `provisionTenantFromPreview({ status: "trialing", isDemo: true,
  subdomain })`, sets `site_published = true`.
- Idempotent: if a demo tenant already exists for the preview, return it (or
  update its subdomain) rather than erroring.
- Returns `{ tenantId, subdomain, url }`.

**Teardown — `DELETE /api/admin/provision-demo`:**
- Body: `{ preview_slug }`.
- **Guard:** refuse unless the tenant's `is_demo = true` (never delete a paying
  client).
- Deletes `booking_settings` then the `tenants` row, freeing the subdomain. The
  `previews` row is untouched — `/preview/{slug}` keeps working.

### 3. Founder UI

- A **"Go live (demo)"** button on each preview in the founder admin (previews
  list and/or the SiteEditor). Opens a small dialog with an auto-suggested,
  editable subdomain (derived from business name, collision-checked live).
- After provisioning, the row shows the demo subdomain link and a **"Revert to
  preview"** button.
- Founder opens the demo `/admin` through the existing founder→tenant access
  path (`/clients/{tenantId}`); no prospect login is created.

### 4. Conversion idempotency (webhook fix)

`checkout.session.completed` (`src/app/api/stripe-webhook/route.ts`) currently
**always inserts** a tenant. With pre-provisioned demos this would create a
duplicate. Change it to **upsert by `preview_slug`**:
- If a tenant already exists for `meta.preview_slug`: UPDATE it — set
  `stripe_customer_id`, `stripe_subscription_id`, `subscription_status="active"`,
  `is_demo=false`. (In-place upgrade: same subdomain, same admin data, no churn.)
- Else: insert as today (now via `provisionTenantFromPreview` with
  `status="active", isDemo:false`).

### 5. Rendering — reuse `/site/{slug}`, two `is_demo` conditionals

No new render path. The demo resolves through middleware → `/site/{slug}` →
`SiteClient` with `isLive=true` (already clean, no preview chrome). When the
tenant `is_demo`:

- **(a) Small CTA banner:** a slim, dismissible top (or footer) banner — "This is
  your live preview — Activate to publish" + button — shown only when `is_demo`.
  Deliberately lighter than the preview's dominant bottom CTA bar.
- **(b) `noindex`:** add `robots: { index: false }` to `/site/{slug}` metadata
  when `is_demo`, so unpaid demos aren't indexed. Flips to indexable
  automatically on activation (`is_demo=false`).

`getSiteData` (`src/app/site/[slug]/page.tsx`) already loads the tenant; it just
needs to surface `is_demo` to `SiteClient` and `generateMetadata`.

## Data Flow

```
Founder clicks "Go live (demo)" on preview {slug}
  → POST /api/admin/provision-demo { preview_slug, subdomain }
  → provisionTenantFromPreview(status=trialing, is_demo=true, subdomain)
      → tenants row (trialing, is_demo, subdomain, preview_slug, site_published)
      → booking_settings from preview pending fields
  → {subdomain}.siteforowners.com now resolves via middleware → /site/{slug}
      → SiteClient isLive=true  → clean render + small CTA banner + noindex
      → booking real, contact→leads real, /admin real (founder views)

Prospect pays (Stripe checkout) → checkout.session.completed
  → upsert by preview_slug → UPDATE existing demo tenant:
      stripe ids set, status=active, is_demo=false
  → CTA banner + noindex drop automatically; same subdomain, same data

Prospect doesn't convert → Founder clicks "Revert to preview"
  → DELETE /api/admin/provision-demo { preview_slug } (guard: is_demo=true)
  → booking_settings + tenants row removed, subdomain freed
  → /preview/{slug} untouched
```

## Error Handling & Edge Cases

- **Subdomain collision:** endpoint rejects with 409 before insert; UI surfaces
  it and keeps the dialog open for a new value.
- **Double-provision:** endpoint is idempotent — returns the existing demo
  instead of creating a second.
- **Revert guard:** teardown refuses when `is_demo=false`, so a paying client can
  never be deleted through this path.
- **Pay-then-revert race:** if a prospect pays, `is_demo` flips to `false`; a
  subsequent "Revert" is refused by the guard. Correct.
- **Preview edited after demo exists:** the demo tenant reads the same `previews`
  row at render time (the `/site` path renders from `previews`), so preview edits
  are reflected on the demo with no extra sync — same as a live tenant today.
- **Analytics:** demo subdomains will emit `/track.js` beacons like any live
  site. Acceptable (real visit data for the demo). Flagged, not gated.

## Testing

- `src/lib/provision-tenant.test.ts` — unit tests for `provisionTenantFromPreview`
  (demo vs paid params produce the right tenant + booking_settings shape; pending
  settings copied; idempotent upsert by preview_slug).
- Subdomain validation/collision unit tests (reuse normalize-custom-domain
  patterns).
- `src/lib/tenant-access.test.ts` — already covers `trialing` ⇒ live; add a guard
  test asserting demo teardown is refused when `is_demo=false`.
- Node built-in runner (`npx tsx --test`), per project convention.

## Open Questions

None blocking. Auth for a prospect-facing demo login is explicitly out of scope
(founder views the admin).
