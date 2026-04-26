# Owner-Facing Services Management — Design

**Date:** 2026-04-26
**Status:** Draft (awaiting user review)
**Scope:** Spec 3 of the Booking & Scheduling v2 initiative.
Spec 1 (customer-facing booking) and Spec 2 (operator tools) have shipped.
Spec 4 (add-ons + categories) will follow this.

---

## Problem

Today, services live in `previews.services` (JSONB array of `{ name, price, description?, duration_minutes? }`). Editing them is **founder-only** — owners must email or text the founder to update prices, add a new service, or fix a typo. This is a daily-friction blocker for owners and a constant inbound interruption for the founder.

## Goals

- Owners self-serve their services — add, edit, delete, including a new optional **image per service**.
- Same editing UX for the founder's `SiteEditor`, so both roles use the same component and save through the same endpoint.
- The new admin "Services" tab replaces "Leads" in the primary mobile nav; Leads moves to a persistent envelope icon in the top right of every admin page.

## Non-Goals (deferred)

- **Add-ons** — Spec 4. Owner UI to define add-ons + customer-side selection during booking + duration/price math.
- **Service categories** — Spec 4 or later. Top-level groupings.
- **Soft-delete / archive** — v1 uses hard-delete.
- **Per-language descriptions** — owner edits the base description; AI translations stay on a separate flow.
- **Image cropping / in-app resize** — store the upload as-is; browser handles display sizing.
- **Image cleanup when a service is deleted** — orphan images in Storage are harmless; a sweep can ship later.
- **Drag-and-drop reordering** — array order is the order; reorder via delete + re-add for v1.

---

## Architecture

```
[ Owner mobile/desktop ]                         [ Founder admin panel ]
        |                                                  |
        +---------------+         +------------------------+
                        v         v
                 ServiceRow component (shared, expandable)
                        |
                        v
              POST /api/admin/services      (dual-auth: owner OR founder)
              POST /api/admin/services/upload-image  (dual-auth)
                        |
                        v
              previews.services JSONB array  (single source of truth)
                        |
                        v
              5 service templates render
              (image thumbnail when present)

[ Persistent across every admin page ]
LeadsBadge (envelope icon, top right) → /admin/leads
```

The `ServiceRow` component is the visible center of gravity: one component, two consumers (owner page + SiteEditor), one save path.

---

## Navigation Changes

**Mobile bottom nav (primary slots):**
- Before: Home / Schedule / Leads / Updates
- After: **Home / Schedule / Services / Updates**
- Leads demoted to "More" overflow (page still exists at `/admin/leads`).

**Desktop sidebar:** same reordering — Services becomes a primary item, Leads moves below the fold or sits above sign-out.

**Leads notification icon (top-right, every admin page):**
- ✉️ envelope icon in the **mobile top bar** (next to "View site" / Sign out).
- Same icon in the **desktop sidebar header** (next to "View site").
- Small red badge with the unread count when `> 0`; no badge when `0`.
- Click → navigates to `/admin/leads`.
- Reuses the existing `getRollups().unreadLeads` query, fetched once per page load.

---

## Data Model

`previews.services` JSONB array — same shape, gains a new optional field:

```ts
export interface ServiceItem {
  name: string;
  price: string;
  description?: string;
  duration_minutes?: number;  // already used in JSONB since Spec 1; declare it explicitly
  image?: string;             // NEW — public URL of the uploaded image
}
```

The 5 service templates' inline `services: { ... }[]` types in `Bold/Vibrant/Classic/Elegant/WarmServices.tsx` get the same `image?: string` addition.

**No `previews` table schema migration needed** — JSONB tolerates the new field automatically.

**Storage migration `017_create_service_images_bucket.sql`:**

```sql
-- Public-read bucket for owner-uploaded service images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so the rendered site can fetch directly.
CREATE POLICY IF NOT EXISTS "service-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-images');

-- Authenticated writes only (the API route uses the service role).
CREATE POLICY IF NOT EXISTS "service-images service-role write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'service-images');
```

---

## UI: Services Page

**Path:** `/site/[slug]/admin/services` (server component → hydrates `ServicesClient`).

### Page-level UI

- Header: "Services" + `+ Add service` button.
- List of `ServiceRow` components, one per service.
- Sticky bottom save bar: "Save changes" button — enabled only when there are unsaved edits; shows "✓ Saved" briefly after success.
- Empty state: "No services yet. Add your first service to start taking bookings."

### `ServiceRow` component (collapsed state)

```
┌──────────────────────────────────────────────┐
│ [thumb 48×48]  Box Braids       3h · $180  ▸ │
└──────────────────────────────────────────────┘
```

- Tap row → expand.

### `ServiceRow` component (expanded state)

```
┌──────────────────────────────────────────────┐
│ ┌──────┐                                     │
│ │ img  │  Name:        [ Box Braids       ] │
│ │ +    │  Price:       [ $180 ]              │
│ └──────┘  Duration:    [ − ] 3h [ + ]        │
│                                              │
│ Description:                                 │
│ ┌──────────────────────────────────────────┐ │
│ │ Classic box braids, medium size...       │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Delete                            ▾ Collapse │
└──────────────────────────────────────────────┘
```

**Field rules:**
- **Image** — 64×64 thumbnail. Click to upload (single file, JPG/PNG/WebP, ≤ 5 MB). Replace by clicking again. Uses `POST /api/admin/services/upload-image`; persists URL on the row.
- **Name** — required, max 80 chars.
- **Price** — required, free-form text ("$180", "From $50", "$45+"). Same as today.
- **Duration** — required, `−`/`+` stepper (existing pattern from SiteEditor), range 1h–8h, multiples of 60 min.
- **Description** — optional, max 200 chars, multi-line.
- **Delete** — red link at bottom of expanded row. Inline confirm: "Delete this service?" with Confirm/Cancel.

### Add-service flow

`+ Add service` appends a new blank row at the bottom and auto-expands it. Until the owner fills the required fields, "Save changes" stays disabled (or saves only complete rows).

### Validation

- Name and price required for all rows on save.
- Image is optional.
- If owner removes all services, the public site falls back to the existing "no services" state — the booking section's per-service Book buttons disappear; main CTA still renders.

### Founder's `SiteEditor` parity

The founder's existing services-editing block in `SiteEditor.tsx` (around lines 1134-1206) gets replaced with the same `ServiceRow` component, so the editing UX is identical for both roles. The founder's save flow migrates from the legacy `/api/update-site` (services slice) to the new `/api/admin/services` endpoint. The dual-auth helper accepts the founder's admin-password cookie.

### Public site rendering

Each of the 5 service templates (`Bold/Vibrant/Classic/Elegant/WarmServices.tsx`) renders `service.image` as a thumbnail when present, alongside name/price. Each template's existing card layout dictates exact placement (left-of-text for Classic; top-of-card for Bold/Vibrant; etc.). When `image` is missing, the existing layout stays unchanged — no regression for tenants who don't add images.

---

## API

### `GET /api/admin/services`

- Auth: dual (owner session OR founder admin-password cookie).
- Returns `{ services: ServiceItem[] }` for the caller's tenant.
- For founder: requires `?tenant_id=<id>` query param.

### `POST /api/admin/services`

- Auth: dual.
- Body: `{ services: ServiceItem[] }` — replaces the entire array atomically. (Founder also includes `tenant_id` in the body.)
- Validates each item: `name` non-empty string ≤ 80 chars; `price` non-empty string ≤ 30 chars; `duration_minutes` integer in `[60, 480]` and multiple of 60; `description` ≤ 200 chars; `image` either omitted or a URL whose origin matches the project's Supabase Storage public host (prevents owners from planting arbitrary URLs / phishing).
- **Save is atomic.** If any row fails validation, the whole request returns `400` with the failing index + reason; no rows are written. UI then highlights the failing row.
- On success, returns `{ ok: true, services: ServiceItem[] }` (echoes the saved array).

### `POST /api/admin/services/upload-image`

- Auth: dual.
- Multipart form data with field `image`. Single file, ≤ 5 MB, JPG/PNG/WebP only.
- Stores at `tenants/<tenant_id>/<uuid>.{ext}` in the `service-images` bucket.
- Returns `{ url: string }` — the public URL for the stored object.

### Dual-auth helper

In `src/lib/admin-auth.ts`:

```ts
export type DualAuthResult =
  | { kind: "owner"; tenantId: string; tenant: AdminTenant }
  | { kind: "founder"; tenantId: string };

/**
 * Resolves either an owner session OR the founder admin-password cookie.
 * For founder requests, the tenant_id must come from the body/query
 * (the founder can operate on any tenant).
 */
export async function requireOwnerOrFounder(
  request: NextRequest,
  fallbackTenantId?: string,  // body/query tenant_id for founder branch
): Promise<DualAuthResult | null> {
  const ownerSession = await requireOwnerSession(request);
  if (ownerSession) {
    return { kind: "owner", tenantId: ownerSession.tenant.id, tenant: ownerSession.tenant };
  }
  const adminCookie = request.cookies.get("admin_session")?.value;
  if (process.env.ADMIN_PASSWORD && adminCookie === process.env.ADMIN_PASSWORD) {
    if (!fallbackTenantId) return null;  // founder must specify which tenant
    return { kind: "founder", tenantId: fallbackTenantId };
  }
  return null;
}
```

The owner branch ignores any `tenant_id` in the body — the session is authoritative. The founder branch requires it.

---

## Security Notes

- **Existing `/api/upload-images` has no auth at all** — pre-existing issue, unchanged by this spec, separate cleanup ticket.
- **New image endpoint is dual-auth only** — no anonymous uploads.
- **Service images are public-read** by design (the public site fetches them).
- **Tenant scoping**: the storage path `tenants/<tenant_id>/...` is enforced server-side; the owner session can't write to another tenant's path.

---

## Testing

### New unit tests

`src/lib/admin-auth.test.ts` (extend if exists, otherwise add):
- `requireOwnerOrFounder`: owner session takes precedence over founder cookie when both present.
- Founder cookie + `tenant_id` → returns `{ kind: "founder", tenantId }`.
- Founder cookie without `tenant_id` → returns null.
- Neither auth → null.

### Manual smoke

- Log in as owner on testclient → "Services" tab visible in mobile primary nav, leads ✉️ in top right.
- Owner edits a service: change price, add description, upload image → save → reload → persists.
- Owner adds a new service → saves → public site shows it.
- Owner deletes a service → confirm → public site no longer shows it.
- Owner uploads invalid file (too big, wrong type) → API returns 400 with a useful error.
- Founder opens `SiteEditor` for a tenant → services edit UI is identical to owner page → save persists.
- Public site renders `image` thumbnail on all 5 template variants when set.
- Public site renders unchanged for services without `image`.

### Existing tests

All 46 tests stay green.

---

## Files Touched

| File | Change |
|------|--------|
| `supabase/migrations/017_create_service_images_bucket.sql` | New |
| `src/lib/ai/types.ts` | Extend `ServiceItem` with `image?` and `duration_minutes?` |
| `src/lib/admin-auth.ts` | Add `requireOwnerOrFounder` dual-auth helper |
| `src/lib/admin-auth.test.ts` | New tests for the helper |
| `src/app/api/admin/services/route.ts` | New — GET + POST, dual-auth |
| `src/app/api/admin/services/upload-image/route.ts` | New — single-image upload, dual-auth |
| `src/app/site/[slug]/admin/services/page.tsx` | New — server component |
| `src/app/site/[slug]/admin/services/ServicesClient.tsx` | New — client component |
| `src/app/site/[slug]/admin/_components/ServiceRow.tsx` | New — expandable row, shared between owner page + SiteEditor |
| `src/app/site/[slug]/admin/_components/LeadsBadge.tsx` | New — envelope + unread badge |
| `src/app/site/[slug]/admin/_components/AdminShell.tsx` | Replace Leads with Services in primary nav; mount LeadsBadge in mobile top bar + desktop sidebar header |
| `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx` | Replace the existing services section with shared `ServiceRow`; save via `/api/admin/services` |
| `src/components/templates/services/BoldServices.tsx` | Render `service.image` thumbnail when present |
| `src/components/templates/services/VibrantServices.tsx` | Same |
| `src/components/templates/services/ClassicServices.tsx` | Same |
| `src/components/templates/services/ElegantServices.tsx` | Same |
| `src/components/templates/services/WarmServices.tsx` | Same |

## Rollout

1. Apply migration `017_*.sql` (you run manually) — creates the `service-images` bucket with public-read RLS.
2. Deploy. Owner-facing `/admin/services` page is live; SiteEditor uses the same shared component.
3. Smoke test: log in as owner on testclient, navigate to Services tab, edit a service, upload an image.
4. Verify image rendering on the public site.
5. Smoke test the founder's SiteEditor still saves correctly through the migrated endpoint.

## Open Questions

None blocking. Items deferred to later specs are listed under Non-Goals.
