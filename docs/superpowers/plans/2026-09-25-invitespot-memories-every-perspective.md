# InviteSpot Memories — "Every Perspective" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the shared guest `MediaLightbox`, show an overlay strip of other gallery-visible media from the same event captured within ±3 minutes of the currently-displayed item ("N others captured this moment"), so guests can see everyone's angle on a moment.

**Architecture:** A pure time-window matching function plus a thin DB lookup (`src/lib/invitations/memories/nearby-media.ts`) power a new read-only API route (`GET /api/memories/media/[mediaId]/nearby`). `MediaLightbox.tsx` fetches that route whenever its displayed item changes, renders the results as an overlay strip, and — for the one case where a tapped match isn't already in the lightbox's own list (an AI Highlights category) — enters a self-contained "detour" that pages through the matched cluster instead.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (`memory_media` table, no schema change), `tsx --test`, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-25-invitespot-memories-every-perspective-design.md`

## Global Constraints

- No new database schema — `memory_media.captured_at` (backfilled by migration 060) is the only signal used.
- No new AWS/AI infrastructure of any kind.
- Matching window is a fixed constant: **3 minutes (180,000 ms)**. Not configurable.
- Matching does **not** exclude the viewing guest's own uploads.
- A `route.ts` file may only export HTTP method handlers plus framework config constants — any other export fails `npm run build` (not caught by `tsc --noEmit`). Any logic beyond a handler goes in a sibling file the route imports and calls. Run `npm run build` (not just `tsc --noEmit`) before any task touching a `route.ts` file is considered done.
- `tsx --test` silently matches 0 files (exit 0) against a literal path containing a bracketed segment like `[mediaId]` — run such a test file's suite either via a single-quoted recursive glob (`'src/**/*.test.ts'`) or by `cd`-ing into the file's own directory and using the bare filename.
- Scope is Gallery and AI Highlights lightbox usages only. `GuestMomentsView.tsx` has no lightbox wired in at all today (a pre-existing gap) — this plan does not add one.

---

### Task 1: Nearby-matching library (`nearby-media.ts`)

**Files:**
- Create: `src/lib/invitations/memories/nearby-media.ts`
- Create: `src/lib/invitations/memories/nearby-media.test.ts`

**Interfaces:**
- Consumes: `computeGalleryVisible`, `listGalleryVisibleMedia`, `toPublicMemoryMedia`, `type PublicMemoryMedia` from `./gallery`; `getMemoryMediaById` from `./repository`.
- Produces: `NEARBY_WINDOW_MS: number`, `findNearbyMatches(target: PublicMemoryMedia, candidates: PublicMemoryMedia[], windowMs: number): PublicMemoryMedia[]`, `getNearbyMedia(mediaId: string): Promise<PublicMemoryMedia[] | null>` — all consumed by Task 2's route.

- [ ] **Step 1: Write the failing tests for `findNearbyMatches`**

Create `src/lib/invitations/memories/nearby-media.test.ts`:

```ts
// src/lib/invitations/memories/nearby-media.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { findNearbyMatches, getNearbyMedia, NEARBY_WINDOW_MS } from "./nearby-media";
import type { PublicMemoryMedia } from "./gallery";

const ANCHOR_TIME = "2026-09-24T22:08:00.000Z";

function media(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: `display/${id}.webp`,
    objectKeyThumbnail: `thumb/${id}.webp`,
    capturedAt: ANCHOR_TIME,
    uploadedAt: ANCHOR_TIME,
    ...overrides,
  };
}

test("NEARBY_WINDOW_MS is 3 minutes", () => {
  assert.equal(NEARBY_WINDOW_MS, 3 * 60 * 1000);
});

test("includes a candidate captured before the target, within the window", () => {
  const target = media("anchor");
  const before = media("before", { capturedAt: "2026-09-24T22:06:00.000Z" });
  const result = findNearbyMatches(target, [before], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["before"]);
});

test("includes a candidate captured after the target, within the window", () => {
  const target = media("anchor");
  const after = media("after", { capturedAt: "2026-09-24T22:10:00.000Z" });
  const result = findNearbyMatches(target, [after], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["after"]);
});

test("includes a candidate exactly at the window boundary", () => {
  const target = media("anchor");
  const boundary = media("boundary", { capturedAt: "2026-09-24T22:11:00.000Z" });
  const result = findNearbyMatches(target, [boundary], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["boundary"]);
});

test("excludes a candidate just past the window boundary", () => {
  const target = media("anchor");
  const tooFar = media("too-far", { capturedAt: "2026-09-24T22:11:00.001Z" });
  const result = findNearbyMatches(target, [tooFar], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("excludes the target itself even though its own delta is zero", () => {
  const target = media("anchor");
  const result = findNearbyMatches(target, [target], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("excludes a candidate with no capturedAt", () => {
  const target = media("anchor");
  const noTimestamp = media("no-ts", { capturedAt: null });
  const result = findNearbyMatches(target, [noTimestamp], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("returns nothing when the target itself has no capturedAt", () => {
  const target = media("anchor", { capturedAt: null });
  const other = media("other");
  const result = findNearbyMatches(target, [other], NEARBY_WINDOW_MS);
  assert.deepEqual(result, []);
});

test("sorts multiple matches nearest-first, regardless of input order", () => {
  const target = media("anchor");
  const far = media("far", { capturedAt: "2026-09-24T22:10:30.000Z" });
  const near = media("near", { capturedAt: "2026-09-24T22:08:10.000Z" });
  const result = findNearbyMatches(target, [far, near], NEARBY_WINDOW_MS);
  assert.deepEqual(result.map((m) => m.id), ["near", "far"]);
});

test("returns an empty array when there are no candidates", () => {
  const target = media("anchor");
  assert.deepEqual(findNearbyMatches(target, [], NEARBY_WINDOW_MS), []);
});

// createAdminClient() has no injection seam and this test environment has no
// live Supabase credentials wired up (see repository.test.ts's own header
// comment and repository-missing-descriptors-rpc.integration.test.ts) — every
// test in this module touching a createAdminClient()-backed function asserts
// on its source instead of invoking it, matching that established convention.
test("getNearbyMedia looks up the anchor, gates on gallery-visibility, and matches against the event's gallery-visible pool", () => {
  const source = getNearbyMedia.toString();
  assert.match(source, /getMemoryMediaById/);
  assert.match(source, /computeGalleryVisible/);
  assert.match(source, /listGalleryVisibleMedia/);
  assert.match(source, /findNearbyMatches/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd src/lib/invitations/memories && npx tsx --test nearby-media.test.ts
```

Expected: FAIL — `nearby-media.ts` doesn't exist yet (`Cannot find module './nearby-media'`).

- [ ] **Step 3: Implement `nearby-media.ts`**

Create `src/lib/invitations/memories/nearby-media.ts`:

```ts
// src/lib/invitations/memories/nearby-media.ts
//
// "Every Perspective": surfaces other gallery-visible media from the same
// event captured around the same instant as a given item, so a guest
// viewing one photo/video can see what other guests captured of the same
// moment. Matching is a pure capture-time window — it doesn't depend on the
// host having configured Moments, or on AI Highlights having run — because
// every memory_media row has captured_at populated (see migration 060:
// EXIF when present, else upload time, never null).
import { computeGalleryVisible, listGalleryVisibleMedia, toPublicMemoryMedia, type PublicMemoryMedia } from "./gallery";
import { getMemoryMediaById } from "./repository";

export const NEARBY_WINDOW_MS = 3 * 60 * 1000;

// Pure and exhaustively unit-tested: given a target item and a pool of
// candidates (already fetched, already gallery-visible), returns the ones
// within windowMs of the target's capturedAt, nearest first. Excludes the
// target itself by id. A candidate (or the target) with no capturedAt is
// never considered a match — there's no instant to compare against.
export function findNearbyMatches(
  target: PublicMemoryMedia,
  candidates: PublicMemoryMedia[],
  windowMs: number,
): PublicMemoryMedia[] {
  if (!target.capturedAt) return [];
  const targetTime = Date.parse(target.capturedAt);
  if (!Number.isFinite(targetTime)) return [];

  return candidates
    .filter((candidate) => candidate.id !== target.id && candidate.capturedAt)
    .map((candidate) => ({ candidate, delta: Math.abs(Date.parse(candidate.capturedAt as string) - targetTime) }))
    .filter(({ delta }) => Number.isFinite(delta) && delta <= windowMs)
    .sort((a, b) => a.delta - b.delta)
    .map(({ candidate }) => candidate);
}

// DB-backed lookup the API route (Task 2) calls. Returns null when the
// anchor media doesn't exist or isn't gallery-visible — mirrors
// [mediaId]/[variant]/route.ts's own 404 gate; the route maps this to a 404.
// Reuses listGalleryVisibleMedia (gallery.ts) for the candidate pool rather
// than duplicating its query, so this function's own DB footprint is just
// the anchor lookup plus one already-relied-upon existing call.
export async function getNearbyMedia(mediaId: string): Promise<PublicMemoryMedia[] | null> {
  const media = await getMemoryMediaById(mediaId);
  if (!media || !computeGalleryVisible(media)) return null;

  const candidates = await listGalleryVisibleMedia(media.eventId);
  return findNearbyMatches(toPublicMemoryMedia(media), candidates.map(toPublicMemoryMedia), NEARBY_WINDOW_MS);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd src/lib/invitations/memories && npx tsx --test nearby-media.test.ts
```

Expected: PASS, all 11 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/nearby-media.ts src/lib/invitations/memories/nearby-media.test.ts
git commit -m "feat: add nearby-media time-window matching for Every Perspective"
```

---

### Task 2: API route (`GET /api/memories/media/[mediaId]/nearby`)

**Files:**
- Create: `src/app/api/memories/media/[mediaId]/nearby/route.ts`
- Create: `src/app/api/memories/media/[mediaId]/nearby/nearby-route.test.ts`

**Interfaces:**
- Consumes: `getNearbyMedia` from `@/lib/invitations/memories/nearby-media` (Task 1).
- Produces: `GET` handler returning `{ media: PublicMemoryMedia[] }` (200) or `{ error: "not found" }` (404) — consumed by Task 4's `MediaLightbox.tsx` fetch.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/memories/media/[mediaId]/nearby/nearby-route.test.ts` — following the existing sibling `[mediaId]/[variant]/media-route.test.ts`'s own structural-test convention (no live DB call, no HTTP server spun up):

```ts
// src/app/api/memories/media/[mediaId]/nearby/nearby-route.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("nearby media route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});

test("delegates to getNearbyMedia and returns 404 when it resolves null, otherwise the media list", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /getNearbyMedia\(params\.mediaId\)/);
  assert.match(source, /status:\s*404/);
  assert.match(source, /NextResponse\.json\(\{\s*media:/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/app/api/memories/media/[mediaId]/nearby && npx tsx --test nearby-route.test.ts
```

Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Implement the route**

Create `src/app/api/memories/media/[mediaId]/nearby/route.ts`:

```ts
// src/app/api/memories/media/[mediaId]/nearby/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getNearbyMedia } from "@/lib/invitations/memories/nearby-media";

export async function GET(_request: NextRequest, { params }: { params: { mediaId: string } }) {
  const nearby = await getNearbyMedia(params.mediaId);
  if (nearby === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ media: nearby });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd src/app/api/memories/media/[mediaId]/nearby && npx tsx --test nearby-route.test.ts
```

Expected: PASS, both tests.

- [ ] **Step 5: Full production build**

This is a `route.ts` file — `tsc --noEmit` alone does not catch an invalid export shape here.

```bash
npm run build
```

Expected: exit 0, and the route table lists `/api/memories/media/[mediaId]/nearby`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/memories/media/\[mediaId\]/nearby/route.ts src/app/api/memories/media/\[mediaId\]/nearby/nearby-route.test.ts
git commit -m "feat: add GET /api/memories/media/[mediaId]/nearby route"
```

---

### Task 3: `resolveNearbyTap` pure decision function

**Files:**
- Modify: `src/components/invitations/memories/MediaLightbox.tsx`
- Modify: `src/components/invitations/memories/MediaLightbox.test.ts` (note: `.test.ts`, not `.test.tsx` — this is the existing dedicated file for `MediaLightbox.tsx`'s pure, DOM-free exports; it already tests `resolveSwipeNavigation` this way, for the same reason: jsdom has no real `PointerEvent`, so pure decision logic is tested directly instead of through simulated gestures. The separate `MediaLightbox.test.tsx` is for full DOM-mounted integration tests and is not touched by this task.)

**Interfaces:**
- Consumes: `PublicMemoryMedia` (type-only import, needed for the new `mediaItem` test fixture below).
- Produces: `resolveNearbyTap(currentMedia: PublicMemoryMedia[], tappedId: string, nearbyCluster: PublicMemoryMedia[]): { mode: "list"; index: number } | { mode: "detour"; media: PublicMemoryMedia[]; index: number } | null` — consumed by Task 4's `handleNearbyTap`.

This task adds only the pure function and its tests, exported alongside the existing `resolveSwipeNavigation` — it is not yet wired into the component's rendering or event handlers (that's Task 4). This keeps the decision logic itself independently reviewable before the larger integration.

- [ ] **Step 1: Write the failing tests**

`MediaLightbox.test.ts` currently only imports `resolveSwipeNavigation` and exercises it with plain numbers (no `PublicMemoryMedia` fixtures yet, since that function doesn't need any). Replace the top of the file to add the new import and a small fixture helper, then append the new tests:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveNearbyTap, resolveSwipeNavigation } from "./MediaLightbox";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";

// resolveSwipeNavigation is pure and DOM-free by design specifically so it
// can be tested directly — jsdom has no Touch or PointerEvent constructors,
// so simulating a real swipe gesture end-to-end isn't possible in this test
// environment. See MediaLightbox.tsx's own comment on this function.
```

(Keep every existing `resolveSwipeNavigation` test below that unchanged.) Then add, at the end of the file:

```ts
function mediaItem(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: `display/${id}.webp`,
    objectKeyThumbnail: `thumb/${id}.webp`,
    capturedAt: "2026-09-24T22:08:00.000Z",
    uploadedAt: "2026-09-24T22:08:00.000Z",
    ...overrides,
  };
}

test("resolveNearbyTap: a tapped id already in the current list resolves to list mode at its index", () => {
  const currentMedia = [mediaItem("a"), mediaItem("b"), mediaItem("c")];
  const result = resolveNearbyTap(currentMedia, "b", [mediaItem("b"), mediaItem("z")]);
  assert.deepEqual(result, { mode: "list", index: 1 });
});

test("resolveNearbyTap: a tapped id outside the current list resolves to detour mode using the supplied cluster", () => {
  const currentMedia = [mediaItem("a"), mediaItem("b")];
  const cluster = [mediaItem("a"), mediaItem("z")];
  const result = resolveNearbyTap(currentMedia, "z", cluster);
  assert.deepEqual(result, { mode: "detour", media: cluster, index: 1 });
});

test("resolveNearbyTap: prefers the current list over the cluster when a tapped id happens to be in both", () => {
  const currentMedia = [mediaItem("a"), mediaItem("b")];
  const cluster = [mediaItem("b"), mediaItem("z")];
  const result = resolveNearbyTap(currentMedia, "b", cluster);
  assert.deepEqual(result, { mode: "list", index: 1 });
});

test("resolveNearbyTap: returns null when the tapped id is in neither the current list nor the cluster", () => {
  const currentMedia = [mediaItem("a")];
  const result = resolveNearbyTap(currentMedia, "ghost", [mediaItem("z")]);
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd src/components/invitations/memories && npx tsx --test MediaLightbox.test.ts
```

Expected: FAIL — `resolveNearbyTap` is not exported yet.

- [ ] **Step 3: Implement `resolveNearbyTap`**

In `src/components/invitations/memories/MediaLightbox.tsx`, add this export directly below the existing `resolveSwipeNavigation` function (same file, same style — a plain pure export, no component state involved):

```ts
// Pure decision for tapping a thumbnail in the "Every Perspective" nearby
// strip: is the tapped item already part of the list the lightbox is
// currently paging through (the common case — Gallery and AI Highlights
// almost always already loaded the tapped item's own list), or does it live
// outside that list (only possible from inside an AI Highlights category,
// whose list is scoped to that category's members)? In the second case the
// caller starts a "detour" — nearbyCluster must already include the anchor
// item the guest detoured from, so the detour is browsable back to where it
// started; assembling that cluster is the caller's job, not this function's.
export function resolveNearbyTap(
  currentMedia: PublicMemoryMedia[],
  tappedId: string,
  nearbyCluster: PublicMemoryMedia[],
): { mode: "list"; index: number } | { mode: "detour"; media: PublicMemoryMedia[]; index: number } | null {
  const listIndex = currentMedia.findIndex((item) => item.id === tappedId);
  if (listIndex !== -1) return { mode: "list", index: listIndex };

  const detourIndex = nearbyCluster.findIndex((item) => item.id === tappedId);
  if (detourIndex !== -1) return { mode: "detour", media: nearbyCluster, index: detourIndex };

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd src/components/invitations/memories && npx tsx --test MediaLightbox.test.ts
```

Expected: PASS, including all pre-existing `resolveSwipeNavigation` tests in this file (unchanged behavior — this step only adds a new export and its own tests).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/invitations/memories/MediaLightbox.tsx src/components/invitations/memories/MediaLightbox.test.ts
git commit -m "feat: add resolveNearbyTap decision function to MediaLightbox"
```

---

### Task 4: Wire the nearby strip and detour mode into `MediaLightbox`

**Files:**
- Modify: `src/components/invitations/memories/MediaLightbox.tsx`
- Modify: `src/components/invitations/memories/MediaLightbox.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `resolveNearbyTap` (Task 3, same file), `GET /api/memories/media/[mediaId]/nearby` (Task 2).
- Produces: no new external interface — this is the leaf task that makes the feature visible to guests.

- [ ] **Step 1: Add the i18n keys**

In `messages/en.json`, inside `invitations.public.memories.lightbox` (currently `close`/`previous`/`next`/`viewerLabel`), add two keys:

```json
"lightbox": {
  "close": "Close",
  "previous": "Previous photo",
  "next": "Next photo",
  "viewerLabel": "Photo {current} of {total}",
  "nearbyCount": "{count, plural, one {# other captured this moment} other {# others captured this moment}}",
  "nearbyDetourLabel": "Browsing nearby moment · {current} of {total}"
}
```

In `messages/es.json`, the equivalent block:

```json
"lightbox": {
  "close": "Cerrar",
  "previous": "Foto anterior",
  "next": "Foto siguiente",
  "viewerLabel": "Foto {current} de {total}",
  "nearbyCount": "{count, plural, one {# persona más capturó este momento} other {# personas más capturaron este momento}}",
  "nearbyDetourLabel": "Viendo un momento cercano · {current} de {total}"
}
```

- [ ] **Step 2: Update the test harness to support a fetch stub**

`MediaLightbox.test.tsx`'s `withMountedLightbox` currently has no `fetch` in its `GLOBAL_KEYS` list or `Object.assign` block — once Step 4 below adds an unconditional fetch-on-mount effect to the component, every existing test in this file would throw with `fetch is not defined` unless the harness always provides one. Update it now, before touching the component, so this step's own diff is purely test-infrastructure:

Replace the `GLOBAL_KEYS` constant:

```ts
const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "HTMLImageElement", "HTMLVideoElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;
```

Add, near the top of the file (alongside the existing `flush` helper):

```ts
type FetchCall = { url: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
```

Replace the `withMountedLightbox` function with a version that accepts an optional `fetchImpl` (defaulting to "no nearby matches", so every pre-existing call site in this file — which doesn't pass a 4th argument — keeps working unchanged) and passes `calls` through to the callback's context:

```ts
async function withMountedLightbox(
  media: PublicMemoryMedia[],
  initialIndex: number,
  callback: (ctx: { dom: JSDOM; calls: FetchCall[] }) => Promise<void>,
  fetchImpl: (url: string) => Promise<Response> = async () => jsonResponse({ media: [] }),
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "https://invite.example.test",
    virtualConsole: quietVirtualConsole(),
  });
  polyfillAnimationFrame(dom);
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const calls: FetchCall[] = [];
  const trackingFetch = async (input: RequestInfo | URL) => {
    calls.push({ url: String(input) });
    return fetchImpl(String(input));
  };

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    HTMLVideoElement: dom.window.HTMLVideoElement,
    Event: dom.window.Event,
    fetch: trackingFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { MediaLightbox } = await import("./MediaLightbox");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  function Harness() {
    const [index, setIndex] = React.useState(initialIndex);
    return <MediaLightbox media={media} index={index} onClose={() => {}} onNavigate={setIndex} />;
  }

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <Harness />
        </NextIntlClientProvider>,
      );
      await flush();
    });
    await callback({ dom, calls });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}
```

- [ ] **Step 3: Run the existing test suite to confirm it's still green with the harness change alone**

```bash
cd src/components/invitations/memories && npx tsx --test MediaLightbox.test.tsx
```

Expected: PASS — every existing test's callback destructures `{ dom }`, which still works when the object also carries `calls`; the component itself hasn't changed yet, so it never calls `fetch`.

- [ ] **Step 4: Write the failing tests for the strip and detour behavior**

Add to `MediaLightbox.test.tsx`:

```ts
test("shows the nearby strip with a count label when matches exist", async () => {
  const matches = [mediaItem("m2", { uploaderDisplayName: null })];
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom, calls }) => {
      assert.ok(calls.some((c) => c.url.endsWith("/api/memories/media/m1/nearby")), "expected a fetch to the nearby endpoint for the displayed item");
      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /1 other captured this moment/);
    },
    async () => jsonResponse({ media: matches }),
  );
});

test("shows no strip when there are no nearby matches", async () => {
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.doesNotMatch(text, /captured this moment/);
    },
    async () => jsonResponse({ media: [] }),
  );
});

test("shows an uploader caption under a nearby thumbnail only when the uploader gave a name", async () => {
  const matches = [mediaItem("named", { uploaderDisplayName: "Priya" }), mediaItem("anon", { uploaderDisplayName: null })];
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /Priya/);
      const thumbnails = dom.window.document.querySelectorAll('img[src^="/api/memories/media/"][src$="/thumbnail"]');
      assert.equal(thumbnails.length, 2);
    },
    async () => jsonResponse({ media: matches }),
  );
});

test("hides the nearby strip while a drag is in progress", async () => {
  await withMountedLightbox(
    [mediaItem("m1"), mediaItem("m2")],
    0,
    async ({ dom }) => {
      await flush();
      assert.match(dom.window.document.body.textContent ?? "", /1 other captured this moment/);

      const img = dom.window.document.querySelector(`img[src="/api/memories/media/m1/display"]`)!;
      img.dispatchEvent(pointerEvent(dom, "pointerdown", 200));
      img.dispatchEvent(pointerEvent(dom, "pointermove", 100));

      assert.doesNotMatch(dom.window.document.body.textContent ?? "", /captured this moment/, "expected the strip to hide mid-drag");

      img.dispatchEvent(pointerEvent(dom, "pointerup", 100));
      await flush(400);
    },
    async () => jsonResponse({ media: [mediaItem("m2")] }),
  );
});

test("tapping a nearby thumbnail already in the current list navigates via onNavigate, without a detour", async () => {
  await withMountedLightbox(
    [mediaItem("m1"), mediaItem("m2")],
    0,
    async ({ dom }) => {
      await flush();
      const thumbnailButton = dom.window.document.querySelector(`img[src="/api/memories/media/m2/thumbnail"]`)?.closest("button");
      assert.ok(thumbnailButton, "expected a tappable nearby thumbnail for m2");
      thumbnailButton!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      await flush(450);
      assert.match(dom.window.document.body.textContent ?? "", /Photo 2 of 2/);
    },
    async (url) => (url.endsWith("/m1/nearby") ? jsonResponse({ media: [mediaItem("m2")] }) : jsonResponse({ media: [] })),
  );
});

test("tapping a nearby thumbnail outside the current list starts a detour, with a distinct footer label", async () => {
  const outsideMatch = mediaItem("outside", { uploaderDisplayName: null });
  await withMountedLightbox(
    [mediaItem("m1")],
    0,
    async ({ dom }) => {
      await flush();
      const thumbnailButton = dom.window.document.querySelector(`img[src="/api/memories/media/outside/thumbnail"]`)?.closest("button");
      assert.ok(thumbnailButton, "expected a tappable nearby thumbnail for the outside match");
      thumbnailButton!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      await flush(450);
      assert.match(dom.window.document.body.textContent ?? "", /Browsing nearby moment · 2 of 2/);
      assert.ok(
        dom.window.document.querySelector(`img[src="/api/memories/media/outside/display"]`),
        "expected the lightbox to now display the detoured item",
      );
    },
    async (url) => {
      if (url.endsWith("/m1/nearby")) return jsonResponse({ media: [outsideMatch] });
      return jsonResponse({ media: [] });
    },
  );
});
```

- [ ] **Step 5: Run the tests to verify they fail**

```bash
cd src/components/invitations/memories && npx tsx --test MediaLightbox.test.tsx
```

Expected: FAIL — the component doesn't fetch or render anything nearby-related yet.

- [ ] **Step 6: Implement the strip, fetch/cache, and detour mode**

Replace the full contents of `src/components/invitations/memories/MediaLightbox.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";

export interface MediaLightboxProps {
  media: PublicMemoryMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const SWIPE_THRESHOLD_PX = 50;
// SSR-safe fallback only — real usage always computes this from the live
// viewport (see exitDistance below), since this component never renders
// during SSR (it's only ever mounted in response to a real click/tap).
const FALLBACK_EXIT_DISTANCE_PX = 600;
// Shared duration/easing for every post-release motion: the confirmed-swipe
// exit-then-reenter, and the cancelled-swipe bounce-back. 200ms with a flat
// ease-out read as an abrupt snap; this is closer to what photo-viewer apps
// use for a settle that still feels immediate rather than sluggish.
const SETTLE_DURATION_MS = 260;
const SETTLE_TRANSITION = `transform ${SETTLE_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;

// Pure swipe-gesture decision: given how far a horizontal drag traveled and
// where we are in the list, decide whether it clears the threshold to
// navigate, and which way. Exported and unit-tested directly rather than via
// simulated touch/pointer events — jsdom has no Touch or PointerEvent
// constructors, so a DOM-level test would only prove jsdom's own event
// plumbing, not this decision. Scoped automatically to whatever `media` list
// the caller passes in: a lightbox opened from inside an AI Highlight
// category only ever slides within that category's photos, never into a
// different category or the whole gallery.
export function resolveSwipeNavigation(deltaX: number, index: number, total: number): number | null {
  if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return null;
  if (deltaX < 0) return index < total - 1 ? index + 1 : null; // swiped left -> next
  return index > 0 ? index - 1 : null; // swiped right -> previous
}

// Pure decision for tapping a thumbnail in the "Every Perspective" nearby
// strip: is the tapped item already part of the list the lightbox is
// currently paging through (the common case — Gallery and AI Highlights
// almost always already loaded the tapped item's own list), or does it live
// outside that list (only possible from inside an AI Highlights category,
// whose list is scoped to that category's members)? In the second case the
// caller starts a "detour" — nearbyCluster must already include the anchor
// item the guest detoured from, so the detour is browsable back to where it
// started; assembling that cluster is the caller's job, not this function's.
export function resolveNearbyTap(
  currentMedia: PublicMemoryMedia[],
  tappedId: string,
  nearbyCluster: PublicMemoryMedia[],
): { mode: "list"; index: number } | { mode: "detour"; media: PublicMemoryMedia[]; index: number } | null {
  const listIndex = currentMedia.findIndex((item) => item.id === tappedId);
  if (listIndex !== -1) return { mode: "list", index: listIndex };

  const detourIndex = nearbyCluster.findIndex((item) => item.id === tappedId);
  if (detourIndex !== -1) return { mode: "detour", media: nearbyCluster, index: detourIndex };

  return null;
}

function exitDistance(): number {
  return (typeof window !== "undefined" ? window.innerWidth : FALLBACK_EXIT_DISTANCE_PX) + 100;
}

// Where navigateWithSlide is headed: either the next index within whatever
// list currently governs the lightbox (the original `media` prop, or an
// active detour's own cluster), or a brand-new detour cluster to switch into.
type NavigationTarget = { kind: "list"; index: number } | { kind: "detour"; media: PublicMemoryMedia[]; index: number };

// Shared full-screen photo/video viewer for every guest-facing photo grid (Gallery,
// AI Highlights, and any future one) — a photo is represented by a cropped
// thumbnail in its grid, but tapping it always shows the full, uncropped
// image (object-contain) here, with keyboard, on-screen prev/next, and
// touch/pointer swipe support. Also shows "Every Perspective": other
// gallery-visible media captured around the same instant as the item being
// viewed.
export function MediaLightbox({ media, index, onClose, onNavigate }: MediaLightboxProps) {
  const t = useTranslations("invitations.public.memories.lightbox");
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // True only for the single instant "jump to the opposite edge" reposition
  // between a photo exiting one side and the next one sliding in from the
  // other — never a real drag, but it needs the same "no transition" style.
  const [suppressTransition, setSuppressTransition] = useState(false);
  // Non-null while the guest has tapped a nearby-strip thumbnail that lives
  // outside the original `media` prop (only possible from inside an AI
  // Highlights category). While set, this — not the media/index props —
  // governs what's displayed and how prev/next/swipe behave. There is no
  // "return to the original list" interaction; closing the lightbox always
  // exits entirely, from either mode, matching how far a guest can already
  // wander via ordinary swipe/prev-next.
  const [detour, setDetour] = useState<{ media: PublicMemoryMedia[]; index: number } | null>(null);
  const dragStartX = useRef<number | null>(null);
  // number, not NodeJS.Timeout — this is always window.setTimeout (browser),
  // but bare ReturnType<typeof window.setTimeout> resolves ambiguously in a
  // mixed Node+DOM tsconfig, so the type is spelled out explicitly.
  const pendingTimeouts = useRef<number[]>([]);
  const pendingFrames = useRef<number[]>([]);
  // "Every Perspective": the other gallery-visible media captured within
  // NEARBY_WINDOW_MS of the currently-displayed item, keyed by that item's
  // id so navigating back and forth doesn't refetch what's already known.
  const nearbyCache = useRef<Map<string, PublicMemoryMedia[]>>(new Map());
  const [nearby, setNearby] = useState<PublicMemoryMedia[]>([]);

  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
      pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    };
  }, []);

  const activeMedia = detour ? detour.media : media;
  const activeIndex = detour ? detour.index : index;
  const item = activeMedia[activeIndex];

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const cached = nearbyCache.current.get(item.id);
    if (cached) {
      setNearby(cached);
      return;
    }
    setNearby([]);
    void fetch(`/api/memories/media/${item.id}/nearby`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`nearby ${response.status}`);
        return response.json() as Promise<{ media: PublicMemoryMedia[] }>;
      })
      .then((payload) => {
        nearbyCache.current.set(item.id, payload.media);
        if (!cancelled) setNearby(payload.media);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // item.id is the only input that should trigger a refetch — item itself
    // is a fresh object identity every render even when unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  function stepTarget(nextIndex: number): NavigationTarget {
    return detour ? { kind: "detour", media: detour.media, index: nextIndex } : { kind: "list", index: nextIndex };
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && activeIndex > 0) navigateWithSlide(stepTarget(activeIndex - 1), 1);
      else if (event.key === "ArrowRight" && activeIndex < activeMedia.length - 1) navigateWithSlide(stepTarget(activeIndex + 1), -1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // navigateWithSlide/stepTarget are intentionally omitted — they close
    // over state that changes every render, and re-subscribing this listener
    // each render is cheap and already how this effect behaved before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeMedia.length, onClose, detour]);

  if (!item) return null;

  // Drives every non-drag transition: the current photo exits fully
  // off-screen in `exitSign`'s direction (continuing whatever motion — a
  // swipe's own direction, or a button/keyboard tap's implied direction),
  // then swaps content and jumps instantly to the opposite edge, then slides
  // that in to center. One <img>/<video> element, three chained visual
  // states, rather than a two-panel carousel. `target` decides what the swap
  // actually does: advance within the current list (calling the parent's
  // onNavigate), advance within an already-active detour (local state only),
  // or start a brand-new detour.
  function navigateWithSlide(target: NavigationTarget, exitSign: -1 | 1) {
    pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
    pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    pendingTimeouts.current = [];
    pendingFrames.current = [];

    const distance = exitDistance();
    setIsDragging(false);
    setSuppressTransition(false);
    setDragX(exitSign * distance);

    const swapTimeout = window.setTimeout(() => {
      if (target.kind === "detour") {
        setDetour({ media: target.media, index: target.index });
      } else if (detour) {
        setDetour({ media: detour.media, index: target.index });
      } else {
        onNavigate(target.index);
      }
      setSuppressTransition(true);
      setDragX(-exitSign * distance);

      // Two nested frames: the first can still land in the same paint as the
      // style change above, so a single one isn't reliably enough to force
      // the browser to commit "no transition, at the opposite edge" before
      // re-enabling the transition and animating back to center.
      const frame1 = window.requestAnimationFrame(() => {
        const frame2 = window.requestAnimationFrame(() => {
          setSuppressTransition(false);
          setDragX(0);
        });
        pendingFrames.current.push(frame2);
      });
      pendingFrames.current.push(frame1);
    }, SETTLE_DURATION_MS);
    pendingTimeouts.current.push(swapTimeout);
  }

  function handleNearbyTap(tappedId: string) {
    const cluster = [item, ...nearby];
    const result = resolveNearbyTap(activeMedia, tappedId, cluster);
    if (!result) return;
    if (result.mode === "list") navigateWithSlide({ kind: "list", index: result.index }, result.index > activeIndex ? -1 : 1);
    else navigateWithSlide({ kind: "detour", media: result.media, index: result.index }, -1);
  }

  // HTMLImageElement | HTMLVideoElement, not just HTMLImageElement — these
  // three handlers are now shared verbatim between the <img> and <video>
  // branches below, and TS's PointerEvent<T> is invariant enough in T that a
  // handler typed for one element only isn't assignable to the other's prop.
  function handlePointerDown(event: ReactPointerEvent<HTMLImageElement | HTMLVideoElement>) {
    // A new gesture starting mid-settle (fast repeated swipes) must not let
    // the previous swipe's deferred steps land in the middle of this one.
    pendingTimeouts.current.forEach((id) => window.clearTimeout(id));
    pendingFrames.current.forEach((id) => window.cancelAnimationFrame(id));
    pendingTimeouts.current = [];
    pendingFrames.current = [];
    setSuppressTransition(false);

    dragStartX.current = event.clientX;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLImageElement | HTMLVideoElement>) {
    if (dragStartX.current === null) return;
    setDragX(event.clientX - dragStartX.current);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLImageElement | HTMLVideoElement>) {
    if (dragStartX.current === null) return;
    const releasedAt = dragX;
    const nextIndex = resolveSwipeNavigation(releasedAt, activeIndex, activeMedia.length);
    dragStartX.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (nextIndex === null) {
      // Below the threshold, or already at the end being swiped past — ease
      // back to center instead of snapping the drag away instantly.
      setIsDragging(false);
      setDragX(0);
      return;
    }

    navigateWithSlide(stepTarget(nextIndex), releasedAt < 0 ? -1 : 1);
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-white"
      >
        <X className="size-6" />
      </button>

      {activeIndex > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigateWithSlide(stepTarget(activeIndex - 1), 1);
          }}
          aria-label={t("previous")}
          className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {activeIndex < activeMedia.length - 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            navigateWithSlide(stepTarget(activeIndex + 1), -1);
          }}
          aria-label={t("next")}
          className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      {item.mediaKind === "video" ? (
        <video
          src={`/api/memories/media/${item.id}/display`}
          poster={`/api/memories/media/${item.id}/thumbnail`}
          controls
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ transform: `translateX(${dragX}px)`, transition: isDragging || suppressTransition ? "none" : SETTLE_TRANSITION }}
          className="max-h-full max-w-full touch-pan-y object-contain"
        />
      ) : (
        <img
          src={`/api/memories/media/${item.id}/display`}
          alt=""
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ transform: `translateX(${dragX}px)`, transition: isDragging || suppressTransition ? "none" : SETTLE_TRANSITION }}
          className="max-h-full max-w-full touch-pan-y select-none object-contain"
        />
      )}

      <div className="absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-8">
        {!isDragging && !suppressTransition && nearby.length > 0 && (
          <div className="mb-2.5" onClick={(event) => event.stopPropagation()}>
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/90">{t("nearbyCount", { count: nearby.length })}</p>
            <div className="flex gap-2 overflow-x-auto">
              {nearby.map((match) => (
                <button key={match.id} type="button" onClick={() => handleNearbyTap(match.id)} className="flex-none text-center">
                  <span className="relative block">
                    <img
                      src={`/api/memories/media/${match.id}/thumbnail`}
                      alt=""
                      className="size-[52px] rounded-xl border border-white/40 object-cover"
                      loading="lazy"
                    />
                    {match.mediaKind === "video" && (
                      <span aria-hidden="true" data-play-badge="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                        <span className="grid size-[22px] place-items-center rounded-full bg-black/55 text-white">
                          <Play className="size-2.5 fill-current" />
                        </span>
                      </span>
                    )}
                  </span>
                  {match.uploaderDisplayName && (
                    <span className="mt-0.5 block max-w-[52px] truncate text-[9px] text-white/75">{match.uploaderDisplayName}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-center text-xs font-medium text-white/80">
          {detour
            ? t("nearbyDetourLabel", { current: activeIndex + 1, total: activeMedia.length })
            : t("viewerLabel", { current: activeIndex + 1, total: activeMedia.length })}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd src/components/invitations/memories && npx tsx --test MediaLightbox.test.tsx
```

Expected: PASS — every pre-existing test in this file, Task 3's `resolveNearbyTap` tests, and this task's new strip/detour tests.

- [ ] **Step 8: Typecheck and full build**

`MediaLightbox.tsx` is a component, not a `route.ts`, so `tsc --noEmit` is sufficient here — but run a full build too since this task also touched `messages/en.json`/`es.json`, which next-intl validates at build time.

```bash
npx tsc --noEmit
npm run build
```

Expected: both exit 0.

- [ ] **Step 9: Run the full existing Memories test suite to check for regressions**

```bash
npx tsx --test 'src/components/invitations/memories/**/*.test.tsx' 'src/components/invitations/memories/**/*.test.ts' 'src/lib/invitations/memories/**/*.test.ts' 'src/app/api/memories/**/*.test.ts'
```

Expected: all pass — this glob covers both `MediaLightbox.test.ts` (Task 3's pure-function tests) and `MediaLightbox.test.tsx` (this task's DOM-mounted tests), plus `GuestGalleryView.test.tsx` / `GuestAiHighlightView.test.tsx`, which mount `MediaLightbox` too and so confirm the fetch-stub default doesn't break them.

- [ ] **Step 10: Commit**

```bash
git add src/components/invitations/memories/MediaLightbox.tsx src/components/invitations/memories/MediaLightbox.test.tsx messages/en.json messages/es.json
git commit -m "feat: show Every Perspective nearby strip and detour mode in MediaLightbox"
```
