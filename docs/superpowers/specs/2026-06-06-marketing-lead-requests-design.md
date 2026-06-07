# Marketing-lead requests → admin dashboard → preview

**Date:** 2026-06-06
**Status:** Approved (design)
**Branch:** `feat/marketing-lead-requests`

## Problem

The "Request yours" form (`#request-yours` on `/demo` and the homepage) is the CTA
for Facebook ads. Today it only emails the founder via Resend — nothing is
persisted, and there is no way to view requests in the admin dashboard or act on
them. The founder wants to:

1. Keep the existing email notification (unchanged).
2. See every request in the admin dashboard.
3. Jump from a request straight into the preview wizard with fields pre-filled,
   so a preview can be built with minimal manual entry. Previews are still sent
   to requesters **manually** — no automation.
4. Improve the form only if it helps, while keeping it simple (few fields).

## Current state (as explored)

- **Form:** [`DemoLeadForm.tsx`](../../../src/app/(marketing)/demo/_components/DemoLeadForm.tsx)
  posts `{ source, businessName, email, phone, businessType, businessLink, notes }`
  to `/api/marketing-leads`.
- **API:** [`/api/marketing-leads/route.ts`](../../../src/app/api/marketing-leads/route.ts)
  rate-limits, validates via `parseMarketingLead`, and sends one Resend email to
  `ADMIN_EMAIL`. No DB write. The parser in
  [`marketing-lead.ts`](../../../src/lib/marketing-lead.ts) already accepts an
  optional `businessAddress`, but the form never sends it.
- **Admin:** `(admin)` route group with tabs **Prospects / Clients / Previews**,
  gated by `admin_session` cookie in [`middleware.ts`](../../../src/middleware.ts)
  (`ADMIN_ROUTES`). The **Prospects** tab reads `interested_leads` — a *different*
  funnel (people who viewed a preview and clicked interested).
- **Preview wizard:** [`/preview/page.tsx`](../../../src/app/(marketing)/preview/page.tsx)
  is a 5-step client wizard. It already prefills from `?edit=<slug|group_id>` via
  an effect, has a "Quick Import" box (Booksy/Acuity/Vagaro/Square via
  `/api/import-booking`), and Google Maps enrichment keyed off business name +
  address.
- **Convention:** public inserts use `createAdminClient()` (service role) inside
  the API route, bypassing RLS — see [`/api/leads`](../../../src/app/api/leads/route.ts).

## Design

### 1. Persist every submission (DB = source of truth)

New migration `supabase/migrations/030_create_marketing_leads.sql`:

```sql
CREATE TABLE IF NOT EXISTS marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name    text NOT NULL,
  email            text NOT NULL,
  phone            text NOT NULL,
  business_address text,
  business_type    text NOT NULL,
  business_link    text,
  notes            text,
  source           text NOT NULL DEFAULT 'demo',  -- 'demo' | 'homepage'
  status           text NOT NULL DEFAULT 'new',    -- 'new' | 'contacted' | 'archived'
  preview_slug     text,                           -- set when a preview is built from it
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX idx_marketing_leads_created_at ON marketing_leads (created_at DESC);
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
-- No public policies: all access is via the service-role admin client.
```

Separate table from `interested_leads` on purpose — different funnel (ad clicks,
no preview yet), keeps the Prospects tab clean.

### 2. API inserts, then emails

Update [`/api/marketing-leads/route.ts`](../../../src/app/api/marketing-leads/route.ts):

- After `parseMarketingLead` succeeds, **insert the lead via `createAdminClient()`
  first**, so it is captured even if email is unconfigured or Resend fails.
- Then send the existing Resend email **best-effort** (do not fail the request if
  email errors; log instead). Rate-limiting and validation are unchanged.

### 3. Form change — add one optional field

[`DemoLeadForm.tsx`](../../../src/app/(marketing)/demo/_components/DemoLeadForm.tsx):

- Add an **optional** "Business address" input and include `businessAddress` in the
  POST payload (parser already supports it).
- Optional (not required) to avoid adding friction to the FB-ad CTA; when present
  it powers Maps enrichment in the wizard. No other field changes — stays at 7
  fields, 4 required (name, email, phone, type).

### 4. New admin "Requests" tab

- Add `/requests` to `ADMIN_ROUTES` in [`middleware.ts`](../../../src/middleware.ts).
- Add a "Requests" nav link in the [admin layout](../../../src/app/(admin)/layout.tsx).
- New page `src/app/(admin)/requests/page.tsx` (service-role read, `revalidate = 0`):
  - Stat cards: Total / This week / New (`status = 'new'`).
  - Table: business name + type, source badge, tappable phone/email, link, notes,
    time-ago. Default view excludes `status = 'archived'`.
- New client component `src/app/(admin)/requests/RequestActions.tsx`:
  - **"Create preview"** button (opens the prefilled wizard in a new tab — see §5).
  - **Mark contacted** / **Archive** controls.
- New founder-gated route `src/app/api/admin/marketing-leads/route.ts` (checks
  `admin_session` === `ADMIN_PASSWORD`, mirroring `provision-demo`):
  - Accepts `{ leadId, status }` to update a lead's status.
  - Accepts `{ leadId, preview_slug }` to link a generated preview back (§5).

### 5. "Create preview" = prefilled wizard

- The button links (`target="_blank"`) to:
  `/preview?name=…&type=…&phone=…&address=…&link=…&desc=…&lead=<id>`
  (`desc` = the lead's `notes`).
- The wizard gets a new "prefill-from-lead" effect, parallel to the existing
  `?edit=` effect and skipped when `edit` is present. It seeds: business name,
  business type (mapped), phone, address, description (from `desc`), and drops
  `link` into the **Quick Import** box so the founder can one-click import or run
  Maps.
- New helper `mapMarketingTypeToWizardType()` in
  [`marketing-lead.ts`](../../../src/lib/marketing-lead.ts) maps form business
  types → wizard types:
  - Braids → `braids`, Locs → `locs`, Nails → `nails`,
    Barber / grooming → `barbershop`,
    Salon / Hair / Haircuts → `salon`.
  - Lashes / brows, Spa / skincare, Other beauty business → left blank (founder
    picks in step 1).
- **Loop-closing (included):** when the wizard generates a design and a `lead`
  param is present, it POSTs `{ leadId, preview_slug }` to
  `/api/admin/marketing-leads` to set the lead's `preview_slug` and
  `status = 'contacted'`. The Requests table then shows which requests became
  previews. (~10 lines; failure is non-blocking.)

## Out of scope (YAGNI)

- No automated sending of previews to requesters — founder sends manually.
- No editing of lead fields, no CSV export, no de-dup of repeat submissions.
- No changes to the `interested_leads` / Prospects funnel.

## Testing

- `parseMarketingLead` already has the `businessAddress` path; add/keep a unit
  test asserting address is parsed and that `mapMarketingTypeToWizardType` maps
  each form type correctly (including the blank cases). Run with
  `npx tsx --test src/lib/marketing-lead.test.ts`.
- Manual: submit the form (with and without address) → verify a row in
  `marketing_leads` and the email still arrives → open `/requests` → click
  "Create preview" → confirm wizard prefills → generate → confirm the lead flips
  to `contacted` with `preview_slug` set.

## Files touched

- `supabase/migrations/030_create_marketing_leads.sql` (new)
- `src/app/api/marketing-leads/route.ts` (insert before email)
- `src/lib/marketing-lead.ts` (type mapping helper; export address handling)
- `src/app/(marketing)/demo/_components/DemoLeadForm.tsx` (address field)
- `src/middleware.ts` (`/requests` in `ADMIN_ROUTES`)
- `src/app/(admin)/layout.tsx` (nav link)
- `src/app/(admin)/requests/page.tsx` (new)
- `src/app/(admin)/requests/RequestActions.tsx` (new)
- `src/app/api/admin/marketing-leads/route.ts` (new)
- `src/app/(marketing)/preview/page.tsx` (prefill-from-lead effect + link-back on generate)
