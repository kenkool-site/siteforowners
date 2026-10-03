# Guest Invitation Page CDN Caching Design

**Goal:** Make `/invite/[slug]` and `/invite/[slug]/memories` — the guest-facing
RSVP and photo pages, the most-repeat-visited pages in the product — servable
from Vercel's edge CDN instead of rendering fresh on every single request,
without changing guest-visible behavior (same passcode flow, near-instant
RSVP/comment visibility) and without introducing the media-expiry or
access-control bugs a naive cache would cause.

## Context

Both pages currently set `export const dynamic = "force-dynamic"`. Three
things force that today, independently of the explicit flag:

1. **Passcode access** is checked via `cookies()` inside the page component
   (`verifyInvitationPasscodeSession`, reading a signed session cookie). Any
   Server Component that calls `cookies()` is unconditionally opted into
   per-request dynamic rendering by Next.js — this is a platform rule, not a
   setting.
2. **A legacy-domain redirect** reads `headers().get("host")` to bounce old
   `siteforowners.com` links for events with a reserved subdomain to their
   `invitespot.app` equivalent. Same dynamic-forcing effect as `cookies()`.
3. **Signed media URLs**: the main page's `loadMedia` dependency
   (`getInvitationMediaForManagement`) signs Supabase Storage URLs for the
   cover photo, gallery, and video, embedding them directly in the rendered
   HTML. These signatures expire in **15 minutes**
   (`INVITATION_MEDIA_SIGNED_URL_SECONDS` in `src/lib/invitations/media.ts`).
   If this HTML were cached, a guest who loads the page and lingers (or
   returns to an already-open tab) past that window sees broken images —
   actual breakage, not staleness.

This mirrors (and is a harder version of) the on-demand ISR work already
shipped for `/site/[slug]` (see [[project_site_isr_caching]]): that change
only had to deal with a `revalidate = 0` setting and no per-visitor state.
This one has to actually remove per-visitor dynamic-API dependencies before
caching becomes possible at all.

**This plan was explicitly requested over the alternative of just leaving the
pages dynamic** — the guest invitation pages, not the tenant marketing sites,
were the original "make client-facing pages load fast" ask.

## Decisions

- **Passcode verification moves to middleware**, the same place
  subscription-status and admin-session gating already live in this
  codebase. `verifyInvitationPasscodeSession`/`signInvitationPasscodeSession`
  are rewritten from `node:crypto`'s `createHmac`/`timingSafeEqual` to the
  Web Crypto API (`crypto.subtle`), since `node:crypto` is not available in
  the Edge Runtime middleware runs on in this Next.js version (14.2.35
  predates Node-runtime middleware, stabilized in 15.x). Same HMAC-SHA256
  construction and secret — a signature produced by the old implementation
  must still verify under the new one and vice versa, so guests with an
  already-valid passcode cookie at deploy time aren't silently locked out.
- **Middleware becomes the sole enforcement point for passcode access.**
  Once the page stops reading `cookies()`, it cannot re-check passcode
  access itself as a safety net — reading cookies, headers, *or*
  searchParams anywhere in the page forces it back to dynamic, which defeats
  the point. This matches the existing `/site/[slug]` precedent (middleware
  is already the sole enforcement point for subscription-status gating
  there), not a new pattern for this codebase, but it does raise the stakes
  on middleware correctness for this specific check.
- **A locked/passcode-prompt state becomes a middleware *rewrite*** (not a
  redirect) to a new internal route (e.g. `/invite/[slug]/locked`) rendering
  the existing `PasscodeGate` UI, preserving the visible URL exactly as
  today (a guest without access still sees `/invite/{slug}` in their address
  bar, just as now, where the passcode prompt renders inline). The `?next=`
  deep-link preservation (e.g. a passcode-gated `/memories?photo=...` link)
  carries over via the rewrite's query string, matching today's behavior.
- **Media signing moves client-side.** A new route,
  `GET /api/invitations/public/[slug]/media`, re-checks the invitation's
  lifecycle state (same gate `resolvePublicInvitationPage` already applies)
  and returns freshly-signed URLs on demand. It needs no passcode check of
  its own — by the time a guest's browser can call it, middleware has
  already gated the page that loads it. `PublicInvitation.tsx` fetches media
  on mount instead of receiving it as a server-passed prop, with a brief
  loading state for the cover/gallery/video while that first fetch resolves.
  This fully removes the 15-minute-expiry risk, since signing now happens at
  actual view time regardless of how old the cached page is.
- **Both pages switch to `revalidate = 3600`** (a safety-net ceiling, not the
  primary freshness mechanism — same reasoning as `/site/[slug]`).
- **On-demand invalidation, not staleness, is the real freshness
  mechanism** — explicitly requested: RSVP and comment-wall updates must
  show up for other guests near-instantly, not within the hour. A shared
  `revalidateInvitationPage(slug)` helper (mirroring
  `revalidateTenantSite`) calls `revalidatePath` on both routes, called from:
  - `POST /api/invitations/rsvp`
  - `POST /api/invitations/public/[slug]/comments`
  - any host-side edit that changes what the guest page renders (event
    details, cover photo, design theme, cohost info, lifecycle/status
    changes) — the exact list of the ~10 host-facing routes under
    `/api/invitations/events/[eventId]/*` that need this call is an
    implementation-plan-level task, not resolved here, the same way the
    tenant-site plan enumerated write-paths file by file rather than
    guessing from a broad grep.
- **`not_found`/`unavailable` (draft)/`ended` (expired) states stay exactly
  where they are**, rendered inline by the page from `resolvePublicInvitationPage`'s
  resolution — these depend only on invitation data (status/dates), not on
  any per-visitor signal, so caching them is correct: every visitor to a
  draft or expired event's URL should see the identical "not available"
  content.
- **`/invite/[slug]/memories` gets the identical treatment** (passcode via
  middleware, `revalidate = 3600`, same `revalidateInvitationPage` calls) —
  it has the exact same `cookies()`/`headers()` dependencies today. Whether
  `GuestMemoriesApp` itself has any additional server-signed media handed to
  it directly (beyond what it already fetches client-side for the gallery)
  needs a direct check during implementation.

## Testing

- **Cross-compatibility of the Web Crypto rewrite is the single
  highest-risk test to get right**: a signature produced by the current
  `node:crypto`-based `signInvitationPasscodeSession` must verify as valid
  under the new Web Crypto `verifyInvitationPasscodeSession`, and vice
  versa. Written and run before anything else in the implementation.
- Middleware passcode-gating behavior: a request with no passcode set passes
  through; one with a passcode set and no/invalid cookie gets rewritten to
  the locked state (URL unchanged); one with a valid cookie passes through
  — each exercised with a real `NextRequest`/`middleware()` call, matching
  this codebase's existing behavioral-test convention for middleware (not
  the structural source-regex convention used for Supabase-dependent
  branches elsewhere in the same file).
- The new media-signing route: returns signed URLs for a published event,
  404s/empty for an unavailable one, matching `resolvePublicInvitationPage`'s
  own state gate.
- `revalidateInvitationPage` wiring: same scoped-finding approach as the
  tenant-site work — check each candidate write path against what the page
  actually renders before wiring it in, rather than wiring every route that
  merely touches the `invitation_events`/`invitation_responses` tables.
- Full existing suite + a production build (this codebase's `route.ts`
  export-shape constraint and the Edge Runtime's own stricter module
  resolution make a real `npm run build` necessary, not just `tsc --noEmit`
  — doubly so here, since an accidental `node:crypto` import reaching
  middleware's bundle would only surface at build/bundle time, not in
  `tsc`).

## Out of scope

- Any change to the passcode UX itself (the prompt's copy, design, or
  session duration) — this is a pure relocation of an existing check, not a
  redesign.
- `/invitespot` (the invitespot.app marketing/lead-capture landing page) —
  a separate, already-discussed page with a different caching story
  (query-string-driven, not cookie-driven), not addressed here.
- Optimizing the dynamic render path itself (query parallelization, etc.) —
  superseded by actually caching the page; not needed if this ships.
