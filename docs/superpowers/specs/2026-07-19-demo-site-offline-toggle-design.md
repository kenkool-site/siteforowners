# Demo Site Offline/Online Toggle — Design

**Date:** 2026-07-19
**Status:** Approved

## Problem

Demo sites are tenants with `is_demo = true`, provisioned as `trialing` with
`site_published = true`. Under `isPublicSiteLive()` they stay publicly live
indefinitely — including demos sent to prospects who never responded. "Move to
Prospect" deliberately leaves the demo up. The founder admin has a Publish
action but no inverse: the only way to take a demo down today is full teardown,
which destroys the provisioned tenant.

## Goal

A reversible founder-admin toggle to take a demo/prospect site offline (public
URL serves 404) and bring it back online later, without touching the tenant's
subdomain, preview, or content.

## Decisions (confirmed with founder)

- **Down behavior:** plain 404 via the existing middleware `/not-found` rewrite
  (no-store) — identical to a gated subscription. No new public-facing page.
- **Scope:** demo tenants only (`is_demo = true`). Real paying clients remain
  governed by subscription status; the toggle must not be able to take a
  paying client's site down, enforced server-side.
- **Granularity:** per-row action in the admin tenant tables. No bulk action.

## Design

### 1. Guard — `src/lib/tenant-access.ts`

New pure function beside `canTeardownDemo`, same pattern:

```ts
/** Only demo tenants may have their public site toggled offline from admin. */
export function canToggleSiteOffline(
  tenant: { is_demo?: boolean | null } | null,
): boolean {
  return !!tenant && tenant.is_demo === true;
}
```

Unit-tested in `src/lib/tenant-access.test.ts` (null tenant, `is_demo`
false/null/true).

### 2. API — `src/app/api/admin/toggle-site-offline/route.ts`

`POST` with JSON body `{ tenant_id: string, site_published: boolean }`.

- Auth: `admin_session` cookie must equal `ADMIN_PASSWORD` (same check as
  `/api/update-tenant`); otherwise 401.
- Validation: `tenant_id` non-empty string, `site_published` a boolean;
  otherwise 400.
- Load tenant via service-role client (`createAdminClient`). 404 if missing.
- Guard: `canToggleSiteOffline(tenant)` — 403 with a clear error if the tenant
  is not a demo.
- Update `tenants.site_published`, return `{ site_published }`.

### 3. UI — `src/app/(admin)/clients/ClientActions.tsx`

For `isDemo` rows only:

- When published: red-outline **Take Offline** button. `confirm()` names the
  business: "Take {businessName} offline? Visitors to its URL will see a 404.
  You can bring it back online anytime."
- When offline: **Bring Online** button (green-outline), confirm optional
  wording: "Bring {businessName} back online at its existing URL?"
- On success, local state flips (like the existing publish flow) so the button
  and the published-URL links update in place. When offline, the site links
  render struck-through/grayed instead of green, signalling the URL is down.

Because both the Clients and Demos pages render `ClientActions` through the
shared `TenantTable` (desktop table and mobile card layouts alike), one
component change covers every surface where demos are listed.

### 4. Down/up behavior (no new code)

- Offline: `site_published = false` → `isPublicSiteLive()` false → middleware
  rewrites the public host to `/not-found` with `Cache-Control: no-store`.
- Online: `site_published = true` restores the site at the same subdomain /
  custom domain. Nothing else changes.

## Error handling

- API returns JSON `{ error }` with 400/401/403/404/500; UI surfaces it via
  `alert()` (existing ClientActions convention).
- Toggle is idempotent — setting `site_published` to its current value is a
  harmless no-op update.

## Testing

- Unit: `canToggleSiteOffline` cases in `tenant-access.test.ts`
  (`npx tsx --test`).
- Manual: on a demo row — Take Offline → public URL 404s; Bring Online →
  site restored; verify no toggle renders on a real-client row and that the
  endpoint 403s for a non-demo `tenant_id`.

## Out of scope

- Bulk offline actions, auto-expiry of stale demos, a branded "demo expired"
  page, and any change to real-client gating (stays subscription-driven).
