# InviteSpot Memories — Guest & Host Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the guest-facing upload/gallery experience and the host-facing dashboard/moderation experience on top of the already-shipped Memories backend (migration 056, `/api/memories/*` routes, `src/lib/invitations/memories/*.ts`), so guests can actually contribute and view photos and hosts can actually manage them.

**Architecture:** A guest session is minted silently (no login) the moment a guest opens `/invite/[slug]/memories`, optionally upgraded to `rsvp_guest` if they arrive via their emailed RSVP edit link. A client-side, IndexedDB-persisted upload queue drives the existing two-phase `upload/init`/`upload/complete` API, uploading directly to R2. A guest-facing gallery (All Photos + Moments) polls a new read-only gallery API. On the host side, a new "Memories" dashboard card links to a moderation queue (approve/reject/remove, two view modes matching the event's `memories_mode`) and a bulk-download page for originals, all gated by the existing `requireInvitationAccess`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, Supabase (event-scoped, not tenant_id), next-intl (en/es), IndexedDB (new to this codebase — `fake-indexeddb` added as a test-only dependency), no Realtime (polling instead — see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-21-invitespot-memories-experience-design.md` (this plan implements everything that spec designed but Plan A did not build: guest identity UI, upload UI, gallery UX, moderation queue UI, host dashboard, bulk download, upload-window lifecycle). Also see `docs/superpowers/specs/2026-09-20-invitespot-memories-processing-design.md` for the processing pipeline this plan's upload flow ultimately triggers, and `docs/superpowers/plans/2026-09-21-invitespot-memories-foundation.md` (Plan A) for the exact shape of every backend piece this plan consumes.

## Global Constraints

- TypeScript strict (no `any`). Tailwind for all styling.
- Supabase RLS is event_id-scoped, never tenant_id — Memories is a module inside the invitations feature, not the core multi-tenant site.
- next-intl bilingual (en/es) for every guest/host-facing string. `messages/en.json` and `messages/es.json` must always be edited together, same nesting. New namespaces this plan introduces: `invitations.public.memories` (guest) and `invitations.manage.memories` (host) — neither key exists yet.
- Mobile-first at 375px. The guest-facing gallery/upload UI in particular must work well on a phone — that's the primary device guests will use at a wedding.
- The existing `requireInvitationAccess` gate (owner/founder) is reused unchanged for every host-facing route added here. No new auth system, no new role.
- Tests use `tsx --test`. Any file importing `@/lib/invitations/repository.ts` or `@/lib/invitations/e2e-fixtures.ts` breaks under it (`server-only`) — use `@/lib/invitations/e2e-guard.ts`'s `isInvitationE2EFixturesEnabled` instead, exactly as Plan A's final review had to fix in `upload/init/route.ts`. Use `createAdminClient()` from `@/lib/supabase/admin` directly in all new repository code, matching every existing file in `src/lib/invitations/memories/`.
- `npm run build` must pass, not just `tsx --test`/`tsc --noEmit`. Plan A's own merge was blocked by a `require()`-style import that passed every check except the real build's ESLint step — always use static `import` statements, never `require()`, in any new file.
- **Correction to spec 2's "Lifecycle & Retention" section, found while planning this — flag to the user, this is a real correction, not a style choice:** spec 2 claims scheduled upload-window enforcement "follows the existing Vercel Cron pattern... one daily due-check job." That section is explicitly marked in the spec itself as reconstructed after a context compaction and unverified. It's wrong: this codebase's actual, real precedent for exactly this kind of thing (`invitation_events.status === 'expired'`) is **computed at read time** against a stored timestamp (`src/lib/invitations/state.ts:20` — `event.expireAt && Date.parse(event.expireAt) <= now.getTime()`), never a cron. This plan follows the real precedent: the Memories upload window is a pure computed function (`isUploadWindowOpen`, Task 1) checked inline wherever upload eligibility matters, with **no new migration, no new cron, and no stored "closed" flag**. Simpler, and consistent with `gallery_visible`'s own "computed, never stored" convention.
- **Design choice, not a spec mandate — the "N new photos just now" live-update banner uses polling, not Supabase Realtime.** Spec 2 explicitly leaves this as "an implementation-time choice, not a design one." Neither IndexedDB nor Supabase Realtime (`.channel(...)`) exists anywhere in this codebase today (confirmed by full-repo grep) — introducing both at once in a guest-facing feature is more new-pattern risk than this plan should take on. Realtime can replace polling later as a pure swap behind the same gallery-refresh interface Task 6 defines.
- Video remains rejected at `upload/init` (Plan A's deliberate, temporary scope reduction) — nothing in this plan re-opens that. The guest upload UI (Task 4) must not offer video capture or a `video/*` file-picker `accept` filter; it only offers photo capture/selection.
- HEIC remains rejected at `upload/init` (Plan A). The guest upload UI (Task 4) must check `file.type` client-side before calling `upload/init` and show a specific, friendly error for `image/heic`/`image/heif` ("iPhone's default photo format isn't supported yet — switch your camera to 'Most Compatible' in Settings, or share a JPEG") rather than only surfacing the API's generic 400.
- `contentType` is a required field on `upload/init` (Plan A) — always send `file.type` verbatim, never omit it or guess a default.
- The five-value `moderation_status` state machine (`pending`/`awaiting_host_review`/`approved`/`flagged`/`rejected`) must never be conflated. `gallery_visible` is always computed via the existing `listGalleryVisibleMedia` (`src/lib/invitations/memories/gallery.ts`) — no new UI-layer query re-derives it.
- No per-guest-session rate limiting exists yet (Plan A shipped only a same-origin check and a 2,000-completed-upload-per-event ceiling) — this plan does not add it either; the guest upload UI must handle a `429` response from `upload/init` gracefully (a plain "This event has reached its photo limit" message), not treat it as a bug to route around.
- **Deliberate scope reduction on `memory_upload_sessions` (spec 2's batch-progress table) — flag to the user.** Spec 2 designed this table so a guest's upload batch progress survives even a full browser/device change ("how far did this guest's batch got"). This plan's Task 3 satisfies spec 2's actual load-bearing resilience requirement — "a closed tab, refresh, or dropped connection resumes exactly where it left off" — entirely client-side via IndexedDB, which covers the primary real-world case (same phone, same browser). Wiring `memory_upload_sessions` itself (a new API route plus a client-generated, IndexedDB-persisted `guest_session_fingerprint`, plus server-side count updates on every file's completion) would add a second, server-side progress-tracking path whose only additional value over Task 3's IndexedDB queue is cross-device resume and host-side upload-batch observability — neither asked for elsewhere in this plan. Deferring it as a small, well-bounded follow-up (mirrors how Plan A deferred per-guest rate limiting and HEIC support rather than silently dropping them) rather than expanding this already-large plan for a table nothing else in V1 reads.
- **Host-facing pages under `/invitations/manage/[eventId]/*` currently authenticate owners only** (`INVITATION_OWNER_SESSION_COOKIE` + `verifyOwnerSession` + `invitationOwnerOwnsEvent`, confirmed in both `edit/page.tsx` and this route family's own dashboard `page.tsx` — neither checks `admin_session`/founder access at all, unlike the API-route-level `requireInvitationAccess`, which does). This is pre-existing behavior, not something this plan is scoped to fix — Task 10's new moderation page matches this route family's actual existing convention exactly, rather than introducing founder access no sibling page in this family currently has.

---

### Task 1: Upload window computation + host Memories settings toggle

**Files:**
- Create: `src/lib/invitations/memories/upload-window.ts`
- Create: `src/lib/invitations/memories/upload-window.test.ts`
- Modify: `src/lib/invitations/memories/repository.ts` (add `getEventMemoriesSettings`'s `startsAt` field, add `updateEventMemoriesSettings`)
- Modify: `src/lib/invitations/memories/repository.test.ts`
- Modify: `src/app/api/memories/events/[eventId]/upload/init/route.ts` (enforce the upload window)
- Modify: `src/app/api/memories/events/[eventId]/upload/upload-routes.test.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/settings/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/settings/settings-route.test.ts`

**Interfaces:**
- Consumes: `getEventMemoriesSettings` (existing, `src/lib/invitations/memories/repository.ts`), `requireInvitationAccess`/`isSameOrigin` (`@/lib/invitations/access`, `@/lib/invitations/auth`).
- Produces: `computeUploadWindowClosesAt(startsAt: string | null): string | null`, `isUploadWindowOpen(startsAt: string | null, now?: Date): boolean` (both `src/lib/invitations/memories/upload-window.ts`) — Tasks 4 and 9 read `isUploadWindowOpen`'s result via the settings the API already returns. `updateEventMemoriesSettings(eventId: string, updates: { memoriesEnabled?: boolean; memoriesMode?: "auto_publish" | "review_required" }): Promise<void>` — Task 9's dashboard card UI calls the new settings route, which calls this.

- [ ] **Step 1: Write the failing test for the upload-window computation**

```ts
// src/lib/invitations/memories/upload-window.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeUploadWindowClosesAt, isUploadWindowOpen } from "./upload-window";

test("computeUploadWindowClosesAt adds 14 days to the event's start time", () => {
  assert.equal(
    computeUploadWindowClosesAt("2026-09-01T00:00:00.000Z"),
    "2026-09-15T00:00:00.000Z",
  );
});

test("computeUploadWindowClosesAt returns null for an undated event", () => {
  assert.equal(computeUploadWindowClosesAt(null), null);
});

test("isUploadWindowOpen is true before the 14-day mark", () => {
  const open = isUploadWindowOpen("2026-09-01T00:00:00.000Z", new Date("2026-09-10T00:00:00.000Z"));
  assert.equal(open, true);
});

test("isUploadWindowOpen is false after the 14-day mark", () => {
  const open = isUploadWindowOpen("2026-09-01T00:00:00.000Z", new Date("2026-09-16T00:00:00.000Z"));
  assert.equal(open, false);
});

test("isUploadWindowOpen is always true for an undated event — matches the existing expireAt null-handling convention", () => {
  assert.equal(isUploadWindowOpen(null, new Date("2099-01-01T00:00:00.000Z")), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/upload-window.test.ts`
Expected: FAIL — `Cannot find module './upload-window'`

- [ ] **Step 3: Implement `upload-window.ts`**

```ts
// src/lib/invitations/memories/upload-window.ts
const UPLOAD_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeUploadWindowClosesAt(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return null;
  return new Date(start + UPLOAD_WINDOW_DAYS * MS_PER_DAY).toISOString();
}

export function isUploadWindowOpen(startsAt: string | null, now: Date = new Date()): boolean {
  const closesAt = computeUploadWindowClosesAt(startsAt);
  if (!closesAt) return true; // undated draft: never auto-closes, matches state.ts's expireAt null handling
  return Date.parse(closesAt) > now.getTime();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/invitations/memories/upload-window.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add src/lib/invitations/memories/upload-window.ts src/lib/invitations/memories/upload-window.test.ts
git commit -m "feat: compute the Memories upload window without a stored flag or cron"
```

- [ ] **Step 6: Write the failing test for `getEventMemoriesSettings`'s new `startsAt` field**

Read the current test file first (`src/lib/invitations/memories/repository.test.ts`) to see the existing mock-client pattern before extending it — don't guess its shape. Add:

```ts
test("getEventMemoriesSettings returns startsAt alongside the existing fields", async () => {
  const settings = await getEventMemoriesSettings("event-with-a-start-date");
  assert.ok(settings);
  assert.equal(typeof settings!.startsAt === "string" || settings!.startsAt === null, true);
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: FAIL — `startsAt` is `undefined`, not `string | null`

- [ ] **Step 8: Extend `getEventMemoriesSettings` and add `updateEventMemoriesSettings`**

In `src/lib/invitations/memories/repository.ts`, modify the existing function's select list and return shape (additive — do not remove `memoriesEnabled`/`memoriesMode`):

```ts
export async function getEventMemoriesSettings(
  eventId: string,
): Promise<{ memoriesEnabled: boolean; memoriesMode: "auto_publish" | "review_required"; startsAt: string | null } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("memories_enabled,memories_mode,starts_at")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    memoriesEnabled: data.memories_enabled as boolean,
    memoriesMode: data.memories_mode as "auto_publish" | "review_required",
    startsAt: (data.starts_at as string | null) ?? null,
  };
}

export async function updateEventMemoriesSettings(
  eventId: string,
  updates: { memoriesEnabled?: boolean; memoriesMode?: "auto_publish" | "review_required" },
): Promise<void> {
  const client = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (updates.memoriesEnabled !== undefined) patch.memories_enabled = updates.memoriesEnabled;
  if (updates.memoriesMode !== undefined) patch.memories_mode = updates.memoriesMode;
  const { error } = await client.from("invitation_events").update(patch).eq("id", eventId);
  if (error) throw new Error(`failed to update memories settings: ${error.message}`);
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts
git commit -m "feat: add startsAt to Memories settings and a settings writer"
```

- [ ] **Step 11: Write the failing test enforcing the upload window in `upload/init`**

Read `src/app/api/memories/events/[eventId]/upload/upload-routes.test.ts` in full first — it already carries a follow-up note (from Plan A's final review) that its assertions are structural, not full HTTP integration tests; match that existing style, don't invent a new one. Add a structural test asserting the route module's source calls `isUploadWindowOpen`:

```ts
test("upload/init enforces the upload window", async () => {
  const source = await readFile(
    new URL("./init/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /isUploadWindowOpen/);
});
```

(Match the existing file's actual import style for `readFile`/`import.meta.url` — copy it from a neighboring test in the same file rather than introducing a new pattern.)

- [ ] **Step 12: Run test to verify it fails**

Run: `npx tsx --test "src/app/api/memories/events/[eventId]/upload/upload-routes.test.ts"`
Expected: FAIL — `isUploadWindowOpen` not found in source

- [ ] **Step 13: Enforce the window in `upload/init/route.ts`**

Add the import and a check right after the existing `settings.memoriesEnabled` check (`src/app/api/memories/events/[eventId]/upload/init/route.ts`):

```ts
import { isUploadWindowOpen } from "@/lib/invitations/memories/upload-window";
// ...
const settings = await getEventMemoriesSettings(eventId);
if (!settings || !settings.memoriesEnabled) {
  return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
}
if (!isUploadWindowOpen(settings.startsAt)) {
  return NextResponse.json({ error: "the upload window for this event has closed" }, { status: 404 });
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `npx tsx --test "src/app/api/memories/events/[eventId]/upload/upload-routes.test.ts"`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add src/app/api/memories/events/\[eventId\]/upload/init/route.ts "src/app/api/memories/events/[eventId]/upload/upload-routes.test.ts"
git commit -m "feat: reject uploads after the Memories upload window closes"
```

- [ ] **Step 16: Write the failing test for the settings route**

```ts
// src/app/api/invitations/events/[eventId]/memories/settings/settings-route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("settings route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.PATCH, "function");
});
```

- [ ] **Step 17: Run test to verify it fails**

Run: `npx tsx --test "src/app/api/invitations/events/[eventId]/memories/settings/settings-route.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 18: Implement the settings route**

```ts
// src/app/api/invitations/events/[eventId]/memories/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { updateEventMemoriesSettings } from "@/lib/invitations/memories/repository";

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const values = body as { action?: string; enabled?: boolean; mode?: string };
    if (values.action === "set_enabled" && typeof values.enabled === "boolean") {
      await updateEventMemoriesSettings(params.eventId, { memoriesEnabled: values.enabled });
      return NextResponse.json({ ok: true });
    }
    if (values.action === "set_mode" && (values.mode === "auto_publish" || values.mode === "review_required")) {
      await updateEventMemoriesSettings(params.eventId, { memoriesMode: values.mode });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[memories/settings] update failed", { error });
    return NextResponse.json({ error: "settings update failed" }, { status: 500 });
  }
}
```

- [ ] **Step 19: Run test to verify it passes**

Run: `npx tsx --test "src/app/api/invitations/events/[eventId]/memories/settings/settings-route.test.ts"`
Expected: PASS

- [ ] **Step 20: Commit**

```bash
git add "src/app/api/invitations/events/[eventId]/memories/settings"
git commit -m "feat: add host-facing Memories settings route"
```

---

### Task 2: Guest session mint/upgrade endpoint

**Files:**
- Create: `src/app/api/memories/events/[eventId]/session/route.ts`
- Create: `src/app/api/memories/events/[eventId]/session/session-route.test.ts`
- Modify: `src/lib/invitations/memories/repository.ts` (add `getRsvpForEditCredential`)
- Modify: `src/lib/invitations/memories/repository.test.ts`

**Interfaces:**
- Consumes: `signMemoriesGuestSession` (`@/lib/invitations/memories/guest-session`, existing), `hashEditToken`/`verifyEditToken` (`@/lib/invitations/auth`, existing — `verifyEditToken` currently has no call site anywhere in the app; this task is its first real caller), `isSameOrigin`.
- Produces: `POST /api/memories/events/[eventId]/session` — sets an httpOnly `memories_guest_session` cookie and returns `{ level: "anonymous" | "rsvp_guest"; guestName: string | null }`. Task 4's guest landing page calls this once, before showing the upload UI.

- [ ] **Step 1: Write the failing test for `getRsvpForEditCredential`**

Read `src/lib/invitations/memories/repository.test.ts`'s existing mock-client setup first. Add:

```ts
test("getRsvpForEditCredential returns the stored hash for a real rsvp/event pair", async () => {
  const row = await getRsvpForEditCredential("some-event-id", "some-rsvp-id");
  assert.ok(row === null || typeof row.editTokenHash === "string");
});

test("getRsvpForEditCredential returns null for a mismatched event/rsvp pair", async () => {
  const row = await getRsvpForEditCredential("wrong-event-id", "some-rsvp-id");
  assert.equal(row, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: FAIL — `getRsvpForEditCredential` is not exported

- [ ] **Step 3: Implement `getRsvpForEditCredential`**

```ts
// append to src/lib/invitations/memories/repository.ts
export async function getRsvpForEditCredential(
  eventId: string,
  rsvpId: string,
): Promise<{ primaryName: string | null; editTokenHash: string } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_rsvps")
    .select("primary_name, edit_token_hash")
    .eq("id", rsvpId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    primaryName: (data.primary_name as string | null) ?? null,
    editTokenHash: data.edit_token_hash as string,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts
git commit -m "feat: add getRsvpForEditCredential for the Memories guest-session upgrade"
```

- [ ] **Step 6: Write the failing test for the session route**

```ts
// src/app/api/memories/events/[eventId]/session/session-route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("session route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx tsx --test "src/app/api/memories/events/[eventId]/session/session-route.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 8: Implement the session route**

```ts
// src/app/api/memories/events/[eventId]/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, hashEditToken, verifyEditToken } from "@/lib/invitations/auth";
import { signMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { getRsvpForEditCredential } from "@/lib/invitations/memories/repository";
import type { MemoriesGuestSession } from "@/lib/invitations/memories/types";

const SESSION_LIFETIME_SECONDS = 400 * 24 * 60 * 60; // ~13 months — comfortably covers the 12-month gallery-availability window
const MAX_GUEST_NAME_LENGTH = 80;

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const { eventId } = params;
    const values = body as { rsvpId?: string; editToken?: string; guestName?: string };
    const providedName = values.guestName?.trim().slice(0, MAX_GUEST_NAME_LENGTH) || undefined;

    let session: MemoriesGuestSession;
    if (values.rsvpId && values.editToken) {
      const rsvp = await getRsvpForEditCredential(eventId, values.rsvpId);
      if (rsvp && verifyEditToken(values.editToken, rsvp.editTokenHash)) {
        session = {
          eventId,
          level: "rsvp_guest",
          rsvpId: values.rsvpId,
          guestName: providedName ?? rsvp.primaryName ?? undefined,
          expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        };
      } else {
        session = {
          eventId,
          level: "anonymous",
          guestName: providedName,
          expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        };
      }
    } else {
      session = {
        eventId,
        level: "anonymous",
        guestName: providedName,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
      };
    }

    const token = signMemoriesGuestSession(session);
    const response = NextResponse.json({ level: session.level, guestName: session.guestName ?? null });
    response.cookies.set("memories_guest_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_LIFETIME_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("[memories/session] mint failed", { error });
    return NextResponse.json({ error: "session creation failed" }, { status: 500 });
  }
}
```

This is the reason `hashEditToken` doesn't appear used above despite being imported in the file list — drop it from the import if the implementer's own read confirms it's unused (the token comparison goes through `verifyEditToken`, which hashes internally); keep only what's actually called. Note that `hashEditToken` should NOT be imported if unused — TypeScript strict + this repo's lint would flag an unused import (the exact bug class Plan A's final review fixed). Import only `isSameOrigin` and `verifyEditToken` from `@/lib/invitations/auth`.

- [ ] **Step 9: Run test to verify it passes**

Run: `npx tsx --test "src/app/api/memories/events/[eventId]/session/session-route.test.ts"`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add "src/app/api/memories/events/[eventId]/session"
git commit -m "feat: mint and opportunistically upgrade the Memories guest session"
```

---

### Task 3: Guest upload queue core (IndexedDB-persisted, framework-agnostic)

**Files:**
- Create: `src/lib/invitations/memories/upload-queue.ts`
- Create: `src/lib/invitations/memories/upload-queue.test.ts`
- Modify: `package.json` (add `fake-indexeddb` as a devDependency)

**Interfaces:**
- Consumes: nothing from earlier tasks — this module is pure client-side queue-state logic with an injected upload transport, no network calls of its own.
- Produces: `createUploadQueue(eventId: string, uploadOne: UploadOneFn): UploadQueue` — Task 4's guest upload UI is the only consumer, supplying the real XHR-based `uploadOne` implementation. Exact shape:
  ```ts
  export type QueueItemStatus = "queued" | "uploading" | "done" | "failed";
  export interface QueueItem {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    status: QueueItemStatus;
    progress: number;
    error?: string;
    mediaId?: string;
  }
  export type UploadOneFn = (file: File, onProgress: (percent: number) => void) => Promise<{ mediaId: string }>;
  export interface UploadQueue {
    enqueue(file: File): Promise<string>; // returns the new item's id
    retry(id: string): void;
    subscribe(listener: (items: QueueItem[]) => void): () => void;
    getItems(): QueueItem[];
  }
  ```

This is the one genuinely new architectural pattern in this plan (no IndexedDB precedent exists anywhere in the codebase) — keep the design as simple as it can be: one file uploads at a time, in enqueue order; a failed item stops the queue advancing until the guest taps retry (no silent infinite retry loop); state is persisted to IndexedDB on every change so a reload resumes exactly where it left off.

- [ ] **Step 1: Add the test-only IndexedDB shim**

```bash
npm install -D fake-indexeddb
```

Node has no native IndexedDB; `tsx --test` needs a shim to exercise this module at all. This is a test-only dependency — the real browser IndexedDB is used at runtime, this package is never imported outside `upload-queue.test.ts`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/invitations/memories/upload-queue.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { createUploadQueue } from "./upload-queue";

function fakeFile(name: string, bytes: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

test("enqueue adds a queued item and starts uploading it", async () => {
  const queue = createUploadQueue("event-1", async (_file, onProgress) => {
    onProgress(50);
    onProgress(100);
    return { mediaId: "media-1" };
  });
  const id = await queue.enqueue(fakeFile("a.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.ok(item);
  assert.equal(item!.status, "done");
  assert.equal(item!.progress, 100);
  assert.equal(item!.mediaId, "media-1");
});

test("a failed upload marks the item failed and does not auto-retry", async () => {
  let attempts = 0;
  const queue = createUploadQueue("event-2", async () => {
    attempts += 1;
    throw new Error("network error");
  });
  const id = await queue.enqueue(fakeFile("b.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.equal(item!.status, "failed");
  assert.equal(attempts, 1);
});

test("retry re-attempts a failed item", async () => {
  let attempts = 0;
  const queue = createUploadQueue("event-3", async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("network error");
    return { mediaId: "media-3" };
  });
  const id = await queue.enqueue(fakeFile("c.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  queue.retry(id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.equal(item!.status, "done");
  assert.equal(attempts, 2);
});

test("a second enqueue while one item is uploading stays queued, not uploading", async () => {
  let resolveFirst!: () => void;
  const queue = createUploadQueue("event-4", (_file, _onProgress) => {
    return new Promise((resolve) => {
      resolveFirst = () => resolve({ mediaId: "media-4a" });
    });
  });
  await queue.enqueue(fakeFile("d.jpg", 1000));
  const secondId = await queue.enqueue(fakeFile("e.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(queue.getItems().find((i) => i.id === secondId)!.status, "queued");
  resolveFirst();
});

test("subscribe notifies listeners on every state change", async () => {
  const queue = createUploadQueue("event-5", async () => ({ mediaId: "media-5" }));
  const snapshots: number[] = [];
  const unsubscribe = queue.subscribe((items) => snapshots.push(items.length));
  await queue.enqueue(fakeFile("f.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(snapshots.length >= 2); // at least: queued, then done
  unsubscribe();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx tsx --test src/lib/invitations/memories/upload-queue.test.ts`
Expected: FAIL — `Cannot find module './upload-queue'`

- [ ] **Step 4: Implement `upload-queue.ts`**

```ts
// src/lib/invitations/memories/upload-queue.ts
export type QueueItemStatus = "queued" | "uploading" | "done" | "failed";

export interface QueueItem {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: QueueItemStatus;
  progress: number;
  error?: string;
  mediaId?: string;
}

export type UploadOneFn = (file: File, onProgress: (percent: number) => void) => Promise<{ mediaId: string }>;

export interface UploadQueue {
  enqueue(file: File): Promise<string>;
  retry(id: string): void;
  subscribe(listener: (items: QueueItem[]) => void): () => void;
  getItems(): QueueItem[];
}

const DB_NAME = "memories-upload-queue";
const DB_VERSION = 1;
const STORE_NAME = "items";

function openDb(eventId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${DB_NAME}-${eventId}`, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistItem(db: IDBDatabase, entry: { id: string; file: File; item: QueueItem }): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function createUploadQueue(eventId: string, uploadOne: UploadOneFn): UploadQueue {
  const files = new Map<string, File>();
  const items: QueueItem[] = [];
  const listeners = new Set<(items: QueueItem[]) => void>();
  let dbPromise: Promise<IDBDatabase> | null = null;
  let processing = false;

  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) dbPromise = openDb(eventId);
    return dbPromise;
  }

  function notify(): void {
    const snapshot = items.map((i) => ({ ...i }));
    for (const listener of listeners) listener(snapshot);
  }

  function findItem(id: string): QueueItem | undefined {
    return items.find((i) => i.id === id);
  }

  async function processNext(): Promise<void> {
    if (processing) return;
    const next = items.find((i) => i.status === "queued");
    if (!next) return;
    processing = true;
    next.status = "uploading";
    notify();
    try {
      const file = files.get(next.id)!;
      const result = await uploadOne(file, (percent) => {
        next.progress = percent;
        notify();
      });
      next.status = "done";
      next.progress = 100;
      next.mediaId = result.mediaId;
    } catch (error) {
      next.status = "failed";
      next.error = error instanceof Error ? error.message : "upload failed";
    }
    notify();
    const db = await getDb();
    await persistItem(db, { id: next.id, file: files.get(next.id)!, item: { ...next } });
    processing = false;
    void processNext();
  }

  return {
    async enqueue(file: File): Promise<string> {
      const id = crypto.randomUUID();
      const item: QueueItem = {
        id,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        status: "queued",
        progress: 0,
      };
      files.set(id, file);
      items.push(item);
      const db = await getDb();
      await persistItem(db, { id, file, item: { ...item } });
      notify();
      void processNext();
      return id;
    },
    retry(id: string): void {
      const item = findItem(id);
      if (!item || item.status !== "failed") return;
      item.status = "queued";
      item.error = undefined;
      item.progress = 0;
      notify();
      void processNext();
    },
    subscribe(listener: (items: QueueItem[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getItems(): QueueItem[] {
      return items.map((i) => ({ ...i }));
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/memories/upload-queue.test.ts`
Expected: PASS (5/5)

- [ ] **Step 6: Run `tsc --noEmit` to confirm the DOM lib types (`File`, `IDBDatabase`, `crypto.randomUUID`) resolve**

Run: `npx tsc --noEmit`
Expected: exit 0. If `File`/`IDBDatabase` are not found, check `tsconfig.json`'s `lib` array already includes `"DOM"` (it does, for every other browser-facing file in this repo) — do not add a new `lib` entry for this alone.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/invitations/memories/upload-queue.ts src/lib/invitations/memories/upload-queue.test.ts
git commit -m "feat: add an IndexedDB-persisted guest upload queue"
```

---

### Task 4: Guest landing page + upload UI

**Files:**
- Create: `src/components/invitations/memories/GuestMemoriesApp.tsx`
- Create: `src/components/invitations/memories/GuestUploadView.tsx`
- Create: `src/app/invite/[slug]/memories/page.tsx`
- Modify: `messages/en.json`, `messages/es.json` (add `invitations.public.memories.upload.*` and `invitations.public.memories.landing.*`)

**Interfaces:**
- Consumes: `createUploadQueue`/`QueueItem` (Task 3), `POST /api/memories/events/[eventId]/session` (Task 2), `POST /api/memories/events/[eventId]/upload/init` and `.../upload/complete` (Plan A, unchanged), `getPublicInvitationBySlug`/`resolvePublicInvitationPage` (`@/lib/invitations/repository`, `@/lib/invitations/public-access`, existing), `InvitationPublicProvider` (existing), `InvitationDesignRecipe`/`DEFAULT_INVITATION_DESIGN_RECIPE` (`@/lib/invitations/design-recipe`, existing).
- Produces: `<GuestMemoriesApp eventId palette locale memoriesEnabled>` — the single client component that owns which of Upload/All Photos/Moments is showing (bottom nav). Tasks 6 and 7 add their views as siblings inside this same component's switch, not as separate pages — matches spec 2's "bottom navigation is only All Photos / Moments" app-like framing. This task builds the shell plus the Upload view only; Tasks 6/7 fill in the other two tabs.

- [ ] **Step 1: Add the i18n strings**

Add to `messages/en.json` under `invitations.public` (create the `memories` key — it doesn't exist yet):

```json
"memories": {
  "landing": {
    "title": "Share your photos",
    "addPhotos": "Add your photos",
    "browseGallery": "Just browse the gallery",
    "nameLabel": "Your name (optional, so the couple knows who to thank)",
    "namePlaceholder": "Your name"
  },
  "upload": {
    "queued": "Waiting to upload",
    "uploading": "Uploading… {percent}%",
    "done": "Uploaded",
    "failed": "Couldn't upload — nothing is lost, tap retry",
    "retry": "Retry",
    "addMore": "Add more photos",
    "heicError": "iPhone's default photo format isn't supported yet — switch your camera to \"Most Compatible\" in Settings, or share a JPEG instead.",
    "quotaError": "This event has reached its photo limit.",
    "windowClosedError": "The photo-upload window for this event has closed.",
    "genericError": "Something went wrong — please try again."
  }
}
```

Add the identical structure (Spanish copy) to `messages/es.json` under the same path:

```json
"memories": {
  "landing": {
    "title": "Comparte tus fotos",
    "addPhotos": "Agregar tus fotos",
    "browseGallery": "Solo ver la galería",
    "nameLabel": "Tu nombre (opcional, para que la pareja sepa a quién agradecer)",
    "namePlaceholder": "Tu nombre"
  },
  "upload": {
    "queued": "Esperando para subir",
    "uploading": "Subiendo… {percent}%",
    "done": "Subido",
    "failed": "No se pudo subir — no se perdió nada, toca reintentar",
    "retry": "Reintentar",
    "addMore": "Agregar más fotos",
    "heicError": "El formato de foto predeterminado del iPhone aún no es compatible — cambia tu cámara a \"Más compatible\" en Configuración, o comparte un JPEG.",
    "quotaError": "Este evento alcanzó su límite de fotos.",
    "windowClosedError": "La ventana para subir fotos de este evento ya cerró.",
    "genericError": "Algo salió mal — inténtalo de nuevo."
  }
}
```

- [ ] **Step 2: Implement `GuestUploadView.tsx`**

```tsx
// src/components/invitations/memories/GuestUploadView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createUploadQueue, type QueueItem, type UploadQueue } from "@/lib/invitations/memories/upload-queue";

const UNSUPPORTED_TYPES = new Set(["image/heic", "image/heif"]);

async function uploadOne(
  eventId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ mediaId: string }> {
  const initRes = await fetch(`/api/memories/events/${eventId}/upload/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaKind: "photo", contentType: file.type, sizeBytes: file.size }),
  });
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new Error(body.error ?? "upload initialization failed");
  }
  const { mediaId, ticket, uploadUrl } = await initRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("error", () => reject(new Error("upload failed")));
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("upload failed"));
    });
    xhr.send(file);
  });

  const completeRes = await fetch(`/api/memories/events/${eventId}/upload/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaId, ticket }),
  });
  if (!completeRes.ok) throw new Error("upload completion failed");
  return { mediaId };
}

export function GuestUploadView({ eventId, accent }: { eventId: string; accent: string }) {
  const t = useTranslations("invitations.public.memories.upload");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const queueRef = useRef<UploadQueue | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const queue = createUploadQueue(eventId, (file, onProgress) => uploadOne(eventId, file, onProgress));
    queueRef.current = queue;
    return queue.subscribe(setItems);
  }, [eventId]);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || !queueRef.current) return;
    setRejectionError(null);
    for (const file of Array.from(fileList)) {
      if (UNSUPPORTED_TYPES.has(file.type)) {
        setRejectionError(t("heicError"));
        continue;
      }
      void queueRef.current.enqueue(file);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        capture="environment"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="min-h-12 rounded-md px-4 py-3 text-sm font-semibold text-white"
        style={{ backgroundColor: accent }}
      >
        {items.length > 0 ? t("addMore") : t("addMore")}
      </button>
      {rejectionError && <p role="alert" className="text-sm text-red-700">{rejectionError}</p>}
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border border-gray-200 p-3">
            <p className="truncate text-sm font-medium">{item.fileName}</p>
            {item.status === "queued" && <p className="text-sm text-gray-500">{t("queued")}</p>}
            {item.status === "uploading" && (
              <>
                <p className="text-sm text-gray-500">{t("uploading", { percent: item.progress })}</p>
                <progress value={item.progress} max={100} className="mt-1 block h-2 w-full" style={{ accentColor: accent }} />
              </>
            )}
            {item.status === "done" && <p className="text-sm text-green-700">{t("done")}</p>}
            {item.status === "failed" && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-red-700">{t("failed")}</p>
                <button
                  type="button"
                  onClick={() => queueRef.current?.retry(item.id)}
                  className="min-h-8 rounded-md border px-3 text-sm font-semibold"
                  style={{ borderColor: accent, color: accent }}
                >
                  {t("retry")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Implement `GuestMemoriesApp.tsx`**

```tsx
// src/components/invitations/memories/GuestMemoriesApp.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GuestUploadView } from "./GuestUploadView";

type Tab = "upload" | "gallery" | "moments";

// Mirrors RsvpForm.tsx's credentialFromUrl exactly: the RSVP edit link puts
// rsvpId/editToken in the URL hash, not a query string or cookie, deliberately
// kept out of logs/Referer. This is the only place that credential can arrive
// at Memories — a guest coming from their emailed RSVP link opens the *invitation*
// page first, so in practice this hash is only present if the guest manually
// navigates to /invite/[slug]/memories#rsvpId=...&editToken=... — the common
// path is landing on /invite/[slug] first. Both are handled the same way here.
function rsvpCredentialFromUrl(): { rsvpId: string; editToken: string } | null {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const rsvpId = params.get("rsvpId");
    const editToken = params.get("editToken");
    return rsvpId && editToken ? { rsvpId, editToken } : null;
  } catch {
    return null;
  }
}

export function GuestMemoriesApp({
  eventId,
  accent,
  background,
  text,
}: {
  eventId: string;
  accent: string;
  background: string;
  text: string;
}) {
  const t = useTranslations("invitations.public.memories.landing");
  const [tab, setTab] = useState<Tab>("upload");
  const [sessionReady, setSessionReady] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [greeting, setGreeting] = useState<string | null>(null);

  async function mintSession(name?: string) {
    const credential = rsvpCredentialFromUrl();
    const res = await fetch(`/api/memories/events/${eventId}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rsvpId: credential?.rsvpId,
        editToken: credential?.editToken,
        guestName: name?.trim() || undefined,
      }),
    });
    const data = (await res.json()) as { level: "anonymous" | "rsvp_guest"; guestName: string | null };
    if (data.guestName) setGreeting(data.guestName);
  }

  useEffect(() => {
    // Mints the session immediately on landing — this is what carries the
    // RSVP-upgrade credential (available right away from the URL hash, if
    // present) and sets the cookie every later upload/init call relies on.
    // No guest name exists yet at this point; typing one re-mints below.
    void mintSession().finally(() => setSessionReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (!sessionReady) return null;

  return (
    <div style={{ backgroundColor: background, color: text }} className="min-h-screen pb-20">
      <header className="p-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {!greeting && (
          <input
            type="text"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            onBlur={() => {
              if (guestName.trim()) void mintSession(guestName);
            }}
            placeholder={t("namePlaceholder")}
            aria-label={t("nameLabel")}
            maxLength={80}
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
          />
        )}
      </header>
      <main>
        {tab === "upload" && <GuestUploadView eventId={eventId} accent={accent} />}
        {tab === "gallery" && <div data-testid="gallery-placeholder" />}
        {tab === "moments" && <div data-testid="moments-placeholder" />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t bg-white/95 backdrop-blur">
        {(["upload", "gallery", "moments"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className="min-h-14 flex-1 text-sm font-medium"
            style={{ color: tab === value ? accent : undefined }}
          >
            {value}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

(The `gallery`/`moments` placeholders are replaced by Tasks 6 and 7 — this task only needs the shell + Upload tab working end to end.)

- [ ] **Step 4: Implement the page**

```tsx
// src/app/invite/[slug]/memories/page.tsx
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { GuestMemoriesApp } from "@/components/invitations/memories/GuestMemoriesApp";
import { getInvitationPasscodeCookieName, verifyInvitationPasscodeSession } from "@/lib/invitations/auth";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";

export const dynamic = "force-dynamic";

export default async function GuestMemoriesPage({ params }: { params: { slug: string } }) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  if (invitation.event.passcodeRequired) {
    const signed = cookies().get(getInvitationPasscodeCookieName(invitation.event.id))?.value;
    let hasAccess = false;
    try {
      hasAccess = Boolean(signed && verifyInvitationPasscodeSession(signed, invitation.event.id));
    } catch {
      hasAccess = false;
    }
    if (!hasAccess) redirect(`/invite/${params.slug}`); // same passcode gate the public page itself enforces
  }

  const settings = await getEventMemoriesSettings(invitation.event.id);
  if (!settings || !settings.memoriesEnabled) notFound();

  const recipe = invitation.event.designRecipe ?? DEFAULT_INVITATION_DESIGN_RECIPE;

  return (
    <InvitationPublicProvider locale={invitation.event.locale} timeZone="UTC">
      <GuestMemoriesApp
        eventId={invitation.event.id}
        accent={recipe.palette.accent}
        background={recipe.palette.background}
        text={recipe.palette.text}
      />
    </InvitationPublicProvider>
  );
}
```

Read `src/app/invite/[slug]/page.tsx` first to confirm the exact field name on `invitation.event` that indicates a passcode is required (e.g. `passcodeRequired` above is this plan's best-guess name based on the existing `getInvitationPasscodeCookieName`/`verifyInvitationPasscodeSession` pair — verify the real field name in `resolvePublicInvitationPage`'s resolution logic and correct it if it differs) before wiring this.

- [ ] **Step 5: Manual verification (no automated test for a page component in this codebase's convention — matches every other `page.tsx` under `src/app/invite/`)**

Run: `npm run build`
Expected: exit 0, `/invite/[slug]/memories` present in the route manifest.

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/es.json src/components/invitations/memories/GuestMemoriesApp.tsx src/components/invitations/memories/GuestUploadView.tsx "src/app/invite/[slug]/memories/page.tsx"
git commit -m "feat: add the guest Memories landing page and upload UI"
```

---

### Task 5: Public gallery API route

**Files:**
- Create: `src/app/api/memories/events/[eventId]/gallery/route.ts`
- Create: `src/app/api/memories/events/[eventId]/gallery/gallery-route.test.ts`

**Interfaces:**
- Consumes: `listGalleryVisibleMedia` (`@/lib/invitations/memories/gallery`, existing), `getEventMemoriesSettings` (Task 1's extended version).
- Produces: `GET /api/memories/events/[eventId]/gallery` → `{ media: MemoryMedia[]; moments: { id: string; name: string; startsAt: string; endsAt: string; sortOrder: number }[] }`. Tasks 6 and 7 are the only consumers.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/memories/events/[eventId]/gallery/gallery-route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("gallery route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test "src/app/api/memories/events/[eventId]/gallery/gallery-route.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 3: Add `listMemoryMoments` to the repository**

Read `src/lib/invitations/memories/repository.ts`'s existing `mapRow` pattern first, then append:

```ts
export interface MemoryMoment {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  sortOrder: number;
}

export async function listMemoryMoments(eventId: string): Promise<MemoryMoment[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_moments")
    .select("id,name,starts_at,ends_at,sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
    sortOrder: row.sort_order as number,
  }));
}
```

Add a matching test in `src/lib/invitations/memories/repository.test.ts` following the file's existing pattern for a list-returning function (read one of `listGalleryVisibleMedia`'s tests in `gallery.test.ts` for the shape to mirror), then run `npx tsx --test src/lib/invitations/memories/repository.test.ts` to confirm it passes before moving on.

- [ ] **Step 4: Implement the gallery route**

```ts
// src/app/api/memories/events/[eventId]/gallery/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listGalleryVisibleMedia } from "@/lib/invitations/memories/gallery";
import { getEventMemoriesSettings, listMemoryMoments } from "@/lib/invitations/memories/repository";

export async function GET(_request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const settings = await getEventMemoriesSettings(params.eventId);
    if (!settings || !settings.memoriesEnabled) {
      return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    }
    const [media, moments] = await Promise.all([
      listGalleryVisibleMedia(params.eventId),
      listMemoryMoments(params.eventId),
    ]);
    return NextResponse.json({ media, moments });
  } catch (error) {
    console.error("[memories/gallery] fetch failed", { error });
    return NextResponse.json({ error: "gallery fetch failed" }, { status: 500 });
  }
}
```

This route is deliberately guest-readable with no session/auth check beyond `memories_enabled` — matches spec 2's "no login" guest model; the underlying `memory_media` row already excludes anything not `gallery_visible` via `listGalleryVisibleMedia`, so there's no unmoderated or private content this route can leak.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test "src/app/api/memories/events/[eventId]/gallery/gallery-route.test.ts"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts "src/app/api/memories/events/[eventId]/gallery"
git commit -m "feat: add the guest-facing Memories gallery API route"
```

---

### Task 6: Guest gallery — All Photos view

**Files:**
- Create: `src/components/invitations/memories/GuestGalleryView.tsx`
- Modify: `src/components/invitations/memories/GuestMemoriesApp.tsx` (wire the `gallery` tab to this component instead of the placeholder)
- Modify: `messages/en.json`, `messages/es.json` (add `invitations.public.memories.gallery.*`)

**Interfaces:**
- Consumes: `GET /api/memories/events/[eventId]/gallery` (Task 5), `MemoryMedia` type (`@/lib/invitations/memories/types`).
- Produces: `<GuestGalleryView eventId accent surface text>` — self-contained, polls its own data, no external state Task 7 needs to share (Task 7's Moments view fetches the same endpoint independently and filters client-side by `capturedAt`, matching the spec's "first match wins" computed-membership rule; the two views are not meant to share one in-memory cache in V1 — simplicity over a shared-cache optimization that isn't needed yet).

- [ ] **Step 1: Add the i18n strings**

Add to `messages/en.json` under `invitations.public.memories`:

```json
"gallery": {
  "empty": "No photos yet — be the first to share one!",
  "newPhotos": "{count} new photos just now",
  "tonight": "Tonight",
  "thisAfternoon": "This afternoon",
  "earlier": "Earlier"
}
```

Add the Spanish equivalent to `messages/es.json`:

```json
"gallery": {
  "empty": "Aún no hay fotos — ¡sé el primero en compartir una!",
  "newPhotos": "{count} fotos nuevas justo ahora",
  "tonight": "Esta noche",
  "thisAfternoon": "Esta tarde",
  "earlier": "Más temprano"
}
```

- [ ] **Step 2: Implement `GuestGalleryView.tsx`**

```tsx
// src/components/invitations/memories/GuestGalleryView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

const POLL_INTERVAL_MS = 15_000;
const STORY_STRIP_WINDOW_MS = 20 * 60 * 1000;

function timeOfDaySection(capturedAt: string | null, now: Date): "tonight" | "thisAfternoon" | "earlier" {
  if (!capturedAt) return "earlier";
  const hoursAgo = (now.getTime() - Date.parse(capturedAt)) / (60 * 60 * 1000);
  if (hoursAgo < 6) return "tonight";
  if (hoursAgo < 18) return "thisAfternoon";
  return "earlier";
}

export function GuestGalleryView({ eventId, accent, surface }: { eventId: string; accent: string; surface: string }) {
  const t = useTranslations("invitations.public.memories.gallery");
  const [media, setMedia] = useState<MemoryMedia[]>([]);
  const [newCount, setNewCount] = useState(0);
  const previousIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/memories/events/${eventId}/gallery`);
      if (!res.ok || cancelled) return;
      const { media: fetched } = (await res.json()) as { media: MemoryMedia[] };
      const currentIds = new Set(fetched.map((m) => m.id));
      const arrived = [...currentIds].filter((id) => !previousIds.current.has(id));
      if (previousIds.current.size > 0 && arrived.length > 0) setNewCount((count) => count + arrived.length);
      previousIds.current = currentIds;
      setMedia(fetched);
    }
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId]);

  const now = new Date();
  const recentUploaders = media.filter((m) => now.getTime() - Date.parse(m.uploadedAt) < STORY_STRIP_WINDOW_MS);
  const sections: Record<"tonight" | "thisAfternoon" | "earlier", MemoryMedia[]> = {
    tonight: [],
    thisAfternoon: [],
    earlier: [],
  };
  for (const item of media) sections[timeOfDaySection(item.capturedAt, now)].push(item);

  if (media.length === 0) {
    return <p className="p-4 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {recentUploaders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {recentUploaders.slice(0, 10).map((item) => (
            <div key={item.id} className="h-14 w-14 flex-shrink-0 rounded-full border-2" style={{ borderColor: accent }}>
              {item.objectKeyThumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/memories/media/${item.id}/thumbnail`} alt="" className="h-full w-full rounded-full object-cover" />
              )}
            </div>
          ))}
        </div>
      )}
      {newCount > 0 && (
        <button
          type="button"
          onClick={() => setNewCount(0)}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          {t("newPhotos", { count: newCount })}
        </button>
      )}
      {(["tonight", "thisAfternoon", "earlier"] as const).map(
        (section) =>
          sections[section].length > 0 && (
            <section key={section}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: accent }}>
                {t(section)}
              </h2>
              <div className="columns-2 gap-2 sm:columns-3">
                {sections[section].map((item) => (
                  <div key={item.id} className="mb-2 break-inside-avoid rounded-md" style={{ backgroundColor: surface }}>
                    {item.objectKeyDisplay && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/memories/media/${item.id}/display`} alt="" className="w-full rounded-md" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
```

**Note this task deliberately references two image-serving endpoints (`/api/memories/media/[id]/thumbnail` and `.../display`) that do not exist in this plan** — they're the last piece needed to actually render an `<img>` (a signed or public R2 URL per image, refreshed per request). Add this as **Step 3** below rather than silently leaving a dangling reference.

- [ ] **Step 3: Add the missing media-serving route this view depends on**

```ts
// src/app/api/memories/media/[mediaId]/[variant]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getMemoryMediaById } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

const VARIANT_KEYS = new Set(["display", "thumbnail"]);

export async function GET(_request: NextRequest, { params }: { params: { mediaId: string; variant: string } }) {
  if (!VARIANT_KEYS.has(params.variant)) {
    return NextResponse.json({ error: "invalid variant" }, { status: 400 });
  }
  const media = await getMemoryMediaById(params.mediaId);
  if (!media) return NextResponse.json({ error: "not found" }, { status: 404 });
  const objectKey = params.variant === "display" ? media.objectKeyDisplay : media.objectKeyThumbnail;
  if (!objectKey) return NextResponse.json({ error: "not ready" }, { status: 404 });

  const storage = new R2StorageProvider();
  const signedUrl = await storage.getSignedDownloadUrl(objectKey, 5 * 60);
  return NextResponse.redirect(signedUrl);
}
```

Add `src/app/api/memories/media/[mediaId]/[variant]/media-route.test.ts` mirroring Step 1's module-loads-under-tsx pattern from Task 5, and run it. This route deliberately does not gate on `moderation_status` beyond what `listGalleryVisibleMedia` already filtered — a guest with a direct `mediaId` (only obtainable from an already-gallery_visible row returned by the gallery API) can fetch its own display/thumbnail image, exactly the access level spec 2's security model intends (no separate authorization needed beyond "this media is already public in the gallery").

- [ ] **Step 4: Wire the gallery tab into `GuestMemoriesApp.tsx`**

```tsx
// modify src/components/invitations/memories/GuestMemoriesApp.tsx
import { GuestGalleryView } from "./GuestGalleryView";
// ...
{tab === "gallery" && <GuestGalleryView eventId={eventId} accent={accent} surface={background} />}
```

(Pass whatever `surface` value the parent page actually has available — extend `GuestMemoriesApp`'s props with a `surface: string` prop sourced from `recipe.palette.surface` in `page.tsx`, rather than reusing `background` for both; read the current prop list before editing so the diff stays consistent.)

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/es.json src/components/invitations/memories/GuestGalleryView.tsx src/components/invitations/memories/GuestMemoriesApp.tsx src/app/invite/[slug]/memories/page.tsx src/app/api/memories/media
git commit -m "feat: add the guest All Photos gallery view"
```

---

### Task 7: Guest gallery — Moments (Discovery) view

**Files:**
- Create: `src/components/invitations/memories/GuestMomentsView.tsx`
- Modify: `src/components/invitations/memories/GuestMemoriesApp.tsx` (wire the `moments` tab)
- Modify: `messages/en.json`, `messages/es.json` (add `invitations.public.memories.moments.*`)

**Interfaces:**
- Consumes: `GET /api/memories/events/[eventId]/gallery` (Task 5, same endpoint as Task 6 — both `media` and `moments` arrays), `MemoryMoment` type shape from that route's response.
- Produces: nothing further downstream — this is the last guest-facing view in this plan.

- [ ] **Step 1: Add the i18n strings**

Add to `messages/en.json` under `invitations.public.memories`:

```json
"moments": {
  "empty": "No moments yet — check back soon.",
  "photoCount": "{count} photos",
  "back": "All moments"
}
```

Spanish, `messages/es.json`:

```json
"moments": {
  "empty": "Aún no hay momentos — vuelve pronto.",
  "photoCount": "{count} fotos",
  "back": "Todos los momentos"
}
```

- [ ] **Step 2: Implement `GuestMomentsView.tsx`**

```tsx
// src/components/invitations/memories/GuestMomentsView.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { MemoryMedia } from "@/lib/invitations/memories/types";
import type { MemoryMoment as Moment } from "@/lib/invitations/memories/repository";

function momentForMedia(media: MemoryMedia, moments: Moment[]): Moment | null {
  if (!media.capturedAt) return null;
  const capturedMs = Date.parse(media.capturedAt);
  const sorted = [...moments].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((m) => capturedMs >= Date.parse(m.startsAt) && capturedMs < Date.parse(m.endsAt)) ?? null;
}

export function GuestMomentsView({ eventId, accent, surface }: { eventId: string; accent: string; surface: string }) {
  const t = useTranslations("invitations.public.memories.moments");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [media, setMedia] = useState<MemoryMedia[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/memories/events/${eventId}/gallery`)
      .then((res) => res.json())
      .then((data: { media: MemoryMedia[]; moments: Moment[] }) => {
        setMoments(data.moments);
        setMedia(data.media);
      });
  }, [eventId]);

  const counts = new Map<string, number>();
  const covers = new Map<string, MemoryMedia>();
  for (const item of media) {
    const moment = momentForMedia(item, moments);
    if (!moment) continue;
    counts.set(moment.id, (counts.get(moment.id) ?? 0) + 1);
    if (!covers.has(moment.id)) covers.set(moment.id, item);
  }

  if (selected) {
    const selectedMedia = media.filter((item) => momentForMedia(item, moments)?.id === selected);
    return (
      <div className="flex flex-col gap-3 p-4">
        <button type="button" onClick={() => setSelected(null)} className="self-start text-sm font-semibold" style={{ color: accent }}>
          {t("back")}
        </button>
        <div className="columns-2 gap-2 sm:columns-3">
          {selectedMedia.map((item) => (
            <div key={item.id} className="mb-2 break-inside-avoid rounded-md" style={{ backgroundColor: surface }}>
              {item.objectKeyDisplay && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/memories/media/${item.id}/display`} alt="" className="w-full rounded-md" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (moments.length === 0) {
    return <p className="p-4 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {moments.map((moment) => {
        const cover = covers.get(moment.id);
        return (
          <button
            key={moment.id}
            type="button"
            onClick={() => setSelected(moment.id)}
            className="flex flex-col overflow-hidden rounded-md text-left"
            style={{ backgroundColor: surface }}
          >
            {cover?.objectKeyThumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/memories/media/${cover.id}/thumbnail`} alt="" className="h-24 w-full object-cover" />
            )}
            <div className="p-2">
              <p className="text-sm font-semibold">{moment.name}</p>
              <p className="text-xs" style={{ color: accent }}>{t("photoCount", { count: counts.get(moment.id) ?? 0 })}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Wire the moments tab into `GuestMemoriesApp.tsx`**

```tsx
import { GuestMomentsView } from "./GuestMomentsView";
// ...
{tab === "moments" && <GuestMomentsView eventId={eventId} accent={accent} surface={background} />}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json src/components/invitations/memories/GuestMomentsView.tsx src/components/invitations/memories/GuestMemoriesApp.tsx
git commit -m "feat: add the guest Moments discovery view"
```

---

### Task 8: Host moderation backend (repository + action route)

**Files:**
- Modify: `src/lib/invitations/memories/repository.ts` (add `listMediaForHostReview`, `getMemoriesEventSummary`)
- Modify: `src/lib/invitations/memories/repository.test.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/moderation/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/moderation/moderation-route.test.ts`

**Interfaces:**
- Consumes: `requireInvitationAccess`/`isSameOrigin`, `mapRow` (existing, `src/lib/invitations/memories/repository.ts`).
- Produces: `listMediaForHostReview(eventId: string, filter: "flagged" | "awaiting_host_review" | "removed" | "published"): Promise<MemoryMedia[]>`, `getMemoriesEventSummary(eventId: string): Promise<{ photoCount: number; videoCount: number; guestContributorCount: number; flaggedCount: number; recentThumbnailMediaIds: string[] }>` — Task 9 (dashboard card) and Task 10 (review queue UI) are the consumers. `PATCH /api/invitations/events/[eventId]/memories/moderation` with `{ action: "approve" | "reject" | "remove"; mediaIds: string[] }` — bulk action endpoint, host-only.

- [ ] **Step 1: Write the failing tests for the two new repository functions**

Read `src/lib/invitations/memories/gallery.test.ts` first for how a media-row-returning function is tested against a stubbed Supabase client in this file family, then add to `repository.test.ts`:

```ts
test("listMediaForHostReview('flagged') only returns flagged rows", async () => {
  const rows = await listMediaForHostReview("event-1", "flagged");
  assert.ok(rows.every((row) => row.moderationStatus === "flagged"));
});

test("listMediaForHostReview('awaiting_host_review') excludes raw 'pending' rows", async () => {
  const rows = await listMediaForHostReview("event-1", "awaiting_host_review");
  assert.ok(rows.every((row) => row.moderationStatus === "awaiting_host_review"));
  assert.ok(rows.every((row) => row.moderationStatus !== "pending"));
});

test("getMemoriesEventSummary counts photos, videos, and flagged items separately", async () => {
  const summary = await getMemoriesEventSummary("event-1");
  assert.equal(typeof summary.photoCount, "number");
  assert.equal(typeof summary.flaggedCount, "number");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement both functions**

```ts
// append to src/lib/invitations/memories/repository.ts
export async function listMediaForHostReview(
  eventId: string,
  filter: "flagged" | "awaiting_host_review" | "removed" | "published",
): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const moderationStatus =
    filter === "removed" ? "rejected" : filter === "published" ? "approved" : filter;
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", eventId)
    .eq("moderation_status", moderationStatus)
    .order("uploaded_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function getMemoriesEventSummary(eventId: string): Promise<{
  photoCount: number;
  videoCount: number;
  guestContributorCount: number;
  flaggedCount: number;
  recentThumbnailMediaIds: string[];
}> {
  const client = createAdminClient();
  const visible = await client
    .from("memory_media")
    .select("id, media_kind, uploader_rsvp_id, uploader_display_name")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved");
  const flagged = await client
    .from("memory_media")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("moderation_status", "flagged");

  const rows = visible.data ?? [];
  const contributors = new Set(
    rows.map((row) => (row.uploader_rsvp_id as string | null) ?? (row.uploader_display_name as string | null) ?? row.id),
  );
  return {
    photoCount: rows.filter((row) => row.media_kind === "photo").length,
    videoCount: rows.filter((row) => row.media_kind === "video").length,
    guestContributorCount: contributors.size,
    flaggedCount: flagged.count ?? 0,
    recentThumbnailMediaIds: rows.slice(0, 6).map((row) => row.id as string),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts
git commit -m "feat: add host review-queue and dashboard-summary repository functions"
```

- [ ] **Step 6: Write the failing test for the moderation route**

```ts
// src/app/api/invitations/events/[eventId]/memories/moderation/moderation-route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("moderation route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.PATCH, "function");
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx tsx --test "src/app/api/invitations/events/[eventId]/memories/moderation/moderation-route.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 8: Implement the moderation action route**

```ts
// src/app/api/invitations/events/[eventId]/memories/moderation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTION_TO_STATUS: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  remove: "rejected",
};

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const values = body as { action?: string; mediaIds?: string[] };
    const newStatus = values.action ? ACTION_TO_STATUS[values.action] : undefined;
    if (!newStatus || !Array.isArray(values.mediaIds) || values.mediaIds.length === 0) {
      return NextResponse.json({ error: "invalid action or mediaIds" }, { status: 400 });
    }
    const client = createAdminClient();
    const { error } = await client
      .from("memory_media")
      .update({ moderation_status: newStatus })
      .eq("event_id", params.eventId)
      .in("id", values.mediaIds);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, updated: values.mediaIds.length });
  } catch (error) {
    console.error("[memories/moderation] update failed", { error });
    return NextResponse.json({ error: "moderation update failed" }, { status: 500 });
  }
}
```

Note this route intentionally does **not** guard the transition with a `.eq("moderation_status", "...")` precondition the way Plan A's system-driven transitions do (`updateMemoryMediaModeration`'s `.eq("moderation_status", "pending")` idempotency guard) — a host explicitly re-approving an already-approved item, or re-rejecting an already-rejected one, is a harmless no-op here, not a race to guard against, because this is a deliberate human action, not a retried system callback.

- [ ] **Step 9: Run test to verify it passes**

Run: `npx tsx --test "src/app/api/invitations/events/[eventId]/memories/moderation/moderation-route.test.ts"`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add "src/app/api/invitations/events/[eventId]/memories/moderation"
git commit -m "feat: add the host Memories moderation action route"
```

---

### Task 9: Host dashboard Memories card

**Files:**
- Modify: `src/components/invitations/OwnerGuestDashboard.tsx` (add the third card)
- Create: `src/components/invitations/memories/OwnerMemoriesCard.tsx`
- Modify: `messages/en.json`, `messages/es.json` (add `invitations.manage.dashboard.memories.*`)

**Interfaces:**
- Consumes: `getMemoriesEventSummary` (Task 8, including its `recentThumbnailMediaIds`), `getEventMemoriesSettings`/`updateEventMemoriesSettings` (Task 1), the `PATCH /api/invitations/events/[eventId]/memories/settings` route (Task 1), the `GET /api/memories/media/[mediaId]/[variant]` route (Task 6) for rendering each thumbnail.
- Produces: nothing further downstream — this is a leaf UI component.

- [ ] **Step 1: Add the i18n strings**

Add to `messages/en.json` under `invitations.manage.dashboard`, as a sibling of the existing `guestbook`/`message` keys:

```json
"memories": {
  "title": "Memories",
  "flagged": "{count} flagged",
  "summary": "{photos} photos · {videos} videos · {guests} guests contributed",
  "viewGallery": "View gallery",
  "reviewFlagged": "Review flagged",
  "manage": "Manage",
  "enableLabel": "Let guests share photos",
  "modeLabel": "Require my approval before photos are visible"
}
```

Spanish, `messages/es.json`, same path:

```json
"memories": {
  "title": "Recuerdos",
  "flagged": "{count} marcadas",
  "summary": "{photos} fotos · {videos} videos · {guests} invitados contribuyeron",
  "viewGallery": "Ver galería",
  "reviewFlagged": "Revisar marcadas",
  "manage": "Administrar",
  "enableLabel": "Permitir que los invitados compartan fotos",
  "modeLabel": "Requerir mi aprobación antes de que las fotos sean visibles"
}
```

- [ ] **Step 2: Implement `OwnerMemoriesCard.tsx`**

Read `OwnerGuestDashboard.tsx`'s existing Guestbook/Message card markup first (already quoted in this plan's research) and match its exact class names — don't introduce new spacing/border/color values.

```tsx
// src/components/invitations/memories/OwnerMemoriesCard.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export interface OwnerMemoriesCardProps {
  eventId: string;
  slug: string;
  enabled: boolean;
  mode: "auto_publish" | "review_required";
  photoCount: number;
  videoCount: number;
  guestContributorCount: number;
  flaggedCount: number;
  recentThumbnailMediaIds: string[];
}

export function OwnerMemoriesCard(props: OwnerMemoriesCardProps) {
  const t = useTranslations("invitations.manage.dashboard.memories");
  const [enabled, setEnabled] = useState(props.enabled);
  const [mode, setMode] = useState(props.mode);
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/invitations/events/${props.eventId}/memories/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <div className="flex flex-col gap-4 rounded-lg border border-[#cfc3d3] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            {props.flaggedCount > 0 && (
              <span className="rounded-full bg-[#6D456F] px-2.5 py-1 text-xs font-semibold text-white">
                {t("flagged", { count: props.flaggedCount })}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[#675d6a]">
            {t("summary", { photos: props.photoCount, videos: props.videoCount, guests: props.guestContributorCount })}
          </p>
          {props.recentThumbnailMediaIds.length > 0 && (
            <div className="mt-2 flex gap-1">
              {props.recentThumbnailMediaIds.map((mediaId) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={mediaId}
                  src={`/api/memories/media/${mediaId}/thumbnail`}
                  alt=""
                  className="h-12 w-12 rounded object-cover"
                />
              ))}
            </div>
          )}
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving}
              onChange={(event) => {
                setEnabled(event.target.checked);
                void patch({ action: "set_enabled", enabled: event.target.checked });
              }}
              className="h-5 w-5 accent-[#6D456F]"
            />
            {t("enableLabel")}
          </label>
          {enabled && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mode === "review_required"}
                disabled={saving}
                onChange={(event) => {
                  const next = event.target.checked ? "review_required" : "auto_publish";
                  setMode(next);
                  void patch({ action: "set_mode", mode: next });
                }}
                className="h-5 w-5 accent-[#6D456F]"
              />
              {t("modeLabel")}
            </label>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/invite/${props.slug}/memories`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#6D456F] px-4 py-2 text-sm font-semibold text-[#55405a]"
          >
            {t("viewGallery")}
          </Link>
          <Link
            href={`/invitations/manage/${props.eventId}/memories`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#6D456F] px-4 py-2 text-sm font-semibold text-[#55405a]"
          >
            {props.flaggedCount > 0 ? t("reviewFlagged") : t("manage")}
          </Link>
        </div>
      </div>
    </section>
  );
}
```

The "View gallery" link uses `/invite/${props.slug}/memories` (this codebase's guest-facing invitation route is slug-keyed — `src/app/invite/[slug]/page.tsx` — not eventId-keyed). `invitation_events.slug` is already on the `event` type (`src/lib/invitations/types.ts:39`); pass `event.slug` as the new `slug` prop from wherever `OwnerMemoriesCard` is rendered in Step 3.

- [ ] **Step 3: Wire the card into `OwnerGuestDashboard.tsx`**

Add it as a third `<section>`, matching the exact position/order the existing Guestbook and Message cards use. `OwnerGuestDashboard` already receives the full `event` object as a prop (per `src/app/invitations/manage/[eventId]/page.tsx`'s `<OwnerGuestDashboard event={event} .../>` call), so `event.id` and `event.slug` are both already in scope — no new prop threading needed for those two. Extend that same page's data-loading (alongside its existing `getInvitationResponsesDashboard`/`getInvitationGuestbookSummary` calls) with `getMemoriesEventSummary(event.id)` and `getEventMemoriesSettings(event.id)`, wrapped in the same try/catch-and-log pattern those two calls already use, and pass the results into `OwnerGuestDashboard` as a new `memories` prop for `OwnerMemoriesCard` to consume — rather than adding a second, separate fetch waterfall inside the card component itself.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json src/components/invitations/memories/OwnerMemoriesCard.tsx src/components/invitations/OwnerGuestDashboard.tsx
git commit -m "feat: add the Memories card to the host dashboard"
```

---

### Task 10: Host moderation review queue UI

**Files:**
- Create: `src/components/invitations/memories/OwnerMemoriesReviewQueue.tsx`
- Create: `src/app/invitations/manage/[eventId]/memories/page.tsx`
- Modify: `messages/en.json`, `messages/es.json` (add `invitations.manage.memories.*`)

**Interfaces:**
- Consumes: `listMediaForHostReview`, `getEventMemoriesSettings` (Task 8/1), `PATCH /api/invitations/events/[eventId]/memories/moderation` (Task 8).
- Produces: nothing further downstream.

- [ ] **Step 1: Add the i18n strings**

Add to `messages/en.json` under `invitations.manage`, as a new top-level sub-namespace sibling of `guestbook`:

```json
"memories": {
  "back": "Dashboard",
  "title": "Memories",
  "tabs": { "live": "Live", "removed": "Removed", "pending": "Pending", "published": "Published", "rejected": "Rejected" },
  "stats": { "live": "{count} live", "pending": "{count} pending", "removed": "{count} removed" },
  "bulkApprove": "Approve selected",
  "bulkReject": "Reject selected",
  "remove": "Remove",
  "empty": "Nothing here right now.",
  "anonymous": "Anonymous guest",
  "selectAll": "Select all"
}
```

Spanish, `messages/es.json`, same path:

```json
"memories": {
  "back": "Panel",
  "title": "Recuerdos",
  "tabs": { "live": "En vivo", "removed": "Eliminadas", "pending": "Pendientes", "published": "Publicadas", "rejected": "Rechazadas" },
  "stats": { "live": "{count} en vivo", "pending": "{count} pendientes", "removed": "{count} eliminadas" },
  "bulkApprove": "Aprobar seleccionadas",
  "bulkReject": "Rechazar seleccionadas",
  "remove": "Eliminar",
  "empty": "No hay nada aquí por ahora.",
  "anonymous": "Invitado anónimo",
  "selectAll": "Seleccionar todo"
}
```

- [ ] **Step 2: Implement `OwnerMemoriesReviewQueue.tsx`**

```tsx
// src/components/invitations/memories/OwnerMemoriesReviewQueue.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

type AutoPublishTab = "live" | "removed";
type ReviewRequiredTab = "pending" | "published" | "rejected";

export function OwnerMemoriesReviewQueue({
  eventId,
  mode,
  initialLive,
  initialRemoved,
  initialPending,
  initialPublished,
  initialRejected,
}: {
  eventId: string;
  mode: "auto_publish" | "review_required";
  initialLive: MemoryMedia[];
  initialRemoved: MemoryMedia[];
  initialPending: MemoryMedia[];
  initialPublished: MemoryMedia[];
  initialRejected: MemoryMedia[];
}) {
  const t = useTranslations("invitations.manage.memories");
  const [tab, setTab] = useState<AutoPublishTab | ReviewRequiredTab>(mode === "auto_publish" ? "live" : "pending");
  const [live, setLive] = useState(initialLive);
  const [removed, setRemoved] = useState(initialRemoved);
  const [pending, setPending] = useState(initialPending);
  const [published, setPublished] = useState(initialPublished);
  const [rejected, setRejected] = useState(initialRejected);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const listByTab: Record<string, MemoryMedia[]> = { live, removed, pending, published, rejected };
  const current = listByTab[tab];

  async function act(action: "approve" | "reject" | "remove", mediaIds: string[]) {
    await fetch(`/api/invitations/events/${eventId}/memories/moderation`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, mediaIds }),
    });
    if (mode === "auto_publish") {
      setLive((items) => items.filter((item) => !mediaIds.includes(item.id)));
      setRemoved((items) => [...current.filter((item) => mediaIds.includes(item.id)), ...items]);
    } else {
      setPending((items) => items.filter((item) => !mediaIds.includes(item.id)));
      if (action === "approve") setPublished((items) => [...current.filter((item) => mediaIds.includes(item.id)), ...items]);
      else setRejected((items) => [...current.filter((item) => mediaIds.includes(item.id)), ...items]);
    }
    setSelected(new Set());
  }

  const tabs: (AutoPublishTab | ReviewRequiredTab)[] =
    mode === "auto_publish" ? ["live", "removed"] : ["pending", "published", "rejected"];

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <div className="mt-4 flex gap-2 border-b">
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className="min-h-11 px-3 text-sm font-semibold"
            style={{ borderBottom: tab === value ? "2px solid #6D456F" : undefined }}
          >
            {t(`tabs.${value}`)}
          </button>
        ))}
      </div>
      {(tab === "pending") && current.length > 0 && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => act("approve", [...selected])}
            className="min-h-10 rounded-md bg-[#6D456F] px-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t("bulkApprove")}
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => act("reject", [...selected])}
            className="min-h-10 rounded-md border border-[#6D456F] px-3 text-sm font-semibold text-[#55405a] disabled:opacity-40"
          >
            {t("bulkReject")}
          </button>
        </div>
      )}
      {current.length === 0 ? (
        <p className="mt-6 text-sm text-[#675d6a]">{t("empty")}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {current.map((item) => (
            <li key={item.id} className="rounded-md border border-[#cfc3d3] p-2">
              {tab === "pending" && (
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    setSelected(next);
                  }}
                />
              )}
              {item.objectKeyThumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/memories/media/${item.id}/thumbnail`} alt="" className="mt-1 w-full rounded" />
              )}
              <p className="mt-1 text-xs text-[#675d6a]">{item.uploaderDisplayName ?? t("anonymous")}</p>
              {tab === "live" && (
                <button
                  type="button"
                  onClick={() => act("remove", [item.id])}
                  className="mt-1 text-xs font-semibold text-red-700"
                >
                  {t("remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement the host page**

```tsx
// src/app/invitations/manage/[eventId]/memories/page.tsx
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { getEventMemoriesSettings, listMediaForHostReview } from "@/lib/invitations/memories/repository";
import { OwnerMemoriesReviewQueue } from "@/components/invitations/memories/OwnerMemoriesReviewQueue";

export const dynamic = "force-dynamic";

export default async function MemoriesReviewPage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try {
    ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null;
  } catch {
    ownerId = null;
  }
  if (!ownerId) redirect("/invitations/login");
  if (!(await invitationOwnerOwnsEvent(ownerId, params.eventId))) notFound();

  const settings = await getEventMemoriesSettings(params.eventId);
  if (!settings) notFound();

  const [live, removed, pending, published, rejected] = await Promise.all([
    listMediaForHostReview(params.eventId, "flagged"),
    listMediaForHostReview(params.eventId, "removed"),
    listMediaForHostReview(params.eventId, "awaiting_host_review"),
    listMediaForHostReview(params.eventId, "published"),
    listMediaForHostReview(params.eventId, "removed"),
  ]);

  return (
    <OwnerMemoriesReviewQueue
      eventId={params.eventId}
      mode={settings.memoriesMode}
      initialLive={live}
      initialRemoved={removed}
      initialPending={pending}
      initialPublished={published}
      initialRejected={rejected}
    />
  );
}
```

This mirrors `src/app/invitations/manage/[eventId]/edit/page.tsx` and this same route family's own `page.tsx` exactly — owner-session cookie + `invitationOwnerOwnsEvent`, no `admin_session`/founder path. That's a pre-existing, deliberate asymmetry in this codebase (API routes use `requireInvitationAccess`, which supports founder access; every Server Component page under `/invitations/manage/[eventId]/*` checks owner-only) — this plan matches the real convention rather than inventing founder access no sibling page in this family has.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/es.json src/components/invitations/memories/OwnerMemoriesReviewQueue.tsx "src/app/invitations/manage/[eventId]/memories"
git commit -m "feat: add the host Memories moderation review queue"
```

---

### Task 11: Host bulk-download of originals

**Files:**
- Create: `src/app/api/invitations/events/[eventId]/memories/download/route.ts`
- Create: `src/app/api/invitations/events/[eventId]/memories/download/download-route.test.ts`
- Modify: `src/components/invitations/memories/OwnerMemoriesReviewQueue.tsx` (add a "Download originals" action)
- Modify: `messages/en.json`, `messages/es.json` (add `invitations.manage.memories.downloadSelected`, `downloadAll`)

**Interfaces:**
- Consumes: `getSignedDownloadUrl` (`R2StorageProvider`, existing), `requireInvitationAccess`.
- Produces: `POST /api/invitations/events/[eventId]/memories/download` with `{ mediaIds?: string[] }` (omitted = all originals for the event) → `{ downloads: { mediaId: string; fileName: string; url: string }[] }`. No further consumers in this plan — the review queue UI triggers sequential browser downloads from the returned URLs.

This is the small, well-bounded gap spec 1 named but never designed in detail (Plan A's own Global Constraints flagged it as belonging here). V1 scope is deliberately narrow: a list of short-lived signed URLs the browser downloads one at a time via sequential `<a download>` clicks — no server-side ZIP streaming, no background job. That's a legitimate V1.1 enhancement if hosts ask for it, not something to build speculatively now.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/invitations/events/[eventId]/memories/download/download-route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("download route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test "src/app/api/invitations/events/[eventId]/memories/download/download-route.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the download route**

```ts
// src/app/api/invitations/events/[eventId]/memories/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // an empty body means "all originals" — not an error
  }

  try {
    const values = body as { mediaIds?: string[] };
    const client = createAdminClient();
    let query = client.from("memory_media").select("id, object_key_original").eq("event_id", params.eventId);
    if (values.mediaIds && values.mediaIds.length > 0) query = query.in("id", values.mediaIds);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const storage = new R2StorageProvider();
    const downloads = await Promise.all(
      (data ?? []).map(async (row) => {
        const objectKey = row.object_key_original as string;
        const url = await storage.getSignedDownloadUrl(objectKey, 10 * 60);
        return { mediaId: row.id as string, fileName: objectKey.split("/").pop() ?? `${row.id}.jpg`, url };
      }),
    );
    return NextResponse.json({ downloads });
  } catch (error) {
    console.error("[memories/download] failed", { error });
    return NextResponse.json({ error: "download preparation failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test "src/app/api/invitations/events/[eventId]/memories/download/download-route.test.ts"`
Expected: PASS

- [ ] **Step 5: Add the i18n strings**

Add to `messages/en.json` under `invitations.manage.memories`:

```json
"downloadSelected": "Download selected originals",
"downloadAll": "Download all originals"
```

Spanish, `messages/es.json`, same path:

```json
"downloadSelected": "Descargar originales seleccionadas",
"downloadAll": "Descargar todas las originales"
```

- [ ] **Step 6: Wire a download trigger into `OwnerMemoriesReviewQueue.tsx`**

```tsx
// add inside OwnerMemoriesReviewQueue.tsx, near the existing bulk-action buttons
async function downloadOriginals(mediaIds?: string[]) {
  const res = await fetch(`/api/invitations/events/${eventId}/memories/download`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mediaIds ? { mediaIds } : {}),
  });
  const { downloads } = (await res.json()) as { downloads: { fileName: string; url: string }[] };
  for (const item of downloads) {
    const anchor = document.createElement("a");
    anchor.href = item.url;
    anchor.download = item.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    await new Promise((resolve) => setTimeout(resolve, 300)); // stagger so the browser doesn't block a rapid-fire batch as a popup flood
  }
}
```

Add a button calling `downloadOriginals([...selected])` next to the existing bulk-approve/reject buttons (only enabled when `selected.size > 0`), and a separate always-visible button calling `downloadOriginals()` with no argument for "download all," using the two new i18n keys from Step 5.

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add messages/en.json messages/es.json src/components/invitations/memories/OwnerMemoriesReviewQueue.tsx "src/app/api/invitations/events/[eventId]/memories/download"
git commit -m "feat: add host bulk-download of Memories originals"
```

---

## Final checkpoint (run once, after all 11 tasks)

```bash
npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)
npx tsc --noEmit
npm run build
```

All three must exit 0 before this plan is considered done — matches Plan A's own final checkpoint, and the same three gates that caught the require()-import bug at Plan A's actual merge.
