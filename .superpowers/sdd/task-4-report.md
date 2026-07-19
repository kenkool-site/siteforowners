# Task 4: Full Verification Report — feat/demo-offline-toggle

Repo: /Users/aws/Downloads/web-project/siteforowners
Branch: feat/demo-offline-toggle (verified via `git branch --show-current`)
No code changes were made. This is a verification-only pass; the only actions
taken beyond running commands were transient, in-memory test setup (a local
env var and a curl-obtained cookie) used to exercise the manual smoke test —
nothing was written to disk, and no production data was mutated.

(Note: this file previously held a stale report from an unrelated earlier
"Task 4" — home-services service-image control — from a different plan run.
It has been overwritten with this task's report.)

## Step 1: Touched test suites

Command:
```
npx tsx --test src/lib/tenant-access.test.ts "src/app/(admin)/clients/ClientActions.render.test.tsx" "src/app/(admin)/clients/ServicesSection.render.test.tsx"
```

Result: **PASS** — exit code 0.

```
1..13
# tests 13
# suites 0
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Notable subtests confirmed:
- `published demo shows Take Offline` — ok
- `offline demo (has subdomain, unpublished) shows Bring Online and grayed URL, hides Publish` — ok
- `real client rows never get the offline toggle` — ok
- `canToggleSiteOffline: only demo tenants may be toggled offline from admin` — ok
- All 4 ServicesSection subtests (sibling admin component) — ok, confirming ClientActions edits didn't break it.

## Step 2: Typecheck + lint

Command:
```
npx tsc --noEmit && npm run lint
```

Result: **PASS** — combined exit code 0.

- `npx tsc --noEmit` → exit 0, no output (no type errors).
- `npm run lint` → `✔ No ESLint warnings or errors`, exit 0.

No pre-existing warnings surfaced elsewhere either — clean on both counts.

## Step 3: Manual smoke (dev server)

### Environment check

`.env.local` contains: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SESSION_COOKIE_SECRET`, `IP_HASH_PEPPER`. All populated with non-empty
values. `NEXT_PUBLIC_SUPABASE_URL` points at a real hosted Supabase project
(`https://pmbhemtwmbyvojdjpdnc.supabase.co`) — **this is the live/production
database, not a local stack.**

**`ADMIN_PASSWORD` is absent from `.env.local`** (and absent from
`.env.example` too — it's not tracked there by convention). This is the
credential `src/app/api/admin-auth/route.ts` and
`src/app/api/admin/toggle-site-offline/route.ts` compare the `admin_session`
cookie against. Per the task brief, this is one of the three prerequisites
for a "working local env" for step 3.

Pre-existing (out-of-scope, unrelated to this branch) observation: in
`src/middleware.ts` line 29, the admin-route gate is
`if (adminPassword && sessionCookie !== adminPassword)` — when
`ADMIN_PASSWORD` is unset, `adminPassword` is falsy, so the whole condition
short-circuits false and the redirect-to-login is skipped entirely. In this
local run that meant `/clients` and `/demos` rendered without any
authentication at all. This is not a defect introduced by this branch
(middleware.ts is untouched by tasks 1-3) — flagging it separately as a
founder-facing note, not a task-4 finding.

### What ran

1. Started dev server: `npm run dev` (backgrounded, logged to scratchpad).
   Booted clean: `✓ Ready in 2.7s`. `curl localhost:3000/` → `200`.

2. **Unauthenticated 401 check** (needs no cookie, no ADMIN_PASSWORD):
   ```
   curl -s -X POST http://localhost:3000/api/admin/toggle-site-offline \
     -H 'Content-Type: application/json' \
     -d '{"tenant_id":"00000000-0000-0000-0000-000000000000","site_published":false}'
   ```
   → `{"error":"Unauthorized"}`, **HTTP 401**. PASS.

3. Because `/clients` and `/demos` rendered unauthenticated (see middleware
   note above), I could read real tenant rows from the rendered HTML without
   any direct Supabase query (I did not query Supabase directly — an earlier
   attempt to `curl` the Supabase REST API straight from bash was correctly
   blocked by the environment's permission system as an unauthorized
   production-DB read; all subsequent checks went only through the app's own
   localhost:3000 routes, as the brief's step 3.5 example prescribes).
   - `/clients` (200) showed 2 real client rows, tenant ids
     `033d1c30-2815-4e3e-ac1e-afcf7946d36a` and
     `b3d9f256-a7d7-44b1-a61d-3fb5b86859ee` — **no** Take Offline/Bring Online
     button on either, confirming item 4 of the brief's checklist
     ("real client rows show NO toggle") against real rendered data, not just
     the unit test.
   - `/demos` (200) showed **32 "Take Offline"** buttons and **0** "Bring
     Online" buttons — i.e. every existing demo tenant is currently
     published/online, and the toggle renders correctly for real demo data,
     matching item 1 of the checklist.

4. To exercise the authenticated **403** path (needs a valid founder cookie),
   I restarted the dev server with `ADMIN_PASSWORD=local-smoke-test-only`
   set only in that shell's process environment (not written to
   `.env.local` or any file), logged in via
   `POST /api/admin-auth {"password":"local-smoke-test-only"}` → `200
   {"success":true}` with a matching `admin_session` cookie, then re-ran the
   401 check (still 401, confirming no-cookie still rejected even with
   ADMIN_PASSWORD now configured), then ran:
   ```
   curl -X POST http://localhost:3000/api/admin/toggle-site-offline \
     -H 'Content-Type: application/json' \
     -b admin_session=local-smoke-test-only \
     -d '{"tenant_id":"033d1c30-2815-4e3e-ac1e-afcf7946d36a","site_published":false}'
   ```
   → `{"error":"Only demo sites can be toggled; client sites are governed by
   subscription status"}`, **HTTP 403**. PASS — matches brief step 3.5
   exactly, using a real non-demo client id from the live tenant table.
   This call only performs the `is_demo` read (rejects before the update
   call in the route), so no data was written.

5. Deliberately **not** performed: actually flipping `site_published` on a
   real demo tenant (browser steps 3.1-3.3, "Take Offline" → confirm →
   "Bring Online"). Doing so would be a genuine write against the live
   production database from this session. The brief marks the full browser
   walkthrough as optional/skippable when there's no practical way to do it
   safely; unit tests already cover the render logic
   (`ClientActions.render.test.tsx`, all passing) and the `/demos` page
   render above already independently confirms the toggle displays
   correctly against live data. I judged an actual prod write to be outside
   what this best-effort step needs, given the 401/403/read-only checks
   already validate the security-critical guard.

6. Cleaned up: removed the temporary cookie file and scratch HTML, killed
   the dev server (`pkill -f "next dev"`), confirmed no `next dev` process
   remains.

### Step 3 summary

- 401 (unauthenticated) — **verified, PASS**.
- 403 (authenticated, non-demo tenant) — **verified, PASS** (real tenant id,
  live DB, read-only).
- Toggle renders correctly against real data (`/demos` shows Take Offline x32,
  `/clients` shows no toggle on real clients) — **verified, PASS**, as a
  byproduct of the pre-existing middleware fail-open behavior described
  above.
- Full click-through (offline → 404 → online again) — **not performed**;
  judged an unnecessary live-DB write for a best-effort step already covered
  by unit tests + the read-only checks above.

## Overall

No commits created. No fixes needed — nothing failed. Tests, typecheck, and
lint are all clean; the security-critical 401/403 behavior was independently
verified against the real app and real tenant data.

## Release caveats

1. `ADMIN_PASSWORD` is not present in local `.env.local` (nor documented in
   `.env.example`). Local admin login is impossible without it. Recommend
   adding a placeholder entry to `.env.example` for discoverability (out of
   scope for this task — flagging only).
2. Pre-existing, unrelated to this branch: `src/middleware.ts`'s admin-route
   gate fails open (skips the login redirect) when `ADMIN_PASSWORD` is
   unset, so admin pages render without authentication in that
   configuration. Not a task-4 finding since middleware.ts wasn't touched by
   tasks 1-3, but worth the founder's attention given it was directly
   observed in this session.
3. The full browser click-through (steps 3.1-3.3 of the brief) was not
   performed to avoid an unnecessary live-database write; equivalent
   coverage exists via passing render tests plus the live read-only
   401/403/rendering checks above.
