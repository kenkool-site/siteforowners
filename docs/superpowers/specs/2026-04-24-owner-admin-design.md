# Owner Admin Dashboard — Design Spec

**Date:** 2026-04-24
**Scope:** v1 of the owner-facing `/admin` route served from each tenant's own domain.

## Summary

A PIN-gated admin dashboard served at `{tenant-domain}/admin` (e.g. `letstrylocs.com/admin`). Owners see rollups of their site's activity, manage bookings (if they use the internal scheduler), manage product orders (if `checkout_mode='pickup'`), triage contact-form leads, submit website-change requests, view billing, and change their PIN.

The goal is to give small-business owners a single place to see "their numbers" — bookings, orders, leads, and traffic — without ever visiting `siteforowners.com`. Everything lives on their own domain.

## Non-goals (v1)

- Staff sub-accounts (single PIN per tenant)
- Push or SMS notifications
- Owner-editable business info (hours, phone, address) — routed through update requests instead
- Full booking settings (slot duration, buffer) — founder-configured
- Native app / PWA install
- Plausible integration (UI designed so the traffic backend can swap later without UI changes)

## Personas

**Primary:** Small-business owner, 35–60, non-technical. Uses their phone for everything. Checks between clients. Must pass the "55-year-old Dominican salon owner" test.

**Secondary:** Founder (you). Sets PINs at onboarding, resets PINs when asked, and triages update requests.

## Authentication

### Model: 6-digit PIN per tenant

Initial PIN is set by the founder at onboarding. Stored as bcrypt hash in `tenants.admin_pin_hash`. Owners can change their PIN from Settings. No username — the tenant is derived from the request's hostname.

### Session

- On successful PIN entry, server sets `owner_session` cookie:
  - HTTP-only, Secure, SameSite=Lax
  - Signed payload: `{ tenant_id, iat, exp }`
  - 30-day sliding expiry — every authenticated request bumps `exp`
- Explicit **Sign out** button in the top bar (mobile) and sidebar footer (desktop) clears the cookie.

### Rate limiting

- 5 failed attempts per `(tenant_id, ip_hash)` within 15 minutes → 429 + 15-minute cooldown.
- 10 failed attempts within 1 hour → lock account for 1 hour.
- All attempts logged to `admin_login_attempts` with `succeeded` flag for audit.

### Forgot-PIN recovery (two paths)

1. **Email link (self-serve)** — owner taps "Forgot PIN?" → enters email → if it matches `tenants.email` or `tenants.admin_email`, a reset link (tokenized, 15-minute TTL) is emailed. Click → set new PIN.
2. **Founder reset (fallback)** — for owners without email on file, the PIN entry screen shows "Please contact your site manager" with the founder's WhatsApp number. Founder resets from `/clients/[id]` in the admin panel.

Tokens stored in `admin_pin_resets` keyed by `token_hash` (not plaintext); single-use (`used_at` flagged on consumption).

## Routing & Middleware

### URL shape

- `letstrylocs.com/admin` → PIN entry (if unauth'd) or Home
- `letstrylocs.com/admin/schedule`, `/orders`, `/leads`, `/updates`, `/billing`, `/settings`

### Implementation

Extend the existing tenant-domain rewrite in `src/middleware.ts`. Today the middleware rewrites every tenant-domain request to `/site/[slug]/*`. The `/admin` flow uses the same rewrite: `letstrylocs.com/admin` → `/site/letstrylocs/admin`. No new carve-out path is needed.

One behavioral change in middleware for paths starting with `/admin`: the `site_published` and `subscription_status` gates are **relaxed**. Owners can still log in and reach Billing/Settings even if their site is unpublished or their subscription has lapsed. The tenant must still exist.

### File layout

```
src/app/site/[slug]/admin/
  layout.tsx              # auth check, sidebar/bottom-nav shell, no public site chrome
  page.tsx                # Home — rollups + visitors strip + recent activity
  schedule/page.tsx
  orders/page.tsx
  leads/page.tsx
  updates/page.tsx
  updates/new/page.tsx
  billing/page.tsx
  settings/page.tsx
  _components/            # AdminShell, StatCard, BookingList, OrderDrawer, etc.
```

The admin layout checks `owner_session`; if invalid/missing it renders the PIN entry UI instead of children. This keeps the route tree simple without a separate `(auth)` group.

### Path reservation

`/admin` is reserved on tenant domains. Site templates must not use that path. Document in `CLAUDE.md`.

## Navigation

### Mobile (primary surface)

Bottom nav with 4 visible tabs + "More": **Home · Schedule · Orders · Leads · More**. "More" opens a menu containing Update requests, Billing, Settings, and Sign out.

### Desktop

180px sidebar with 7 items: Home, Schedule, Orders, Leads, Update requests, Billing, Settings. Sign out sits in the sidebar footer.

### Conditional visibility

Nav items are declared as data in the layout and filtered based on the tenant:

- **Schedule** hidden if `tenants.booking_tool` is anything other than `'none'` or `'internal'`
- **Orders** hidden if `tenants.checkout_mode != 'pickup'`

Hidden tabs also don't render a route — direct URL access renders a 404.

## Pages

### 1. Home (`/admin`)

- Top bar: business name + **Sign out**
- Greeting ("Good morning, {owner_name}")
- Four rollup cards (2×2 mobile, 4×1 desktop):
  - **New orders** — `count(orders)` where `status='new'`
  - **Bookings today** — `count(bookings)` where `booking_date=today` and `status in ('confirmed','completed')`
  - **Unread leads** — `count(contact_leads)` where `is_read=false`
  - **Bookings this week** — `count(bookings)` where `booking_date` is in current ISO week
- **Visitors strip** (pink gradient, full-width): "Visitors this week" big number, % trend vs last week, 7-day bar sparkline. Pulled from `site_visits`.
- **Recent activity** — union of last 5 events across new bookings, new orders, new leads, ordered by `created_at` desc. Each row is a plain text line with relative time.

If Schedule tab is hidden for this tenant, drop the "Bookings today" and "Bookings this week" rollups and the booking rows in recent activity. If Orders tab is hidden, drop the "New orders" rollup and order rows. The grid reflows to whatever rollups remain:

- External booking + no products → 1 rollup ("Unread leads") + Visitors strip + Recent (leads only)
- Internal booking + no products → 3 rollups + Visitors + Recent
- External booking + pickup products → 2 rollups ("New orders", "Unread leads") + Visitors + Recent
- Internal booking + pickup products → 4 rollups (default) + Visitors + Recent

In the 1-rollup edge case, the card renders full-width rather than as a 2×2 grid cell.

Queries run in a server component at request time. No caching — data is small and per-tenant.

### 2. Schedule (`/admin/schedule`)

Sub-tabs: **Today · Upcoming · Hours**.

- **Today / Upcoming** — list of bookings grouped by date. Each row: time · customer name, service + phone. Pill shows status (Confirmed / Pending / Completed / Canceled / No-show). Tapping a row opens a compact action sheet: `Mark completed`, `Mark no-show`, `Cancel`, `Call customer` (tel: link).
- **Hours** — weekly editor backed by `booking_settings.working_hours` JSON. Each weekday has open/close time pickers and a "Closed" toggle.
- **Block date** action (top-bar button): calendar picker, multiple dates selectable; writes to `booking_settings.blocked_dates` array.

Slot duration, buffer, max-per-slot, and advance-days are **not** editable here — founder-configured at onboarding.

### 3. Orders (`/admin/orders`)

Tabs: **Active · History**.

- **Active** — rows where `status in ('new','ready')`, newest first. Status pill per row.
- **History** — rows where `status in ('picked_up','canceled')` and `created_at < today` (older than today). Same row layout, dimmed.
- Tapping a row opens a bottom-sheet drawer:
  - Customer name, phone, relative time
  - Itemized line-items from `items` jsonb + subtotal
  - Customer notes (if any)
  - Primary action button that reflects the next status transition:
    - `new` → "Mark ready"
    - `ready` → "Mark picked up"
    - `picked_up` → disabled "Picked up ✓" (terminal state)
    - `canceled` → disabled "Canceled" (terminal state)
  - Secondary action: **Call** (tel:). "Cancel order" is available only while status is `new` or `ready`.

Optimistic UI on status changes; rollback on server error.

### 4. Leads (`/admin/leads`)

List of `contact_leads` rows, newest first. Each row shows:

- Name + **New** pill if unread
- Phone (tel: link) or email (mailto:)
- Source page (if captured, e.g. "Services page")
- Message preview (full message on tap)
- Relative time

Opening a row marks it read (`is_read=true`). Read rows render at 60% opacity. No archive/delete in v1.

### 5. Update requests (`/admin/updates`)

- List of owner's `update_requests`, newest first, with category and status pills (`pending` / `in progress` / `done`).
- **New request** button opens `/admin/updates/new`:
  - Category select: Hours · Photo/image · Service · Pricing · Text/wording · Other
  - Description textarea (required, min 5 chars)
  - Optional photo upload (single image, ≤5MB, to `update-attachments` Supabase Storage bucket, folder `{tenant_id}/{request_id}.{ext}`)
  - Submit → inserts row, emails founder, returns to list

### 6. Billing (`/admin/billing`)

- Subscription status badge (Active / Past due / Canceled) pulled from `tenants.subscription_status`
- Next invoice date if available
- Single button: **Manage billing** → posts to `/api/admin/billing/portal` → redirects to Stripe Customer Portal
- If `subscription_status='past_due'`, a red banner explains how to update the payment method

### 7. Settings (`/admin/settings`)

- **Email on file** — displays `tenants.admin_email ?? tenants.email` (read-only; changing it is an update request)
- **PIN** — shows last-changed date, button opens **Change PIN** form (current PIN, new PIN, confirm new PIN)
- **Your website** — domain, published/draft status, subscription status
- **Sign out** button (red, full-width)

## Visitor Tracking

### Approach (v1)

Self-hosted lightweight counter. Replaceable by Plausible later without UI changes.

- New table `site_visits(tenant_id, day, count)` (composite PK).
- Small inline script injected into `src/app/site/[slug]/layout.tsx`:

```html
<script>
(function() {
  try {
    if (sessionStorage.getItem('sv_counted')) return;
    sessionStorage.setItem('sv_counted', '1');
    navigator.sendBeacon('/api/track?slug={slug}');
  } catch (e) {}
})();
</script>
```

- `/api/track` (public) resolves `slug` → `tenant_id`, then upserts `(tenant_id, current_date) -> count = count + 1`. Ignores requests where `User-Agent` matches common bot patterns (simple substring list).
- Visitors strip on Home queries the last 14 days, displaying current ISO week totals with % trend vs previous week and 7-day sparkline.
- **Label is "Visitors", not "Unique visitors"** — undercount/overcount acceptable for feel-good metric.

### Future migration to Plausible (phase 2)

Provision a Plausible site per tenant at onboarding. Replace `/api/track` ingestion with Plausible script. Home visitors strip reads from Plausible Stats API instead of `site_visits`. Same component, same UI.

## Database Schema

New migration: `supabase/migrations/011_owner_admin.sql`

```sql
-- Auth: PIN + optional dedicated reset email
ALTER TABLE tenants
  ADD COLUMN admin_pin_hash text,
  ADD COLUMN admin_pin_updated_at timestamptz,
  ADD COLUMN admin_email text;

-- Contact form submissions from published tenant sites
CREATE TABLE contact_leads (
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
CREATE INDEX idx_contact_leads_tenant_created
  ON contact_leads(tenant_id, created_at DESC);
CREATE INDEX idx_contact_leads_unread
  ON contact_leads(tenant_id) WHERE is_read = false;
ALTER TABLE contact_leads ENABLE ROW LEVEL SECURITY;

-- Owner-filed requests to change site content
CREATE TABLE update_requests (
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
CREATE INDEX idx_update_requests_tenant_status
  ON update_requests(tenant_id, status, created_at DESC);
ALTER TABLE update_requests ENABLE ROW LEVEL SECURITY;

-- Brute-force tracking for PIN login
CREATE TABLE admin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  ip_hash text,
  succeeded boolean NOT NULL,
  attempted_at timestamptz DEFAULT now()
);
CREATE INDEX idx_admin_login_attempts_recent
  ON admin_login_attempts(tenant_id, attempted_at DESC);

-- PIN reset tokens (single-use, short-lived)
CREATE TABLE admin_pin_resets (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Site visit counter (self-hosted; Plausible replaces later)
CREATE TABLE site_visits (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
CREATE INDEX idx_site_visits_tenant_day
  ON site_visits(tenant_id, day DESC);
```

All new tables are **service-role-only** (same pattern as `orders`). Queries happen server-side after the signed cookie is validated; RLS never sees an authenticated JWT. Policies are deny-all by default.

## API Surface

### New routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/admin/login` | POST | rate-limited only | Verify PIN for tenant derived from hostname, set `owner_session` |
| `/api/admin/logout` | POST | cookie | Clear cookie |
| `/api/admin/pin/change` | POST | cookie | Change PIN (current + new) |
| `/api/admin/pin/forgot` | POST | — | Email reset link |
| `/api/admin/pin/reset` | POST | reset token | Set new PIN |
| `/api/admin/bookings/status` | POST | cookie | Update booking status |
| `/api/admin/bookings/block-date` | POST | cookie | Add/remove blocked date |
| `/api/admin/bookings/hours` | POST | cookie | Update `working_hours` JSON |
| `/api/admin/orders/status` | POST | cookie | Transition order status |
| `/api/admin/leads/read` | POST | cookie | Toggle read state |
| `/api/admin/updates` | POST | cookie | Create update request |
| `/api/admin/updates/attachment` | POST | cookie | Upload photo to Storage |
| `/api/admin/billing/portal` | POST | cookie | Create Stripe portal session |
| `/api/track` | POST | — | Public visit counter |

All cookie-protected routes run through a shared helper:

```ts
// lib/admin-auth.ts
export async function requireOwnerSession(request: Request):
  Promise<{ tenant_id: string } | Response>
```

Returns either the session or a `Response` with 401 for the caller to return.

### Existing `/api/leads` behavior

Today `/api/leads` inserts into `interested_leads` (the wizard prospect table). We extend it with a hostname check:

- If `request.host` is the canonical root (`siteforowners.com` / preview domains) → `interested_leads` (unchanged)
- If `request.host` is a tenant domain → `contact_leads` (new behavior)

This preserves the existing prospect-capture flow without introducing a separate contact-form endpoint.

## Founder-side changes

- **`/clients/[id]`** (existing admin page): add a section with
  - **Set/reset PIN** — generates 6 random digits, shows once, stores bcrypt hash. "Copy PIN" button for founder to share via WhatsApp.
  - **admin_email** field for PIN-reset target (defaults to `tenants.email`)
  - Inline list of this tenant's recent `update_requests` with status controls.
- **New founder view** (location: inside `/clients` or a sibling route): cross-tenant update-request queue, filterable by status.

## Security

- PIN hash: **bcrypt** with cost 10. Verify with `bcrypt.compare`.
- Session cookie signed with `SESSION_COOKIE_SECRET` (new env var). Payload includes tenant_id, iat, exp. Verify signature on every protected route.
- All owner API routes use the service role client, gated by `requireOwnerSession`. No raw SQL from user input.
- `admin_login_attempts.ip_hash` = SHA-256 of `x-forwarded-for` with a server-side pepper (privacy: no raw IPs stored).
- Update-request attachments stored per-tenant folder (`{tenant_id}/...`). Upload endpoint validates MIME type and size (≤5MB) server-side.

## Risks & non-obvious calls

1. **PIN is weaker than email+password**. 6 digits = 1M combos. Rate limits + lockouts make online brute-force impractical; offline is not possible (hash not exposed). Dashboard has no destructive powers and no financial data access (Stripe is via portal). Risk accepted for v1.
2. **Hostname-based tenant derivation** assumes DNS ownership is the source of truth. This is correct because tenants map via `custom_domain` and `subdomain` columns with a UNIQUE constraint; only one tenant can own a hostname at a time.
3. **Visitor tracker undercounts** vs. Plausible — no unique-user logic, minimal bot filtering. Labeling it "Visitors" (not "Unique visitors") avoids implying precision.
4. **Path reservation**: `/admin` on tenant domains is reserved. Template authors must be warned in CLAUDE.md.
5. **Supabase Storage bucket** `update-attachments` must be created as a separate step (migration `011` can include bucket + policy setup if supported, otherwise manual step documented in migration comments).
6. **Unpublished/lapsed tenants** can log in so they can reach Billing. Home shows a banner reminding them of their status — otherwise they may be confused why their stats are zero.

## Future phases

- **Plausible integration** — swap `/api/track` backend, same Home UI.
- **Staff sub-accounts** — `tenant_members` with roles, multi-PIN / multi-user auth.
- **Owner-editable business info** (hours/phone/address) direct to `tenants` without going through update requests.
- **Push / SMS notifications** on new orders, bookings, and leads.
- **Native PWA install prompt** for Home-screen experience.
- **Full booking settings** — slot duration, buffer, max-per-slot, advance-days from the owner side.

## Open questions

None blocking. To confirm during implementation:
- Exact bot-UA substring list for `/api/track` (simple list is fine for v1)
- Copy / tone for the "Forgot PIN" fallback message (founder's WhatsApp vs. contact form)
