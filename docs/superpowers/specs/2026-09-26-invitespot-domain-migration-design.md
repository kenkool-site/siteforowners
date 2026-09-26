# InviteSpot Domain Migration Design

**Goal:** Move InviteSpot's guest-facing surface (the public invitation page and
the Memories photo-sharing feature) from `*.siteforowners.com` subdomains onto
`*.invitespot.app` subdomains, permanently redirecting existing
`*.siteforowners.com` invitation links (starting with the live "mercy-john"
event) so links guests already have keep working.

## Context

InviteSpot (the wedding/event invitation + guest-photo-sharing product) is
spinning off from SiteForOwners as its own brand, on its own domain
(`invitespot.app`, already purchased). Today every invitation event is
reachable at `{label}.siteforowners.com`, sharing one label registry
(`platform_subdomains`, keyed by `label` only — no domain column) with regular
SiteForOwners tenant business-site subdomains. A label is always exclusively
either a tenant or an invitation event (`platform_subdomains` enforces
`num_nonnulls(tenant_id, invitation_event_id) = 1`), which is what makes this
change possible without a data migration: "mercy-john" already unambiguously
resolves to its invitation event regardless of which apex domain is asking.

Both `siteforowners.com` and `invitespot.app` are Cloudflare-managed DNS zones.
Both are served by the same Next.js app on the same Vercel project — this is a
routing and DNS change, not a new deployment.

## Decisions

- **invitespot.app becomes the sole home for invitation events going
  forward.** New events are only ever given an `invitespot.app` subdomain.
  Existing `*.siteforowners.com` invitation links (currently just
  "mercy-john") get a permanent (301) redirect to their `invitespot.app`
  equivalent, preserving path and query string — nothing already shared with
  guests breaks.
- **The host/owner management dashboard stays on `siteforowners.com`.** Only
  the guest-facing surface (the public invitation page and Memories) moves.
  Sign-in, session cookies, and the `/invitations/manage/[eventId]` tree are
  untouched by this change.
- **`/memories` becomes a working direct URL** on the guest subdomain (e.g.
  `mercy-john.invitespot.app/memories`), not just a link reachable from the
  main domain as today. The guest's primary link is still the bare root
  domain (RSVP + invitation details, with Memories as a tab there, unchanged)
  — `/memories` is an additional direct entry point (e.g. for a QR code aimed
  straight at the gallery), not a replacement for the root link.
- **The bare apex `invitespot.app`** gets a minimal placeholder landing page
  now, reserving the routing for a real marketing page later (out of scope
  here, same as SiteForOwners' own pending marketing-site redesign).
- Regular SiteForOwners tenant business sites are completely unaffected by
  this change in the ordinary case (`*.siteforowners.com` tenant subdomains
  keep working exactly as today).

## Architecture

### 1. `classifyHost` gains apex awareness

`src/lib/host-routing.ts`'s `platform` classification currently doesn't say
which base domain matched. It needs to, so the middleware can tell these four
cases apart:

| Apex | Label type | Behavior |
|---|---|---|
| siteforowners.com | tenant | Serve tenant site (unchanged) |
| siteforowners.com | invitation event | **Redirect** to the invitespot.app equivalent (new) |
| invitespot.app | invitation event | Serve invitation site (new; today's siteforowners.com behavior, moved) |
| invitespot.app | tenant | **404** (new guard — invitespot.app never serves a tenant site) |

`HostClassification`'s `platform` variant becomes:

```ts
{ kind: "platform"; label: string; apex: "siteforowners" | "invitespot" | "local" }
```

`apex: "local"` covers `*.localhost` (and `*.vercel.app` preview
deployments, which should be treated the same way) — local/preview
development must keep serving whatever a label resolves to directly, with
**neither** the redirect nor the 404 guard applied. Without this exemption,
local dev of the invitation guest flow would either redirect to a real
production domain (breaking it entirely) or 404 on tenant-site local dev,
depending on the label. `apex: "local"` behaves exactly as `platform` does
today: resolve and serve directly, no cross-domain logic at all.

`invitespot.app` (bare apex, and `www.invitespot.app` — already normalized by
the existing `www.` stripping) gets its own classification, `{ kind:
"invitespot-root" }`, distinct from the existing `root` kind. If it reused
`root`, its apex would silently fall through to the SiteForOwners marketing
homepage via the existing `NextResponse.next()` path, since `root` hosts all
share that one fallthrough today.

### 2. Middleware behavior

In `src/middleware.ts`, the existing "platform" branch (the one that queries
`platform_subdomains`) adds the two new cases from the table above:

- `apex === "siteforowners"` and the reservation is an invitation event:
  build `https://{label}.invitespot.app{pathname}{search}` and return
  `NextResponse.redirect(url, 301)` — no need to query `invitation_events`
  first, since the label alone is enough to build the target URL.
- `apex === "invitespot"` and the reservation is a tenant: return the same
  no-store `/not-found` rewrite already used for a gated/unmatched tenant.

A new top-level branch handles `{ kind: "invitespot-root" }`: rewrite to
`/invitespot` (a new, simple route — see below) and return early, before any
Supabase client is created. The apex landing page needs no tenant/gating
lookups at all.

### 3. `/memories` reachable directly on the subdomain

`invitationRewritePath(slug, pathname)` in `host-routing.ts` currently
rewrites only the bare root (`pathname === "/"`) to `/invite/{slug}`,
returning `null` (→ 404) for everything else. It gains one more case:
`pathname === "/memories"` rewrites to `/invite/{slug}/memories` — that page
already exists (`src/app/invite/[slug]/memories/page.tsx`) and today is only
reachable via the full internal path on the main domain (e.g. from the
owner's dashboard's "View Gallery" link). Every other path continues to
return `null`.

### 4. Link generation moves to invitespot.app

`invitationPublicUrl` in `src/lib/invitations/public-url.ts` changes its
subdomain case from `https://{publicSubdomain}.siteforowners.com/` to
`https://{publicSubdomain}.invitespot.app/` — applies to every event's
generated link, existing and new, since old links still redirect.

Its no-subdomain fallback (`new URL('/invite/{slug}', appUrl)`, for an event
with no reserved subdomain yet) currently defaults `appUrl` to
`process.env.NEXT_PUBLIC_APP_URL`. That env var is shared broadly across the
*non-invitation* SiteForOwners product (bookings, Stripe checkout/portal
URLs, cron reminder emails, tenant site rendering — confirmed via a
repo-wide search) and must not be repointed. `invitationPublicUrl` instead
reads a new, invitation-specific `NEXT_PUBLIC_INVITESPOT_APP_URL` (falling
back to `https://www.invitespot.app` if unset), leaving
`NEXT_PUBLIC_APP_URL` completely untouched.

### 5. Apex landing page

A new minimal route (`src/app/invitespot/page.tsx`, or wherever
`/invitespot` naturally resolves under the App Router) serves a small
placeholder — enough to not 404 or look broken, not a full marketing build.

### 6. Copy/branding touch points

A few places show the domain in host-facing copy and need the string
updated from `siteforowners.com` to `invitespot.app`:
`src/components/invitations/EventEditor.tsx`,
`src/components/invitations/InvitationFooter.tsx`,
`src/components/invitations/FounderEventForm.tsx`, and
`src/app/api/invitations/events/[eventId]/messages/route.ts`.

## Data model impact

None. `platform_subdomains` and `invitation_events.public_subdomain` are
already domain-agnostic (no column names or stores an apex domain) — the
same "mercy-john" row serves both today's siteforowners.com redirect source
and tomorrow's invitespot.app destination. No migration needed.

## Manual steps (Cloudflare + Vercel — outside this codebase)

1. In the existing Vercel project (the one already serving
   siteforowners.com), add `invitespot.app` and the wildcard
   `*.invitespot.app` as domains. Confirm the Vercel plan supports wildcard
   domains before starting — some tiers don't.
2. In the invitespot.app Cloudflare zone, add whatever DNS records Vercel's
   dashboard displays for those two entries (can't be predicted from here —
   follow Vercel's own instructions at the time).
3. Same proxy/SSL consideration as this repo's existing custom-domain
   checklist (CLAUDE.md's "Custom domains" section): Full (strict) once the
   cert is active.
4. Add `NEXT_PUBLIC_INVITESPOT_APP_URL=https://www.invitespot.app` to the
   Vercel project's environment variables.
5. Wait for cert issuance, then smoke-test `mercy-john.invitespot.app`
   (should serve the invitation directly), `mercy-john.siteforowners.com`
   (should redirect to it), and the bare `invitespot.app` apex.

## Testing

`classifyHost` and `invitationRewritePath` are pure functions with existing
unit tests (`src/lib/host-routing.test.ts`) — extended directly:
- `*.invitespot.app` → `{ kind: "platform", label, apex: "invitespot" }`
- `*.siteforowners.com` → same shape with `apex: "siteforowners"`
- `*.localhost` / `*.vercel.app` → `apex: "local"`
- bare `invitespot.app` / `www.invitespot.app` → `{ kind: "invitespot-root" }`
- `invitationRewritePath(slug, "/memories")` → `/invite/{slug}/memories`;
  every other non-root path still → `null`

The actual cross-domain redirect and 404 guard in `middleware.ts` need a
`platform_subdomains` lookup, which (like every other Supabase-dependent
route in this codebase's test suite) has no credentials in this `tsx --test`
harness. Consistent with this codebase's established convention for that
exact limitation, those two branches get structural source-based tests
(asserting the redirect/404 logic and status codes exist in the right
branch, in the right order) rather than a live end-to-end test.

## Out of scope

- The host/owner management dashboard moving to invitespot.app.
- The real invitespot.app marketing/landing page design (placeholder only).
- Any change to guest session cookies (already host-only, no explicit
  `Domain` attribute — confirmed via search — so they need no change to work
  correctly per-subdomain on either apex).
- A symmetric invitespot.app → siteforowners.com redirect for a stray tenant
  label hit (404 is sufficient; no legitimate link should ever point a
  tenant label at invitespot.app).
