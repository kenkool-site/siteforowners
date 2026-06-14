# Per-Client Go-Live Checklist (Admin) — Design

**Date:** 2026-06-13
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/go-live-checklist`

## Problem

When a client goes live, the founder runs a series of manual steps (Google
Business Profile setup, NAP consistency, Search Console submission, etc. — see
`docs/client-go-live-checklist.md`). Today that lives only in a markdown doc;
there's no per-client tracking of which steps are done. The founder wants an
interactive checklist **on the Clients list page**, one per client, with state
persisted.

## Goal

A per-client go-live checklist surfaced as a progress badge on each row of the
Clients table (`/clients`), opening a modal where the founder ticks off manual
steps. A few items the system already knows are shown auto-completed (read-only).
Purely a tracking aid — it gates nothing.

## Scope

**In scope:**
- A "Go-live" column on the **Clients** table only, with a progress badge per row.
- A modal listing auto (read-only) + manual (toggleable) checklist items.
- Persistence of manual completions per tenant.
- Auto items derived from existing tenant/preview data.

**Out of scope:**
- Live HTTP verification of the client site (canonical/JSON-LD/sitemap fetches).
- Any gating behavior (go-live is still Stripe-driven; this only tracks).
- Showing the checklist on the Prospects or Demos tables.
- Per-client customization of the item list (the list is fixed in code).
- Notes/comments per item (only done/not-done + a completion timestamp).

## Decisions

1. **Lives on the Clients list**, not the edit UI — that's where clients are
   managed at a glance. Implemented as an opt-in column so the shared
   `TenantTable` (also used by Prospects) is unaffected.
2. **Hybrid display, manual storage.** Auto items are derived live and never
   stored; only manual completions are persisted.
3. **Store completion state, not labels.** Item definitions (ids, labels, order)
   live in code; the DB stores only `{ manualItemId: ISO-timestamp }`. Rewording
   or reordering items needs no data migration.
4. **JSONB column on `tenants`** (matches the project's JSONB usage on
   `previews`); no separate table.
5. **No gating** — ticking the last box does nothing but show 100%.

## Architecture

Small, focused units:

| File | Responsibility |
|------|----------------|
| `supabase/migrations/032_go_live_checklist.sql` | Add `go_live_checklist jsonb DEFAULT '{}'` to `tenants`. (Next free number — `030`/`031` are taken, with an existing `031` duplicate, so use `032`.) |
| `src/lib/go-live-checklist.ts` | Pure: item definitions, `deriveAuto()`, `computeProgress()`, `isManualItemId()`. Unit-tested. |
| `src/app/(admin)/clients/GoLiveChecklist.tsx` | Client component: progress badge + modal + optimistic toggle. |
| `src/app/api/update-checklist/route.ts` | `admin_session`-guarded endpoint to toggle one manual item. |
| `src/app/(admin)/_components/TenantTable.tsx` | Add optional `goLive` prop → renders the Go-live column (desktop + mobile card). |
| `src/app/(admin)/clients/page.tsx` | Build `slug → seo_locality` map; pass per-tenant `goLive` data to the table. |
| `src/app/(admin)/_lib/tenants.ts` | Add `go_live_checklist` to the `Tenant` type. |

## Data model

New column:

```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS go_live_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Stored shape (manual completions only; key present ⇒ done):

```json
{ "gbp_created": "2026-06-13T14:30:00.000Z", "reviews": "2026-06-13T14:31:10.000Z" }
```

A missing/`{}` value means nothing manual is done yet. Auto items are computed at
render time and never written here.

## Item definitions (`go-live-checklist.ts`)

**Auto items** (read-only; `derive(input)` from data already loaded):

| id | label | derive |
|----|-------|--------|
| `live` | Client is live (paid) | `!input.isDemo` |
| `domain` | Custom domain or subdomain configured | `!!(input.customDomain || input.subdomain)` |
| `locality` | Local SEO area set | `!!input.seoLocality` |

`deriveAuto` input: `{ isDemo: boolean; customDomain: string | null; subdomain: string | null; seoLocality: string | null }`.

**Manual items** (toggleable, persisted):

| id | label |
|----|-------|
| `hours_services` | Hours & services verified |
| `social` | Social links added |
| `gbp_created` | Google Business Profile created & verified |
| `gbp_nap` | GBP info matches website (NAP) |
| `gbp_website` | GBP website link points to live site |
| `reviews` | Review collection started |
| `gsc_sitemap` | Sitemap submitted to Search Console |
| `gsc_index` | Requested indexing in Search Console |

Total items = 3 auto + 8 manual = 11.

**`computeProgress(autoState, manualState)`** → `{ done, total }` where `done` =
count of true auto items + count of present manual keys, `total` = 11.

**`isManualItemId(id)`** → true only for the 8 manual ids (used by the API to
reject unknown/auto ids).

## API contract

`POST /api/update-checklist`

- **Auth:** `admin_session` cookie === `ADMIN_PASSWORD` (same guard as
  `/api/update-tenant`); else 401.
- **Body:** `{ tenant_id: string, item_id: string, done: boolean }`.
- **Validation:** `isManualItemId(item_id)` must be true (else 400). `tenant_id`
  required (else 400).
- **Effect:** read the tenant's `go_live_checklist`; if `done`, set
  `[item_id] = new Date().toISOString()`; if `!done`, delete the key. Write back
  with `updated_at`. Tenant not found → 404.
- **Response:** `{ ok: true }` or `{ error: string }` with appropriate status.

The endpoint updates a single item per call (mirrors the granular, auto-save
toggle UX).

## UI behavior (`GoLiveChecklist.tsx`)

- **Props:** `tenantId`, `isDemo`, `customDomain`, `subdomain`, `seoLocality`,
  `initialChecklist` (the stored `{id: timestamp}` map).
- **Badge:** a small button rendered in the table cell showing `computeProgress`
  as `N/11`, styled green at 11/11, neutral otherwise. Opens the modal.
- **Modal:** two groups — Auto (read-only rows with ✓/○ and a muted "auto" tag)
  and Manual (checkbox rows). Manual rows reflect local state.
- **Toggle:** optimistic — flip local state immediately, POST to
  `/api/update-checklist`. On non-OK response or network error, **revert** the
  item and show an inline error. The badge count updates from local state.
- Uses existing admin UI conventions (inline Tailwind toggles like
  `SiteEditor`/`FounderUpdatesPanel`, `Button` component).

## Clients page data flow

1. `getTenants()` already `select("*")`, so each tenant row includes the new
   `go_live_checklist`. Add it to the `Tenant` type.
2. In `clients/page.tsx`, after `partitionTenants`, collect the clients'
   `preview_slug`s and query `previews(slug, seo_locality)` for them, building a
   `Record<slug, seo_locality>`.
3. Pass a `goLive` map to `TenantTable`:
   `{ [tenantId]: { seoLocality, checklist } }`. `TenantTable` renders the
   Go-live column (with `<GoLiveChecklist>`) only when `goLive` is provided.

## Testing

Unit tests (`src/lib/go-live-checklist.test.ts`, `node:test`):
- `deriveAuto`: each auto item true/false across input combinations.
- `computeProgress`: counts auto + manual correctly; 0/11, partial, 11/11.
- `isManualItemId`: true for the 8 manual ids; false for auto ids and unknowns.

No UI/integration tests required for the MVP; the pure lib carries the logic.
Manual check: open a client's checklist, toggle items, reload, confirm
persistence; confirm Prospects table is unchanged.

## Edge cases

- `go_live_checklist` null/absent → treated as `{}`.
- Toggling an item off deletes its key (not stored as `false`).
- Unknown or auto `item_id` sent to the API → 400 (auto items are never
  persisted).
- A client with no `preview_slug` → `seoLocality` is null → `locality` auto item
  shows incomplete.
- Mobile card layout in `TenantTable` shows the same badge.
