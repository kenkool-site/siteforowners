# InviteSpot Domain Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move InviteSpot's guest-facing surface (public invitation page +
Memories) from `*.siteforowners.com` to `*.invitespot.app` subdomains, with a
permanent redirect for existing `*.siteforowners.com` invitation links.

**Architecture:** `classifyHost()` learns to recognize `*.invitespot.app` and
the bare `invitespot.app` apex. `middleware.ts` uses that to redirect an
invitation-event label hit on the old siteforowners.com platform domain to
its invitespot.app equivalent, and to 404 a (should-never-happen) tenant
label hit on invitespot.app. `invitationPublicUrl` starts minting
invitespot.app links for every event. No database migration: the shared
`platform_subdomains` label registry is already domain-agnostic.

**Tech Stack:** Next.js App Router middleware, TypeScript, `node:test` /
`tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-26-invitespot-domain-migration-design.md`

## Global Constraints

- Redirect for an existing siteforowners.com invitation link is a **permanent
  301**, preserving path and query string.
- New env var `NEXT_PUBLIC_INVITESPOT_APP_URL` (default
  `https://www.invitespot.app` when unset) is used **only** by
  `invitationPublicUrl`'s no-subdomain fallback. `NEXT_PUBLIC_APP_URL` is
  shared broadly across the non-invitation SiteForOwners product (bookings,
  Stripe checkout/portal URLs, cron reminder emails, tenant site rendering)
  and must **not** be touched or repointed.
- `invitationCoverPreviewUrl` (also in `src/lib/invitations/public-url.ts`)
  stays exactly as-is — still defaults to `DEFAULT_APP_URL`/
  `NEXT_PUBLIC_APP_URL` (siteforowners.com). It is not part of this
  migration's scope; do not change it.
- The host/owner management dashboard (`/invitations/manage/[eventId]`,
  sign-in, session cookies) is **out of scope** — it stays on
  siteforowners.com. Do not touch it.
- `src/components/invitations/InvitationFooter.tsx` and the email sender
  fallback in `src/app/api/invitations/events/[eventId]/messages/route.ts`
  were considered during design and are explicitly **out of scope** — the
  footer's two links are host-attribution/host-sign-in and correctly stay
  pointed at siteforowners.com; the email sender address is an email-domain
  deliverability concern unrelated to web routing (changing it without a
  verified invitespot.app sending domain would break email deliverability).
  Do not change either file.
- `HostClassification`'s `platform` variant gains a required `apex` field:
  `"siteforowners" | "invitespot" | "local"`. A new `invitespot-root` kind is
  added, distinct from the existing `root` kind.
- **Task order matters here.** Task 1 adds the `invitespot-root` union
  member to `HostClassification`. `middleware.ts` doesn't handle it yet at
  that point, which leaves a genuine TypeScript error there (accessing
  `.label` on a union that now includes a variant without it) until Task 2
  adds the handling. Task 2 must therefore run immediately after Task 1 —
  don't reorder it after the apex page task, or that task's own build
  verification will fail for a reason unrelated to its own changes.
- The Cloudflare DNS records, Vercel domain/wildcard setup, and the
  `NEXT_PUBLIC_INVITESPOT_APP_URL` Vercel env var are **manual steps outside
  this codebase** (see the spec's "Manual steps" section) — no task below
  covers them, and none of this plan's code takes effect in production until
  they're done. Surface this to the user at the end of implementation.

---

### Task 1: `classifyHost` and `invitationRewritePath` become apex-aware

**Files:**
- Modify: `src/lib/host-routing.ts`
- Test: `src/lib/host-routing.test.ts`

**Interfaces:**
- Produces: `HostClassification` — `{ kind: "root" } | { kind: "invitespot-root" } | { kind: "platform"; label: string; apex: "siteforowners" | "invitespot" | "local" } | { kind: "custom"; hostname: string }`. `classifyHost(host: string): HostClassification`. `invitationRewritePath(slug: string, pathname: string): string | null` — now also handles `pathname === "/memories"`.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/lib/host-routing.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { classifyHost, invitationRewritePath } from "./host-routing";

test("host classification recognizes root, preview, platform, local, and custom hosts", () => {
  assert.deepEqual(classifyHost("www.siteforowners.com"), { kind: "root" });
  assert.deepEqual(classifyHost("siteforowners.com"), { kind: "root" });
  assert.deepEqual(classifyHost("feature-abc.vercel.app"), { kind: "root" });
  assert.deepEqual(classifyHost("mercy-john.siteforowners.com"), { kind: "platform", label: "mercy-john", apex: "siteforowners" });
  assert.deepEqual(classifyHost("mercy-john.localhost:3000"), { kind: "platform", label: "mercy-john", apex: "local" });
  assert.deepEqual(classifyHost("events.example.com"), { kind: "custom", hostname: "events.example.com" });
});

test("invitespot.app subdomains classify as platform with apex invitespot", () => {
  assert.deepEqual(classifyHost("mercy-john.invitespot.app"), { kind: "platform", label: "mercy-john", apex: "invitespot" });
});

test("the bare invitespot.app apex (with or without www) classifies distinctly from the shared siteforowners.com root", () => {
  assert.deepEqual(classifyHost("invitespot.app"), { kind: "invitespot-root" });
  assert.deepEqual(classifyHost("www.invitespot.app"), { kind: "invitespot-root" });
});

test("invitation hosts expose the root public entry point and the memories page", () => {
  assert.equal(invitationRewritePath("mercy-john-lx9cwn", "/"), "/invite/mercy-john-lx9cwn");
  assert.equal(invitationRewritePath("mercy/john", "/"), "/invite/mercy%2Fjohn");
  assert.equal(invitationRewritePath("mercy-john", "/memories"), "/invite/mercy-john/memories");
  assert.equal(invitationRewritePath("mercy/john", "/memories"), "/invite/mercy%2Fjohn/memories");
  assert.equal(invitationRewritePath("mercy-john", "/details"), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/host-routing.test.ts`
Expected: FAIL — `classifyHost`/`invitationRewritePath` don't yet return the new shapes (deepEqual mismatches on missing `apex`; the two new tests throw/fail; the `/memories` case returns `null` instead of the rewritten path).

- [ ] **Step 3: Replace `src/lib/host-routing.ts` with the apex-aware implementation**

```ts
export type HostClassification =
  | { kind: "root" }
  | { kind: "invitespot-root" }
  | { kind: "platform"; label: string; apex: "siteforowners" | "invitespot" | "local" }
  | { kind: "custom"; hostname: string };

export function classifyHost(host: string): HostClassification {
  const hostname = host.split(":")[0].toLowerCase().replace(/^www\./, "");
  if (
    hostname === "siteforowners.com"
    || hostname === "localhost"
    || hostname.endsWith(".vercel.app")
  ) return { kind: "root" };

  if (hostname === "invitespot.app") return { kind: "invitespot-root" };

  if (hostname.endsWith(".siteforowners.com")) {
    return { kind: "platform", label: hostname.slice(0, -".siteforowners.com".length).split(".")[0], apex: "siteforowners" };
  }
  if (hostname.endsWith(".invitespot.app")) {
    return { kind: "platform", label: hostname.slice(0, -".invitespot.app".length).split(".")[0], apex: "invitespot" };
  }
  if (hostname.endsWith(".localhost")) {
    return { kind: "platform", label: hostname.slice(0, -".localhost".length).split(".")[0], apex: "local" };
  }
  return { kind: "custom", hostname };
}

export function invitationRewritePath(slug: string, pathname: string): string | null {
  if (pathname === "/") return `/invite/${encodeURIComponent(slug)}`;
  if (pathname === "/memories") return `/invite/${encodeURIComponent(slug)}/memories`;
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/host-routing.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: **an error in `src/middleware.ts`** — adding the `invitespot-root`
union member means `host.label` (used inside the existing `else` branch that
previously narrowed to just the `platform` case) is no longer valid on every
remaining constituent of the union. This is expected at this point in the
plan and is resolved by Task 2, next — do not fix `middleware.ts` in this
task.

- [ ] **Step 6: Commit**

```bash
git add src/lib/host-routing.ts src/lib/host-routing.test.ts
git commit -m "feat: make classifyHost apex-aware for the invitespot.app migration"
```

---

### Task 2: Middleware redirects and guards across the two domains

**Files:**
- Modify: `src/middleware.ts`
- Test: `src/middleware.test.ts`

**Interfaces:**
- Consumes: `classifyHost`, `HostClassification` (`apex` field, `invitespot-root` kind) from Task 1.
- Produces: no new exports — this changes the behavior of the already-exported `middleware` function. Rewrites the bare invitespot.app apex to `/invitespot`, a route Task 3 (next) creates — this task's own tests only check that the rewrite is wired up, and don't require that route to physically exist yet (Next.js doesn't validate rewrite targets at compile time, only at request time).

- [ ] **Step 1: Write the failing tests**

Add these tests to the end of `src/middleware.test.ts` (keep the two
existing tests in that file as-is):

```ts
import { readFileSync } from "node:fs";

// The reservation lookup these branches depend on needs Supabase, which has
// no credentials in this tsx --test environment (same limitation as every
// other Supabase-dependent route tested in this codebase) — so, matching
// that established convention, these are structural source-based tests
// rather than live invocations.

test("middleware redirects a siteforowners.com invitation-event host to its invitespot.app equivalent with a permanent 301, before any invitation_events lookup", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /if \(host\.apex === "siteforowners"\)/);
  assert.match(source, /`https:\/\/\$\{host\.label\}\.invitespot\.app`/);
  assert.match(source, /NextResponse\.redirect\(redirectUrl, 301\)/);
  const redirectIndex = source.indexOf('if (host.apex === "siteforowners")');
  const eventLookupIndex = source.indexOf('.from("invitation_events")');
  assert.ok(redirectIndex > -1 && eventLookupIndex > -1 && redirectIndex < eventLookupIndex);
});

test("middleware preserves the request's query string on the invitespot.app redirect", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /redirectUrl\.search = request\.nextUrl\.search/);
});

test("middleware returns a not-found, no-store response for a tenant label requested under invitespot.app, without querying the tenants table for it", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /if \(host\.apex === "invitespot"\)/);
  const guardIndex = source.indexOf('if (host.apex === "invitespot")');
  const tenantLookupIndex = source.indexOf('.eq("id", reservation.tenant_id)');
  assert.ok(guardIndex > -1 && tenantLookupIndex > -1 && guardIndex < tenantLookupIndex);
});

test("middleware rewrites the invitespot.app apex to its dedicated route, before any Supabase client is created", () => {
  const source = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(source, /host\.kind === "invitespot-root"/);
  assert.match(source, /NextResponse\.rewrite\(new URL\("\/invitespot", request\.url\)\)/);
  const invitespotRootIndex = source.indexOf('host.kind === "invitespot-root"');
  const supabaseClientIndex = source.indexOf("createClient(supabaseUrl, supabaseKey)");
  assert.ok(invitespotRootIndex > -1 && supabaseClientIndex > -1 && invitespotRootIndex < supabaseClientIndex);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/middleware.test.ts`
Expected: FAIL — none of the new source patterns exist yet in `middleware.ts`.

- [ ] **Step 3: Modify `src/middleware.ts`**

Find this block (right after computing `host`):

```ts
  const host = classifyHost(hostname);
  if (host.kind === "root") return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
```

Replace it with:

```ts
  const host = classifyHost(hostname);
  if (host.kind === "root") return NextResponse.next();

  if (host.kind === "invitespot-root") {
    return NextResponse.rewrite(new URL("/invitespot", request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
```

Then find this block (the invitation-event branch inside the `platform_subdomains` lookup):

```ts
    if (reservation?.invitation_event_id) {
      const eventResult = await supabase
        .from("invitation_events")
        .select("slug")
        .eq("id", reservation.invitation_event_id)
        .maybeSingle();
```

Replace it with:

```ts
    if (reservation?.invitation_event_id) {
      // Invitation events are moving to invitespot.app going forward — a
      // request for one on the old siteforowners.com platform domain
      // permanently redirects to its invitespot.app equivalent (path and
      // query preserved) instead of being served here. Only invitespot.app
      // itself (and local dev) serve invitation content directly. The
      // label alone is enough to build the redirect target, so this skips
      // the invitation_events lookup entirely for this case.
      if (host.apex === "siteforowners") {
        const redirectUrl = new URL(pathname, `https://${host.label}.invitespot.app`);
        redirectUrl.search = request.nextUrl.search;
        return NextResponse.redirect(redirectUrl, 301);
      }

      const eventResult = await supabase
        .from("invitation_events")
        .select("slug")
        .eq("id", reservation.invitation_event_id)
        .maybeSingle();
```

Then find this block (the tenant branch, right after it):

```ts
    if (reservation?.tenant_id) {
      const tenantResult = await supabase
        .from("tenants")
        .select("preview_slug, site_published, subscription_status")
        .eq("id", reservation.tenant_id)
        .maybeSingle();
      tenant = tenantResult.error ? null : tenantResult.data;
    }
```

Replace it with:

```ts
    if (reservation?.tenant_id) {
      // invitespot.app only ever serves invitation events, never a
      // SiteForOwners tenant business site — without this guard, a tenant
      // label requested under invitespot.app would render that tenant's
      // site under the wrong brand.
      if (host.apex === "invitespot") {
        const unavailable = NextResponse.rewrite(new URL("/not-found", request.url));
        unavailable.headers.set("Cache-Control", "no-store, must-revalidate");
        return unavailable;
      }

      const tenantResult = await supabase
        .from("tenants")
        .select("preview_slug, site_published, subscription_status")
        .eq("id", reservation.tenant_id)
        .maybeSingle();
      tenant = tenantResult.error ? null : tenantResult.data;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/middleware.test.ts`
Expected: PASS (6 tests: the 2 pre-existing plus the 4 new ones)

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors (this resolves the type error Task 1 flagged as expected
at that point). The build's route summary will not yet include `/invitespot`
as a real page — that's fine, it's created next in Task 3; the rewrite
target just won't resolve to real content in a manual smoke-test until then.

- [ ] **Step 6: Commit**

```bash
git add src/middleware.ts src/middleware.test.ts
git commit -m "feat: redirect siteforowners.com invitation hosts to invitespot.app, guard tenant labels on invitespot.app"
```

---

### Task 3: invitespot.app apex placeholder page

**Files:**
- Create: `src/app/invitespot/page.tsx`
- Test: `src/app/invitespot/page.render.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (Task 2's middleware already rewrites
  the bare invitespot.app apex to `/invitespot` — this task supplies the
  page that route needs to actually render something).
- Produces: a default-exported `InviteSpotLandingPage` React component at
  `src/app/invitespot/page.tsx`, reachable at the Next.js route `/invitespot`.

- [ ] **Step 1: Write the failing test**

Create `src/app/invitespot/page.render.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import InviteSpotLandingPage from "./page";

Object.assign(globalThis, { React });

test("the invitespot.app apex placeholder renders standalone, with no props and no data dependencies", () => {
  const html = renderToStaticMarkup(<InviteSpotLandingPage />);
  assert.match(html, /InviteSpot/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/app/invitespot/page.render.test.tsx`
Expected: FAIL with a module-not-found error (`./page` doesn't exist yet).

- [ ] **Step 3: Create `src/app/invitespot/page.tsx`**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InviteSpot",
  description: "Digital invitations and shared photos for your event.",
};

export default function InviteSpotLandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-semibold">InviteSpot</h1>
      <p className="max-w-md text-base text-gray-600">
        Digital invitations and shared photos for your event — full site coming soon.
      </p>
    </main>
  );
}
```

This is deliberately minimal — a real marketing page is out of scope (see
the spec). It needs no data fetching and inherits only the root layout's
fonts/HTML scaffold (`src/app/layout.tsx`, which is font/metadata-only —
verified it renders no shared nav/footer that would need overriding here).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/app/invitespot/page.render.test.tsx`
Expected: PASS

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds, with a new static route `○ /invitespot` in the route
summary.

- [ ] **Step 6: Commit**

```bash
git add src/app/invitespot/page.tsx src/app/invitespot/page.render.test.tsx
git commit -m "feat: add invitespot.app apex placeholder page"
```

---

### Task 4: Invitation public links move to invitespot.app

**Files:**
- Modify: `src/lib/invitations/public-url.ts`
- Test: `src/lib/invitations/public-url.test.ts`
- Test (ripple): `src/components/invitations/EventEditor.render.test.tsx:124`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `invitationPublicUrl` (same signature, same two call sites in
  `EventEditor.tsx` — unchanged) now returns an `invitespot.app` URL for the
  subdomain case, and defaults its no-subdomain fallback to
  `NEXT_PUBLIC_INVITESPOT_APP_URL`/`https://www.invitespot.app`.
  `invitationCoverPreviewUrl` is unchanged (see Global Constraints).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/lib/invitations/public-url.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { invitationCoverPreviewUrl, invitationPublicUrl } from "./public-url";

test("invitation public URL prefers an assigned clean subdomain, on invitespot.app", () => {
  assert.equal(
    invitationPublicUrl({ slug: "mercy-john-lx9cwn", publicSubdomain: "mercy-john" }),
    "https://mercy-john.invitespot.app/",
  );
});

test("invitation public URL keeps the stable legacy route without a subdomain, against whatever appUrl is passed", () => {
  assert.equal(
    invitationPublicUrl(
      { slug: "mercy-john-lx9cwn", publicSubdomain: null },
      "https://www.invitespot.app",
    ),
    "https://www.invitespot.app/invite/mercy-john-lx9cwn",
  );
});

test("invitation public URL without a subdomain defaults to invitespot.app, not the shared siteforowners.com app URL", () => {
  const original = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
  delete process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
  try {
    assert.equal(
      invitationPublicUrl({ slug: "mercy-john-lx9cwn", publicSubdomain: null }),
      "https://www.invitespot.app/invite/mercy-john-lx9cwn",
    );
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_INVITESPOT_APP_URL;
    else process.env.NEXT_PUBLIC_INVITESPOT_APP_URL = original;
  }
});

test("cover previews stay on the shared siteforowners.com app URL, unaffected by the invitespot.app migration", () => {
  assert.equal(
    invitationCoverPreviewUrl({ slug: "mercy-john" }),
    "https://www.siteforowners.com/api/invitations/public/mercy-john/cover",
  );
});
```

In `src/components/invitations/EventEditor.render.test.tsx`, find:

```ts
  assert.match(render("owner", undefined, { publicSubdomain: "ana-luis" }), /https:\/\/ana-luis\.siteforowners\.com\//);
```

Replace it with:

```ts
  assert.match(render("owner", undefined, { publicSubdomain: "ana-luis" }), /https:\/\/ana-luis\.invitespot\.app\//);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/invitations/public-url.test.ts src/components/invitations/EventEditor.render.test.tsx`
Expected: FAIL — `public-url.test.ts`'s new expectations don't match the
current siteforowners.com-returning implementation; the `EventEditor` test
now expects `invitespot.app` but the underlying function still returns
`siteforowners.com`.

- [ ] **Step 3: Modify `src/lib/invitations/public-url.ts`**

Replace the full file contents with:

```ts
export type InvitationPublicUrlInput = {
  slug: string;
  publicSubdomain?: string | null;
};

const DEFAULT_APP_URL = "https://www.siteforowners.com";
// Deliberately separate from DEFAULT_APP_URL/NEXT_PUBLIC_APP_URL: that env
// var is shared broadly across the non-invitation SiteForOwners product
// (bookings, Stripe checkout/portal URLs, cron reminder emails, tenant site
// rendering) and must not be repointed at invitespot.app.
const DEFAULT_INVITESPOT_APP_URL = "https://www.invitespot.app";

export function invitationPublicUrl(
  invitation: InvitationPublicUrlInput,
  appUrl = process.env.NEXT_PUBLIC_INVITESPOT_APP_URL || DEFAULT_INVITESPOT_APP_URL,
): string {
  if (invitation.publicSubdomain) {
    return `https://${invitation.publicSubdomain}.invitespot.app/`;
  }
  return new URL(`/invite/${encodeURIComponent(invitation.slug)}`, appUrl).toString();
}

export function invitationCoverPreviewUrl(
  invitation: Pick<InvitationPublicUrlInput, "slug">,
  appUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
): string {
  return new URL(`/api/invitations/public/${encodeURIComponent(invitation.slug)}/cover`, appUrl).toString();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/public-url.test.ts src/components/invitations/EventEditor.render.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/public-url.ts src/lib/invitations/public-url.test.ts src/components/invitations/EventEditor.render.test.tsx
git commit -m "feat: mint invitation public links on invitespot.app"
```

---

### Task 5: Subdomain-picker UI copy shows invitespot.app

**Files:**
- Modify: `src/components/invitations/FounderEventForm.tsx:195`
- Modify: `src/components/invitations/FounderEventForm.render.test.tsx:12`
- Modify: `src/components/invitations/EventEditor.tsx:809`
- Test (new): `src/components/invitations/EventEditor.render.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (purely literal UI text — independent of Task 4's `invitationPublicUrl` change, which affects a different part of `EventEditor.tsx`, the owner's rendered share-link text, not this input-suffix label).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/components/invitations/FounderEventForm.render.test.tsx`, find:

```ts
  assert.match(html, /\.siteforowners\.com/);
```

Replace it with:

```ts
  assert.match(html, /\.invitespot\.app/);
```

In `src/components/invitations/EventEditor.render.test.tsx`, add this new
test (anywhere among the other `test(...)` calls in the file):

```ts
test("founders see the public subdomain input suffixed with invitespot.app, matching where invitation events now live", () => {
  assert.match(render("founder"), /\.invitespot\.app</);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/components/invitations/FounderEventForm.render.test.tsx src/components/invitations/EventEditor.render.test.tsx`
Expected: FAIL — `FounderEventForm.render.test.tsx` now expects
`.invitespot.app` but the component still renders `.siteforowners.com`; the
new `EventEditor` test can't find `.invitespot.app` in the founder's render
output.

- [ ] **Step 3: Update the two component files**

In `src/components/invitations/FounderEventForm.tsx`, find:

```tsx
              <span className="pr-3 text-sm text-gray-500">.siteforowners.com</span>
```

Replace it with:

```tsx
              <span className="pr-3 text-sm text-gray-500">.invitespot.app</span>
```

In `src/components/invitations/EventEditor.tsx`, find:

```tsx
                    <span className="pr-3 text-sm font-normal text-[#675d6a]">.siteforowners.com</span>
```

Replace it with:

```tsx
                    <span className="pr-3 text-sm font-normal text-[#675d6a]">.invitespot.app</span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/components/invitations/FounderEventForm.render.test.tsx src/components/invitations/EventEditor.render.test.tsx`
Expected: PASS

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

Then run the complete set of files this plan touched, to confirm nothing
elsewhere regressed:

```bash
npx tsx --test \
  src/lib/host-routing.test.ts \
  src/middleware.test.ts \
  src/app/invitespot/page.render.test.tsx \
  src/lib/invitations/public-url.test.ts \
  src/components/invitations/EventEditor.render.test.tsx \
  src/components/invitations/FounderEventForm.render.test.tsx
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/invitations/FounderEventForm.tsx src/components/invitations/FounderEventForm.render.test.tsx src/components/invitations/EventEditor.tsx src/components/invitations/EventEditor.render.test.tsx
git commit -m "feat: show invitespot.app as the subdomain suffix in host-facing forms"
```

---

## After implementation

This plan only produces code — none of it takes effect in production until
the manual Cloudflare/Vercel steps in the spec's "Manual steps" section are
done (adding `invitespot.app` + `*.invitespot.app` as Vercel domains,
matching DNS records in the invitespot.app Cloudflare zone, and setting
`NEXT_PUBLIC_INVITESPOT_APP_URL` in Vercel). Surface this clearly once all
tasks are complete — it is not something any task or subagent can do.
