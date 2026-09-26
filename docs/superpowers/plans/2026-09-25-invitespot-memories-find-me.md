# InviteSpot Memories — "Find Me" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest submit a one-time selfie (never stored) that's compared live via AWS Rekognition against an event's gallery-visible photos/video-posters known to contain a face, returning every match.

**Architecture:** A cheap `DetectFaces` call at the existing moderation step tags each photo/video-poster with a non-biometric `has_faces` flag. A new host-gated endpoint downloads only `has_faces = true` candidates for an event, compares a submitted selfie against each via `CompareFaces` with bounded concurrency, and returns matches. No persistent face data anywhere — the selfie lives only in server memory for one request.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase, AWS Rekognition (`@aws-sdk/client-rekognition`, already a dependency), `tsx --test`, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-25-invitespot-memories-find-me-design.md`

## Global Constraints

- No new AWS infrastructure — reuses the already-integrated `RekognitionClient`.
- No persistent biometric data of any kind. A guest's selfie is never written to Supabase or R2, never logged. Only a boolean `has_faces` presence flag is ever stored, on `memory_media`.
- Host must explicitly enable Find Me per event (`invitation_events.find_me_enabled`, default `false`) — independent of, but requires, `memories_enabled`.
- Rate limit: **5 Find Me searches per guest session per 24 hours.** Fails closed (denies the attempt) if the rate-limit check itself is unavailable.
- Candidate search is capped at the **300 most recent** `has_faces = true` gallery-visible items per search. Comparison concurrency is capped at **5** concurrent `CompareFaces` calls. Similarity threshold for a match is **80**.
- A `route.ts` file may only export HTTP method handlers plus framework config constants — any other export fails `npm run build` (not caught by `tsc --noEmit`). Logic beyond a handler goes in a sibling file the route imports and calls.
- `tsx --test` silently matches 0 files (exit 0) against a literal path containing a bracketed segment like `[eventId]` — use a single-quoted recursive glob or `cd` into the file's own directory with the bare filename.
- No new bottom-nav tab — Find Me is an action inside the existing Gallery tab.
- This environment has no live Supabase credentials wired up for automated tests. `createAdminClient()`-backed functions with no injection seam are tested via structural `.toString()` source assertions, never a live round trip.

---

### Task 1: Migration — schema and rate-limit RPC

**Files:**
- Create: `supabase/migrations/061_memories_find_me.sql`

**Interfaces:**
- Produces: `invitation_events.find_me_enabled` column, `memory_media.has_faces` column, `public.memory_find_me_rate_limits` table, `public.attempt_memories_find_me_rate_limit(uuid, uuid, integer, integer) RETURNS boolean` RPC — consumed by later tasks' repository/rate-limit code.

This migration has no TypeScript to test — it's SQL only. Its correctness is verified by mirroring the exact, already-proven-in-production structure of `supabase/migrations/041_invitation_passcode_rate_limit.sql`, adapted for a guest-session key instead of an IP-hash key. Like migration 060 earlier in this project, this migration needs to be manually applied to Supabase by a human after this task — it is not auto-applied by any test or build step in this repo.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/061_memories_find_me.sql`:

```sql
ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS find_me_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.memory_media
  ADD COLUMN IF NOT EXISTS has_faces boolean NOT NULL DEFAULT false;

-- One row per event and guest session — the primary key makes the upsert
-- serialize concurrent Find Me attempts for exactly this event/guest
-- combination, mirroring invitation_passcode_rate_limits' own shape
-- (migration 041) for the same reason: an atomic check-and-increment, not a
-- read-then-write race. guest_session_id is a uuid (it's the sessionId field
-- already minted by /api/memories/events/[eventId]/session, always a
-- randomUUID()), not a hash, so no format CHECK is needed the way ip_hash's
-- text column needed one.
CREATE TABLE public.memory_find_me_rate_limits (
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  guest_session_id uuid NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  PRIMARY KEY (event_id, guest_session_id)
);

ALTER TABLE public.memory_find_me_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memory_find_me_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.attempt_memories_find_me_rate_limit(
  p_event_id uuid,
  p_guest_session_id uuid,
  p_window_seconds integer,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_window_seconds <= 0 OR p_max_attempts <= 0 THEN
    RAISE EXCEPTION 'Find Me limiter requires positive window and attempt limits';
  END IF;

  INSERT INTO public.memory_find_me_rate_limits AS current_limit (
    event_id,
    guest_session_id,
    window_started_at,
    attempt_count
  )
  VALUES (p_event_id, p_guest_session_id, pg_catalog.now(), 1)
  ON CONFLICT (event_id, guest_session_id) DO UPDATE
  SET
    window_started_at = CASE
      WHEN current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN pg_catalog.now()
      ELSE current_limit.window_started_at
    END,
    attempt_count = CASE
      WHEN current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN 1
      ELSE current_limit.attempt_count + 1
    END
  WHERE current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
    OR current_limit.attempt_count < p_max_attempts
  RETURNING true INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.attempt_memories_find_me_rate_limit(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attempt_memories_find_me_rate_limit(uuid, uuid, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attempt_memories_find_me_rate_limit(uuid, uuid, integer, integer) TO service_role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/061_memories_find_me.sql
git commit -m "feat: add find_me_enabled/has_faces columns and rate-limit RPC"
```

---

### Task 2: Extend `AIProvider` with face detection/comparison

**Files:**
- Modify: `src/lib/invitations/memories/ai-provider.ts`
- Modify: `src/app/api/memories/moderate/moderate-route.test.ts`

**Interfaces:**
- Produces: `AIProvider.detectFaces(bytes: Uint8Array): Promise<boolean>`, `AIProvider.compareFaces(sourceBytes: Uint8Array, targetBytes: Uint8Array, similarityThreshold: number): Promise<number>` — consumed by Task 4 (moderation wiring) and Task 6 (the find-me search).

`AIProvider` is a TypeScript interface. Adding two required methods to it means every object literal typed as `AIProvider` elsewhere in the codebase must now provide them too, or `tsc --noEmit`/`npm run build` fails. Only one such object exists today: `moderate-route.test.ts`'s `baseDependencies()` helper. This task must fix that in the same commit — do not leave it for a later task, since it would break the build for everyone in between.

- [ ] **Step 1: Extend the interface and the real provider**

In `src/lib/invitations/memories/ai-provider.ts`, update the import line:

```ts
import { RekognitionClient, DetectModerationLabelsCommand, DetectLabelsCommand, DetectFacesCommand, CompareFacesCommand } from "@aws-sdk/client-rekognition";
```

Add to the `AIProvider` interface (currently `moderateImage`/`detectLabels`):

```ts
export interface AIProvider {
  moderateImage(bytes: Uint8Array): Promise<ModerationResult>;
  detectLabels(bytes: Uint8Array): Promise<DetectedLabel[]>;
  detectFaces(bytes: Uint8Array): Promise<boolean>;
  compareFaces(sourceBytes: Uint8Array, targetBytes: Uint8Array, similarityThreshold: number): Promise<number>;
}
```

Add to `RekognitionAIProvider` (alongside the existing `moderateImage`/`detectLabels` methods):

```ts
  async detectFaces(bytes: Uint8Array): Promise<boolean> {
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const response = await client.send(new DetectFacesCommand({ Image: { Bytes: bytes } }));
    return (response.FaceDetails ?? []).length > 0;
  }

  async compareFaces(sourceBytes: Uint8Array, targetBytes: Uint8Array, similarityThreshold: number): Promise<number> {
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    try {
      const response = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: sourceBytes },
          TargetImage: { Bytes: targetBytes },
          SimilarityThreshold: similarityThreshold,
        }),
      );
      const matches = response.FaceMatches ?? [];
      return matches.reduce((max, match) => Math.max(max, match.Similarity ?? 0), 0);
    } catch (error) {
      // Rekognition throws InvalidParameterException when it can't find a
      // detectable face in either image — a normal outcome for this feature
      // (a candidate photo with nobody recognizable in it, say), not a real
      // error. Every other error still propagates.
      if (error instanceof Error && error.name === "InvalidParameterException") return 0;
      throw error;
    }
  }
```

- [ ] **Step 2: Fix the now-broken test fixture**

`moderate-route.test.ts`'s `baseDependencies()` (around line 95) constructs an inline `aiProvider` object typed against `AIProvider` via `ModerateMediaDependencies`. Add the two new methods so it keeps satisfying the interface:

```ts
    aiProvider: {
      moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
      detectLabels: async () => [],
      detectFaces: async () => false,
      compareFaces: async () => 0,
    },
```

- [ ] **Step 3: Verify everything still compiles and passes**

```bash
npx tsc --noEmit
cd src/app/api/memories/moderate && npx tsx --test moderate-route.test.ts
cd ../../../../../.. && cd src/lib/invitations/memories && npx tsx --test ai-provider.test.ts
```

Expected: `tsc` clean; both test files' existing tests pass unchanged (this task adds no new test cases of its own — `ai-provider.test.ts` only ever tested the pure `resolveModerationOutcome` function, never `RekognitionAIProvider`'s methods directly, since they're thin AWS SDK wrappers with no logic of their own to unit-test; that convention is unchanged by this task).

- [ ] **Step 4: Commit**

```bash
git add src/lib/invitations/memories/ai-provider.ts src/app/api/memories/moderate/moderate-route.test.ts
git commit -m "feat: add detectFaces/compareFaces to AIProvider"
```

---

### Task 3: Repository support — `has_faces` write and `find_me_enabled` settings

**Files:**
- Modify: `src/lib/invitations/memories/repository.ts`
- Modify: `src/lib/invitations/memories/repository.test.ts`
- Modify: `src/lib/invitations/memories/gallery.ts`
- Modify: `src/lib/invitations/memories/gallery.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `updateMemoryMediaHasFaces(mediaId: string, hasFaces: boolean): Promise<void>`; `getEventMemoriesSettings` gains `findMeEnabled: boolean` on its return type; `updateEventMemoriesSettings` gains an optional `findMeEnabled?: boolean` update field; `listGalleryVisibleMediaWithFaces(eventId: string, limit: number): Promise<MemoryMedia[]>` — all consumed by Task 4 (moderation) and Task 6 (the search endpoint).

- [ ] **Step 1: Write the failing tests**

In `src/lib/invitations/memories/repository.test.ts`, find the existing tests `"getEventMemoriesSettings selects and returns startsAt alongside the existing fields"` and `"updateEventMemoriesSettings patches only the memories fields provided"` (both use a `.toString()` source-assertion, per this file's established convention for `createAdminClient()`-backed functions with no injection seam). Update the import list at the top of the file to also import `updateMemoryMediaHasFaces`, then add these tests near the two above:

```ts
test("getEventMemoriesSettings selects and returns find_me_enabled alongside the existing fields", () => {
  const source = getEventMemoriesSettings.toString();
  assert.match(source, /find_me_enabled/);
  assert.match(source, /findMeEnabled/);
});

test("updateEventMemoriesSettings patches find_me_enabled when provided, alongside the existing fields", () => {
  const source = updateEventMemoriesSettings.toString();
  assert.match(source, /find_me_enabled/);
  assert.match(source, /findMeEnabled/);
});

test("updateMemoryMediaHasFaces patches has_faces on memory_media, scoped by media id", () => {
  assert.equal(typeof updateMemoryMediaHasFaces, "function");
  const source = updateMemoryMediaHasFaces.toString();
  assert.match(source, /memory_media/);
  assert.match(source, /has_faces/);
  assert.match(source, /\.eq\(\s*"id"/);
});
```

In `src/lib/invitations/memories/gallery.test.ts`, add (importing `listGalleryVisibleMediaWithFaces` alongside the existing `computeGalleryVisible`/`toPublicMemoryMedia` import):

```ts
test("listGalleryVisibleMediaWithFaces additionally filters on has_faces and accepts a limit", () => {
  const source = listGalleryVisibleMediaWithFaces.toString();
  assert.match(source, /has_faces/);
  assert.match(source, /\.limit\(/);
  assert.match(source, /event_id/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd src/lib/invitations/memories && npx tsx --test repository.test.ts gallery.test.ts
```

Expected: FAIL — `updateMemoryMediaHasFaces`/`listGalleryVisibleMediaWithFaces` don't exist yet, and the two settings functions don't yet reference `find_me_enabled`/`findMeEnabled`.

- [ ] **Step 3: Implement**

In `src/lib/invitations/memories/repository.ts`, update `getEventMemoriesSettings`:

```ts
export async function getEventMemoriesSettings(
  eventId: string,
): Promise<{ memoriesEnabled: boolean; memoriesMode: "auto_publish" | "review_required"; startsAt: string | null; findMeEnabled: boolean } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("memories_enabled,memories_mode,starts_at,find_me_enabled")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    memoriesEnabled: data.memories_enabled as boolean,
    memoriesMode: data.memories_mode as "auto_publish" | "review_required",
    startsAt: (data.starts_at as string | null) ?? null,
    findMeEnabled: data.find_me_enabled as boolean,
  };
}
```

Update `updateEventMemoriesSettings`:

```ts
export async function updateEventMemoriesSettings(
  eventId: string,
  updates: { memoriesEnabled?: boolean; memoriesMode?: "auto_publish" | "review_required"; findMeEnabled?: boolean },
): Promise<void> {
  const client = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (updates.memoriesEnabled !== undefined) patch.memories_enabled = updates.memoriesEnabled;
  if (updates.memoriesMode !== undefined) patch.memories_mode = updates.memoriesMode;
  if (updates.findMeEnabled !== undefined) patch.find_me_enabled = updates.findMeEnabled;
  const { error } = await client.from("invitation_events").update(patch).eq("id", eventId);
  if (error) throw new Error(`failed to update memories settings: ${error.message}`);
}
```

Add, near `updateMemoryMediaModeration`:

```ts
export async function updateMemoryMediaHasFaces(mediaId: string, hasFaces: boolean): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_media").update({ has_faces: hasFaces }).eq("id", mediaId);
  if (error) throw new Error(`failed to update media has_faces: ${error.message}`);
}
```

In `src/lib/invitations/memories/gallery.ts`, add directly below `listGalleryVisibleMedia`:

```ts
// Same gallery-visibility gate as listGalleryVisibleMedia, plus has_faces —
// the candidate pool for a Find Me search. Capped via `limit` so a single
// search can never trigger an unbounded number of downstream CompareFaces
// calls, regardless of event size.
export async function listGalleryVisibleMediaWithFaces(eventId: string, limit: number): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .eq("has_faces", true)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(mapRow);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd src/lib/invitations/memories && npx tsx --test repository.test.ts gallery.test.ts
```

Expected: PASS, including every pre-existing test in both files.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts src/lib/invitations/memories/gallery.ts src/lib/invitations/memories/gallery.test.ts
git commit -m "feat: add has_faces write path and find_me_enabled settings support"
```

---

### Task 4: Wire face detection into the moderation pipeline

**Files:**
- Modify: `src/app/api/memories/moderate/moderate-media.ts`
- Modify: `src/app/api/memories/moderate/moderate-route.test.ts`

**Interfaces:**
- Consumes: `AIProvider.detectFaces` (Task 2), `updateMemoryMediaHasFaces` (Task 3).
- Produces: no new external interface — `has_faces` is now populated for every photo/video-poster as a side effect of the moderation this route already performs.

- [ ] **Step 1: Write the failing tests**

In `moderate-route.test.ts`, add (using the file's existing `media()`, `settings()`, `withStubbedFetch()`, `baseDependencies()` helpers — read them first if you haven't, they're at the top of this file):

```ts
test("has_faces is set from detectFaces using the same bytes already fetched for moderation, without affecting the moderation outcome", async () => {
  let hasFacesCall: { mediaId: string; hasFaces: boolean } | undefined;
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "media-1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "media-1" }),
        updateMemoryMediaHasFaces: async (mediaId, hasFaces) => {
          hasFacesCall = { mediaId, hasFaces };
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => [],
          detectFaces: async () => true,
          compareFaces: async () => 0,
        },
      }),
    ),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(hasFacesCall, { mediaId: "media-1", hasFaces: true });
});

test("a has_faces detection failure is logged and swallowed, leaving the already-committed moderation outcome intact", async () => {
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "media-1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "media-1" }),
        updateMemoryMediaHasFaces: async () => {
          throw new Error("has_faces write failed");
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => [],
          detectFaces: async () => {
            throw new Error("rekognition unavailable");
          },
          compareFaces: async () => 0,
        },
      }),
    ),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.moderationStatus, "approved");
});

test("has_faces is computed even for flagged/rejected content, since a flagged item can still be manually approved later", async () => {
  let hasFacesCall: { mediaId: string; hasFaces: boolean } | undefined;
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "media-1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "media-1" }),
        updateMemoryMediaHasFaces: async (mediaId, hasFaces) => {
          hasFacesCall = { mediaId, hasFaces };
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0.99, categories: ["Explicit Nudity"] }),
          detectLabels: async () => [],
          detectFaces: async () => true,
          compareFaces: async () => 0,
        },
      }),
    ),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.moderationStatus, "rejected");
  assert.deepEqual(hasFacesCall, { mediaId: "media-1", hasFaces: true });
});
```

`baseDependencies()` will need a `getEventMemoriesSettings` override note: its default already returns `settings()` (`memoriesEnabled: true, memoriesMode: "auto_publish", startsAt: null`) — that helper's return type will fail to satisfy the updated `getEventMemoriesSettings` return shape from Task 3 (which now requires `findMeEnabled`) unless `settings()` is also updated. Update the `settings()` helper at the top of `moderate-route.test.ts`:

```ts
function settings(overrides: Partial<{ memoriesEnabled: boolean; memoriesMode: "auto_publish" | "review_required"; startsAt: string | null; findMeEnabled: boolean }> = {}) {
  return { memoriesEnabled: true, memoriesMode: "auto_publish" as const, startsAt: null, findMeEnabled: false, ...overrides };
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd src/app/api/memories/moderate && npx tsx --test moderate-route.test.ts
```

Expected: FAIL — `moderateMedia` doesn't call `detectFaces`/`updateMemoryMediaHasFaces` yet, so `hasFacesCall` stays `undefined`.

- [ ] **Step 3: Implement**

In `moderate-media.ts`, add `updateMemoryMediaHasFaces` to the repository import:

```ts
import {
  getEventMemoriesSettings,
  getMemoryMediaById,
  updateMemoryMediaHasFaces,
  updateMemoryMediaModeration,
  upsertMemoryMediaDescriptor,
} from "@/lib/invitations/memories/repository";
```

Add it to `ModerateMediaDependencies`:

```ts
export interface ModerateMediaDependencies {
  getMemoryMediaById?: typeof getMemoryMediaById;
  getEventMemoriesSettings?: typeof getEventMemoriesSettings;
  updateMemoryMediaModeration?: typeof updateMemoryMediaModeration;
  updateMemoryMediaHasFaces?: typeof updateMemoryMediaHasFaces;
  upsertMemoryMediaDescriptor?: typeof upsertMemoryMediaDescriptor;
  requestHighlightGeneration?: typeof requestHighlightGeneration;
  storage?: StorageProvider;
  aiProvider?: AIProvider;
}
```

Inside `moderateMedia`, add the dependency resolution alongside the others:

```ts
  const updateHasFaces = dependencies.updateMemoryMediaHasFaces ?? updateMemoryMediaHasFaces;
```

Immediately after `await updateModeration(mediaId, outcome);` and before the existing descriptor-extraction `if` block, add:

```ts
  // Best-effort has_faces detection — like the descriptor extraction below,
  // never lets a failure here affect the moderation outcome already
  // committed above. Reuses the moderation derivative `bytes` already
  // downloaded — no second R2 fetch. Runs regardless of moderation outcome
  // (including flagged/rejected): a flagged item can still be manually
  // approved by the host later, and by then this flag should already be
  // set — recomputing it retroactively would mean re-fetching bytes for
  // content that's already been reviewed.
  try {
    const hasFaces = await provider.detectFaces(bytes);
    await updateHasFaces(mediaId, hasFaces);
  } catch (err) {
    console.error("[memories/moderate] has_faces detection failed (non-fatal)", { mediaId, error: err });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd src/app/api/memories/moderate && npx tsx --test moderate-route.test.ts
```

Expected: PASS, including every pre-existing test in this file.

- [ ] **Step 5: Typecheck and full build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/memories/moderate/moderate-media.ts src/app/api/memories/moderate/moderate-route.test.ts
git commit -m "feat: compute has_faces during moderation"
```

---

### Task 5: Find Me rate limiter

**Files:**
- Create: `src/lib/invitations/memories/find-me-rate-limit.ts`
- Create: `src/lib/invitations/memories/find-me-rate-limit.test.ts`

**Interfaces:**
- Produces: `allowFindMeAttempt(eventId: string, guestSessionId: string): Promise<boolean>` — consumed by Task 6.

This mirrors `src/lib/invitations/passcode-rate-limit.ts` exactly — read that file first if you haven't. It has an injectable-`attempt` factory function plus a real RPC-backed default export, and fails closed (denies the attempt) on any error, matching this codebase's existing security posture for rate limiting.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/invitations/memories/find-me-rate-limit.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createFindMeRateLimiter } from "./find-me-rate-limit";

test("the find-me limiter fails closed when its serialized RPC is unavailable", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => ({ data: null, error: new Error("database unavailable") }),
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), false);
});

test("the find-me limiter delegates one event-and-session attempt to its RPC, with a 24-hour/5-attempt window", async () => {
  const calls: Array<{ eventId: string; guestSessionId: string; windowSeconds: number; maxAttempts: number }> = [];
  const limiter = createFindMeRateLimiter({
    attempt: async (input) => {
      calls.push(input);
      return { data: true, error: null };
    },
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), true);
  assert.deepEqual(calls, [{ eventId: "event-1", guestSessionId: "session-1", windowSeconds: 86400, maxAttempts: 5 }]);
});

test("the find-me limiter denies the attempt when the RPC itself says no", async () => {
  const limiter = createFindMeRateLimiter({
    attempt: async () => ({ data: false, error: null }),
  });

  assert.equal(await limiter.allowAttempt("event-1", "session-1"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd src/lib/invitations/memories && npx tsx --test find-me-rate-limit.test.ts
```

Expected: FAIL — `find-me-rate-limit.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/lib/invitations/memories/find-me-rate-limit.ts`:

```ts
// src/lib/invitations/memories/find-me-rate-limit.ts
import { createAdminClient } from "@/lib/supabase/admin";

const FIND_ME_WINDOW_SECONDS = 24 * 60 * 60;
const FIND_ME_MAX_ATTEMPTS = 5;

type FindMeRateLimitAttempt = {
  eventId: string;
  guestSessionId: string;
  windowSeconds: number;
  maxAttempts: number;
};

type FindMeRateLimitDependencies = {
  attempt(input: FindMeRateLimitAttempt): Promise<{ data: boolean | null; error: unknown | null }>;
};

export function createFindMeRateLimiter(dependencies: FindMeRateLimitDependencies) {
  return {
    async allowAttempt(eventId: string, guestSessionId: string): Promise<boolean> {
      try {
        const result = await dependencies.attempt({
          eventId,
          guestSessionId,
          windowSeconds: FIND_ME_WINDOW_SECONDS,
          maxAttempts: FIND_ME_MAX_ATTEMPTS,
        });
        if (result.error || result.data !== true) {
          console.error("[memories/find-me] rate limit unavailable", { eventId, guestSessionId, error: result.error });
          return false;
        }
        return true;
      } catch (error) {
        console.error("[memories/find-me] rate limit unavailable", { eventId, guestSessionId, error });
        return false;
      }
    },
  };
}

export async function allowFindMeAttempt(eventId: string, guestSessionId: string): Promise<boolean> {
  const limiter = createFindMeRateLimiter({
    attempt: async (input) => {
      const { data, error } = await createAdminClient().rpc("attempt_memories_find_me_rate_limit", {
        p_event_id: input.eventId,
        p_guest_session_id: input.guestSessionId,
        p_window_seconds: input.windowSeconds,
        p_max_attempts: input.maxAttempts,
      });
      return { data, error };
    },
  });
  return limiter.allowAttempt(eventId, guestSessionId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd src/lib/invitations/memories && npx tsx --test find-me-rate-limit.test.ts
```

Expected: PASS, all 3 tests.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/find-me-rate-limit.ts src/lib/invitations/memories/find-me-rate-limit.test.ts
git commit -m "feat: add Find Me rate limiter"
```

---

### Task 6: The Find Me search endpoint

**Files:**
- Create: `src/app/api/memories/events/[eventId]/find-me/find-me-search.ts`
- Create: `src/app/api/memories/events/[eventId]/find-me/find-me-search.test.ts`
- Create: `src/app/api/memories/events/[eventId]/find-me/route.ts`
- Create: `src/app/api/memories/events/[eventId]/find-me/find-me-route.test.ts`

**Interfaces:**
- Consumes: `getEventMemoriesSettings`/`listGalleryVisibleMediaWithFaces` (Task 3), `allowFindMeAttempt` (Task 5), `AIProvider.compareFaces` (Task 2), `verifyMemoriesGuestSession` (existing, `src/lib/invitations/memories/guest-session.ts`), `toPublicMemoryMedia` (existing, `src/lib/invitations/memories/gallery.ts`).
- Produces: `POST /api/memories/events/[eventId]/find-me` — consumed by Task 8's frontend.

- [ ] **Step 1: Write the failing tests for the pure comparison logic**

Create `src/app/api/memories/events/[eventId]/find-me/find-me-search.test.ts`:

```ts
// src/app/api/memories/events/[eventId]/find-me/find-me-search.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { compareAgainstCandidates, searchFindMe } from "./find-me-search";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

function media(overrides: Partial<MemoryMedia> & { id: string }): MemoryMedia {
  return {
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderSessionId: null,
    uploaderDisplayName: null,
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: `originals/${overrides.id}.jpg`,
    objectKeyDisplay: `display/${overrides.id}.webp`,
    objectKeyThumbnail: `thumb/${overrides.id}.webp`,
    capturedAt: "2026-09-24T20:00:00Z",
    uploadedAt: "2026-09-24T20:01:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "approved",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  } as unknown as MemoryMedia;
}

const SELFIE = new Uint8Array([1]);

test("compareAgainstCandidates keeps only candidates with a positive similarity, sorted best-first", async () => {
  const candidates = [
    { media: media({ id: "low" }), bytes: new Uint8Array([2]) },
    { media: media({ id: "none" }), bytes: new Uint8Array([3]) },
    { media: media({ id: "high" }), bytes: new Uint8Array([4]) },
  ];
  const scores: Record<string, number> = { low: 82, none: 0, high: 97 };
  const compareFaces = async (_source: Uint8Array, target: Uint8Array) => scores[["low", "none", "high"][target[0] - 2]];

  const result = await compareAgainstCandidates(SELFIE, candidates, compareFaces, 5);

  assert.deepEqual(result.map((r) => r.media.id), ["high", "low"]);
  assert.deepEqual(result.map((r) => r.similarity), [97, 82]);
});

test("compareAgainstCandidates respects a concurrency cap without dropping any candidate", async () => {
  const candidates = Array.from({ length: 12 }, (_, i) => ({ media: media({ id: `m${i}` }), bytes: new Uint8Array([i]) }));
  let inFlight = 0;
  let maxInFlight = 0;
  const compareFaces = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return 90;
  };

  const result = await compareAgainstCandidates(SELFIE, candidates, compareFaces, 3);

  assert.equal(result.length, 12);
  assert.ok(maxInFlight <= 3, `expected at most 3 concurrent comparisons, saw ${maxInFlight}`);
});

test("compareAgainstCandidates returns an empty array for an empty candidate list", async () => {
  const result = await compareAgainstCandidates(SELFIE, [], async () => 100, 5);
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd src/app/api/memories/events/[eventId]/find-me && npx tsx --test find-me-search.test.ts
```

Expected: FAIL — `find-me-search.ts` doesn't exist yet.

- [ ] **Step 3: Implement the search logic**

Create `src/app/api/memories/events/[eventId]/find-me/find-me-search.ts`:

```ts
// src/app/api/memories/events/[eventId]/find-me/find-me-search.ts
//
// Core Find Me logic — pulled out of route.ts because a route.ts file may
// only export the recognized HTTP handlers and a small set of config fields
// (see this repo's CLAUDE.md), matching every other route this project has
// added this session (moderate-media.ts, nearby-media.ts).
import type { AIProvider } from "@/lib/invitations/memories/ai-provider";
import { RekognitionAIProvider } from "@/lib/invitations/memories/ai-provider";
import { listGalleryVisibleMediaWithFaces, toPublicMemoryMedia, type PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { allowFindMeAttempt } from "@/lib/invitations/memories/find-me-rate-limit";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import type { StorageProvider } from "@/lib/invitations/memories/storage-provider";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

const MAX_CANDIDATES = 300;
const CONCURRENCY = 5;
const SIMILARITY_THRESHOLD = 80;

export interface FindMeSearchResult {
  status: number;
  body: { media?: PublicMemoryMedia[]; error?: string };
}

// Dependencies-object DI seam, same rationale as moderate-media.ts's own:
// getEventMemoriesSettings/listGalleryVisibleMediaWithFaces/allowFindMeAttempt
// call createAdminClient() directly and have no injection seam of their own,
// and RekognitionAIProvider/R2StorageProvider call real AWS/R2 APIs.
export interface FindMeSearchDependencies {
  getEventMemoriesSettings?: typeof getEventMemoriesSettings;
  listGalleryVisibleMediaWithFaces?: typeof listGalleryVisibleMediaWithFaces;
  allowFindMeAttempt?: typeof allowFindMeAttempt;
  storage?: StorageProvider;
  aiProvider?: AIProvider;
}

// Pure and independently testable: given already-downloaded candidate bytes
// and a comparison function, runs the comparisons with bounded concurrency
// and returns matches (similarity > 0) sorted best-first. Kept separate from
// the R2/DB-fetching orchestration below so this concurrency/threshold/sort
// behavior can be verified with plain fakes — no fetch or storage involved.
export async function compareAgainstCandidates(
  selfieBytes: Uint8Array,
  candidates: Array<{ media: MemoryMedia; bytes: Uint8Array }>,
  compareFaces: (source: Uint8Array, target: Uint8Array, threshold: number) => Promise<number>,
  concurrency: number,
): Promise<Array<{ media: MemoryMedia; similarity: number }>> {
  const results: Array<{ media: MemoryMedia; similarity: number }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor++;
      const candidate = candidates[index];
      const similarity = await compareFaces(selfieBytes, candidate.bytes, SIMILARITY_THRESHOLD);
      if (similarity > 0) results.push({ media: candidate.media, similarity });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
  return results.sort((a, b) => b.similarity - a.similarity);
}

export async function searchFindMe(
  eventId: string,
  guestSessionId: string,
  selfieBytes: Uint8Array,
  dependencies: FindMeSearchDependencies = {},
): Promise<FindMeSearchResult> {
  const getSettings = dependencies.getEventMemoriesSettings ?? getEventMemoriesSettings;
  const listCandidates = dependencies.listGalleryVisibleMediaWithFaces ?? listGalleryVisibleMediaWithFaces;
  const allowAttempt = dependencies.allowFindMeAttempt ?? allowFindMeAttempt;
  const storage = dependencies.storage ?? new R2StorageProvider();
  const provider = dependencies.aiProvider ?? new RekognitionAIProvider();

  const settings = await getSettings(eventId);
  if (!settings || !settings.memoriesEnabled || !settings.findMeEnabled) {
    return { status: 404, body: { error: "find me not enabled for this event" } };
  }

  const allowed = await allowAttempt(eventId, guestSessionId);
  if (!allowed) return { status: 429, body: { error: "too many searches, try again later" } };

  const candidateMedia = await listCandidates(eventId, MAX_CANDIDATES);
  const candidates: Array<{ media: MemoryMedia; bytes: Uint8Array }> = [];
  for (const media of candidateMedia) {
    const key = media.mediaKind === "video" ? media.objectKeyThumbnail : media.objectKeyDisplay;
    if (!key) continue;
    try {
      const downloadUrl = await storage.getSignedDownloadUrl(key, 60);
      const response = await fetch(downloadUrl);
      if (!response.ok) continue;
      candidates.push({ media, bytes: new Uint8Array(await response.arrayBuffer()) });
    } catch (err) {
      console.error("[memories/find-me] failed to fetch a candidate photo, skipping it", { mediaId: media.id, error: err });
    }
  }

  const matches = await compareAgainstCandidates(
    selfieBytes,
    candidates,
    (source, target, threshold) => provider.compareFaces(source, target, threshold),
    CONCURRENCY,
  );

  return { status: 200, body: { media: matches.map((match) => toPublicMemoryMedia(match.media)) } };
}
```

- [ ] **Step 4: Run the pure-logic tests to verify they pass**

```bash
cd src/app/api/memories/events/[eventId]/find-me && npx tsx --test find-me-search.test.ts
```

Expected: PASS, all 3 tests.

- [ ] **Step 5: Write the failing tests for `searchFindMe`'s gating logic**

Append to `find-me-search.test.ts`:

```ts
function baseSearchDependencies(overrides: Parameters<typeof searchFindMe>[3] = {}): Parameters<typeof searchFindMe>[3] {
  return {
    getEventMemoriesSettings: async () => ({ memoriesEnabled: true, memoriesMode: "auto_publish", startsAt: null, findMeEnabled: true }),
    listGalleryVisibleMediaWithFaces: async () => [],
    allowFindMeAttempt: async () => true,
    storage: {
      createPresignedUploadUrl: async () => "https://example.test/upload",
      getSignedDownloadUrl: async (key: string) => `https://example.test/${key}`,
      deleteObject: async () => undefined,
      objectExists: async () => true,
    },
    aiProvider: {
      moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
      detectLabels: async () => [],
      detectFaces: async () => true,
      compareFaces: async () => 0,
    },
    ...overrides,
  };
}

test("searchFindMe 404s when find_me_enabled is false", async () => {
  const result = await searchFindMe(
    "event-1",
    "session-1",
    SELFIE,
    baseSearchDependencies({ getEventMemoriesSettings: async () => ({ memoriesEnabled: true, memoriesMode: "auto_publish", startsAt: null, findMeEnabled: false }) }),
  );
  assert.equal(result.status, 404);
});

test("searchFindMe 404s when memories itself is disabled, even if find_me_enabled is true", async () => {
  const result = await searchFindMe(
    "event-1",
    "session-1",
    SELFIE,
    baseSearchDependencies({ getEventMemoriesSettings: async () => ({ memoriesEnabled: false, memoriesMode: "auto_publish", startsAt: null, findMeEnabled: true }) }),
  );
  assert.equal(result.status, 404);
});

test("searchFindMe 429s when the rate limiter denies the attempt", async () => {
  const result = await searchFindMe("event-1", "session-1", SELFIE, baseSearchDependencies({ allowFindMeAttempt: async () => false }));
  assert.equal(result.status, 429);
});

test("searchFindMe returns 200 with matched media, skipping candidates whose download fails", async () => {
  const fetchable = media({ id: "fetchable" });
  const broken = media({ id: "broken" });
  const result = await searchFindMe(
    "event-1",
    "session-1",
    SELFIE,
    baseSearchDependencies({
      listGalleryVisibleMediaWithFaces: async () => [fetchable, broken],
      storage: {
        createPresignedUploadUrl: async () => "https://example.test/upload",
        getSignedDownloadUrl: async (key: string) => (key.includes("broken") ? "https://example.test/will-404" : "https://example.test/display/fetchable.webp"),
        deleteObject: async () => undefined,
        objectExists: async () => true,
      },
      aiProvider: {
        moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
        detectLabels: async () => [],
        detectFaces: async () => true,
        compareFaces: async () => 92,
      },
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.media?.length, 1);
  assert.equal(result.body.media?.[0].id, "fetchable");
});
```

This last test relies on `fetch` — stub it the same way `moderate-route.test.ts` does, since `searchFindMe` also calls the bare global `fetch` with no injection seam of its own (mirrored from `moderate-media.ts` deliberately, for the same reason: the URL it fetches is a real signed R2 URL in production). Add this helper near the top of `find-me-search.test.ts`, and wrap the last test's body in it:

```ts
async function withStubbedFetch<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("will-404")) return new Response(null, { status: 404 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}
```

Change the last test to:

```ts
test("searchFindMe returns 200 with matched media, skipping candidates whose download fails", async () => {
  const fetchable = media({ id: "fetchable" });
  const broken = media({ id: "broken" });
  const result = await withStubbedFetch(() =>
    searchFindMe(
      "event-1",
      "session-1",
      SELFIE,
      baseSearchDependencies({
        listGalleryVisibleMediaWithFaces: async () => [fetchable, broken],
        storage: {
          createPresignedUploadUrl: async () => "https://example.test/upload",
          getSignedDownloadUrl: async (key: string) => (key.includes("broken") ? "https://example.test/will-404" : "https://example.test/display/fetchable.webp"),
          deleteObject: async () => undefined,
          objectExists: async () => true,
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => [],
          detectFaces: async () => true,
          compareFaces: async () => 92,
        },
      }),
    ),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.media?.length, 1);
  assert.equal(result.body.media?.[0].id, "fetchable");
});
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd src/app/api/memories/events/[eventId]/find-me && npx tsx --test find-me-search.test.ts
```

Expected: PASS, all 7 tests.

- [ ] **Step 7: Implement the route**

Create `src/app/api/memories/events/[eventId]/find-me/route.ts`:

```ts
// src/app/api/memories/events/[eventId]/find-me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { searchFindMe } from "./find-me-search";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const token = request.cookies.get("memories_guest_session")?.value;
  const session = token ? verifyMemoriesGuestSession(token, params.eventId) : null;
  if (!session?.sessionId) return NextResponse.json({ error: "session required" }, { status: 401 });

  const selfieBytes = new Uint8Array(await request.arrayBuffer());
  if (selfieBytes.length === 0) return NextResponse.json({ error: "no image provided" }, { status: 400 });

  const result = await searchFindMe(params.eventId, session.sessionId, selfieBytes);
  return NextResponse.json(result.body, { status: result.status });
}
```

Create `src/app/api/memories/events/[eventId]/find-me/find-me-route.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("find-me route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

test("requires a verified guest session before searching, and rejects an empty body", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /verifyMemoriesGuestSession/);
  assert.match(source, /status: 401/);
  assert.match(source, /selfieBytes\.length === 0/);
  assert.match(source, /status: 400/);
  assert.match(source, /searchFindMe\(params\.eventId, session\.sessionId, selfieBytes\)/);
});
```

- [ ] **Step 8: Run the route tests, typecheck, and build**

```bash
cd src/app/api/memories/events/[eventId]/find-me && npx tsx --test find-me-route.test.ts find-me-search.test.ts
cd ../../../../../../.. && npx tsc --noEmit
npm run build
```

Expected: all tests pass, `tsc` clean, `npm run build` exits 0 with `/api/memories/events/[eventId]/find-me` listed in the route table.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/memories/events/[eventId]/find-me"
git commit -m "feat: add POST /api/memories/events/[eventId]/find-me"
```

---

### Task 7: Host setting — enable Find Me per event

**Files:**
- Modify: `src/app/api/invitations/events/[eventId]/memories/settings/route.ts`
- Modify: `src/app/api/invitations/events/[eventId]/memories/settings/settings-route.test.ts`
- Modify: `src/components/invitations/memories/OwnerMemoriesCard.tsx`
- Modify: `src/app/invitations/manage/[eventId]/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `updateEventMemoriesSettings` (Task 3, already extended with `findMeEnabled`).
- Produces: `PATCH .../memories/settings` accepts `{ action: "set_find_me_enabled", enabled: boolean }` — consumed by the host UI in this same task.

- [ ] **Step 1: Write the failing test**

This route's existing test file (`settings-route.test.ts`) has exactly two structural tests — a module-loads check and a single regex-based check that the route's source wires in its guards and calls `updateEventMemoriesSettings`. There is no per-action behavioral test to copy; add a third structural test in the same style, immediately after the existing `"settings route guards every write..."` test:

```ts
test("settings route recognizes set_find_me_enabled and patches findMeEnabled", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /set_find_me_enabled/);
  assert.match(source, /findMeEnabled: values\.enabled/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "src/app/api/invitations/events/[eventId]/memories/settings" && npx tsx --test settings-route.test.ts
```

Expected: FAIL — the route doesn't recognize `set_find_me_enabled` yet, returns 400.

- [ ] **Step 3: Implement the route change**

In `route.ts`, add a third branch after the existing `set_mode` block, before the final `return NextResponse.json({ error: "invalid action" }, ...)`:

```ts
    if (values.action === "set_find_me_enabled" && typeof values.enabled === "boolean") {
      await updateEventMemoriesSettings(params.eventId, { findMeEnabled: values.enabled });
      return NextResponse.json({ ok: true });
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "src/app/api/invitations/events/[eventId]/memories/settings" && npx tsx --test settings-route.test.ts
```

Expected: PASS, including every pre-existing test in this file.

- [ ] **Step 5: Add the i18n keys**

In `messages/en.json`, inside `invitations.manage.dashboard.memories` (alongside `enableLabel`/`modeLabel`), add:

```json
"findMeEnableLabel": "Let guests find photos of themselves",
```

In `messages/es.json`, the equivalent:

```json
"findMeEnableLabel": "Permitir que los invitados encuentren fotos de sí mismos",
```

- [ ] **Step 6: Wire the UI toggle**

In `src/components/invitations/memories/OwnerMemoriesCard.tsx`, extend the exported type:

```ts
export type OwnerMemoriesCardData = MemoriesEventSummary & { enabled: boolean; mode: "auto_publish" | "review_required"; findMeEnabled: boolean };
```

Add state alongside `enabled`/`mode`:

```ts
  const [findMeEnabled, setFindMeEnabled] = useState(initial.findMeEnabled);
```

Add a third checkbox in the settings grid, following the exact pattern of the existing `mode` checkbox (disabled unless `enabled` is true, since Find Me requires Memories itself to be on):

```tsx
        <label className={`flex min-h-11 items-center gap-3 text-sm font-medium ${enabled ? "" : "opacity-50"}`}><input type="checkbox" checked={findMeEnabled} disabled={saving || !enabled} onChange={(event) => { const previous = findMeEnabled; const next = event.target.checked; setFindMeEnabled(next); void save({ action: "set_find_me_enabled", enabled: next }, () => setFindMeEnabled(previous)); }} className="size-5 accent-[#6D456F]" />{t("findMeEnableLabel")}</label>
```

- [ ] **Step 7: Thread `findMeEnabled` through to where the card data is built**

In `src/app/invitations/manage/[eventId]/page.tsx`, update the merge:

```ts
    if (settings) memories = { enabled: settings.memoriesEnabled, mode: settings.memoriesMode, findMeEnabled: settings.findMeEnabled, ...summary };
```

- [ ] **Step 8: Typecheck and full build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/invitations/events/[eventId]/memories/settings" src/components/invitations/memories/OwnerMemoriesCard.tsx "src/app/invitations/manage/[eventId]/page.tsx" messages/en.json messages/es.json
git commit -m "feat: add host toggle for find_me_enabled"
```

---

### Task 8: Guest-facing Find Me flow

**Files:**
- Modify: `src/app/invite/[slug]/memories/page.tsx`
- Modify: `src/components/invitations/memories/GuestMemoriesApp.tsx`
- Modify: `src/components/invitations/memories/GuestGalleryView.tsx`
- Modify: `src/components/invitations/memories/GuestGalleryView.test.tsx`
- Create: `src/components/invitations/memories/FindMeFlow.tsx`
- Create: `src/components/invitations/memories/FindMeFlow.test.tsx`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `POST /api/memories/events/[eventId]/find-me` (Task 6), `MediaLightbox` (existing).
- Produces: no new external interface — this is the leaf task that makes Find Me visible to guests.

- [ ] **Step 1: Add the i18n keys**

In `messages/en.json`, inside `invitations.public.memories` (alongside `gallery`/`moments`/`aiHighlight`/`lightbox`), add a new namespace:

```json
    "findMe": {
      "banner": "Find yourself in these photos",
      "consentTitle": "Find your photos",
      "consentBody": "Take or upload a selfie and we'll compare it against this event's photos to find the ones you're in. Your selfie is never saved — it's used once, then discarded.",
      "captureLabel": "Take or choose a selfie",
      "searching": "Looking for you…",
      "resultsTitle": "Photos of you",
      "empty": "No matches found — try a clearer selfie, or check back once more photos are shared.",
      "error": "Something went wrong. Please try again.",
      "tooManyAttempts": "You've reached the search limit for now. Try again tomorrow.",
      "tryAgain": "Try another selfie",
      "close": "Close"
    }
```

In `messages/es.json`, the equivalent:

```json
    "findMe": {
      "banner": "Encuéntrate en estas fotos",
      "consentTitle": "Encuentra tus fotos",
      "consentBody": "Toma o sube una selfie y la compararemos con las fotos de este evento para encontrar las tuyas. Tu selfie nunca se guarda: se usa una vez y luego se descarta.",
      "captureLabel": "Toma o elige una selfie",
      "searching": "Buscándote…",
      "resultsTitle": "Fotos tuyas",
      "empty": "No se encontraron coincidencias — prueba con una selfie más clara, o vuelve más tarde cuando se compartan más fotos.",
      "error": "Algo salió mal. Inténtalo de nuevo.",
      "tooManyAttempts": "Has alcanzado el límite de búsquedas por ahora. Inténtalo de nuevo mañana.",
      "tryAgain": "Probar con otra selfie",
      "close": "Cerrar"
    }
```

- [ ] **Step 2: Thread `findMeEnabled` from the server page down to the client tree**

In `src/app/invite/[slug]/memories/page.tsx`, the `settings` variable already returned by `getEventMemoriesSettings` now carries `findMeEnabled` (Task 3). Pass it to `GuestMemoriesApp`:

```tsx
      <GuestMemoriesApp
        eventId={invitation.event.id}
        eventTitle={invitation.event.honoreeNames.trim() || invitation.event.title}
        accent={recipe.palette.accent}
        background={recipe.palette.background}
        text={recipe.palette.text}
        surface={recipe.palette.surface}
        findMeEnabled={settings.findMeEnabled}
      />
```

In `src/components/invitations/memories/GuestMemoriesApp.tsx`, add `findMeEnabled: boolean` to the props type, and pass it through to `GuestGalleryView`:

```tsx
export function GuestMemoriesApp({
  eventId,
  eventTitle,
  accent,
  background,
  text,
  surface,
  findMeEnabled,
}: {
  eventId: string;
  eventTitle: string;
  accent: string;
  background: string;
  text: string;
  surface: string;
  findMeEnabled: boolean;
}) {
```

```tsx
          {tab === "gallery" && <GuestGalleryView eventId={eventId} accent={accent} surface={surface} uploads={uploads} findMeEnabled={findMeEnabled} />}
```

- [ ] **Step 3: Write the failing test for the banner**

`GuestGalleryView.test.tsx`'s harness is a single function, `withMountedGallery(media, callback)` (around line 60), whose one render call (around line 95) hardcodes `<GuestGalleryView eventId="event-1" accent="#6D456F" surface="#ffffff" uploads={[]} />`. Since every one of this file's 6 existing tests calls `withMountedGallery(media, callback)` with only those two arguments, the cleanest fix is an optional third parameter on the harness itself, defaulting to `false` — no individual test call site needs to change.

Change the harness signature:

```ts
async function withMountedGallery(media: PublicMemoryMedia[], callback: (ctx: { dom: JSDOM }) => Promise<void>, findMeEnabled = false) {
```

Change its render call:

```tsx
          <GuestGalleryView eventId="event-1" accent="#6D456F" surface="#ffffff" uploads={[]} findMeEnabled={findMeEnabled} />
```

Then add this new test at the end of the file:

```ts
test("shows the Find Me banner when findMeEnabled is true, and nothing when it's false", async () => {
  await withMountedGallery([mediaItem("m1")], async ({ dom }) => {
    assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Find yourself in these photos/);
  }, false);

  await withMountedGallery([mediaItem("m1")], async ({ dom }) => {
    assert.match(dom.window.document.body.textContent ?? "", /Find yourself in these photos/);
  }, true);
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd src/components/invitations/memories && npx tsx --test GuestGalleryView.test.tsx
```

Expected: FAIL — `findMeEnabled` isn't a recognized prop yet and no banner exists.

- [ ] **Step 5: Add the banner and prop**

In `GuestGalleryView.tsx`, this component's existing `t` is `useTranslations("invitations.public.memories.gallery")` — the new `findMe.*` keys live in their own sibling namespace (`invitations.public.memories.findMe`), not under `gallery`, so add a second translator call rather than nesting the keys somewhere `t("findMe.banner")` wouldn't actually resolve. This mirrors `MediaLightbox.tsx`'s own `tGallery` (a second `useTranslations` call in the same component) precedent exactly:

```tsx
  const tFindMe = useTranslations("invitations.public.memories.findMe");
```

Add `findMeEnabled` to the props signature:

```tsx
export function GuestGalleryView({ eventId, accent, surface, uploads, findMeEnabled }: { eventId: string; accent: string; surface: string; uploads: GuestUploadPreview[]; findMeEnabled: boolean }) {
```

Add local state for whether the Find Me flow is open:

```tsx
  const [findMeOpen, setFindMeOpen] = useState(false);
```

Render the banner near the top of the returned JSX (immediately after the `newCount` sticky button, before the `hasJustAdded` section), and the flow itself at the end alongside the existing `MediaLightbox` conditional:

```tsx
    {findMeEnabled && <button type="button" onClick={() => setFindMeOpen(true)} className="mx-auto block min-h-11 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-md" style={{ backgroundColor: accent }}>{tFindMe("banner")}</button>}
```

```tsx
    {findMeOpen && <FindMeFlow eventId={eventId} accent={accent} surface={surface} onClose={() => setFindMeOpen(false)} />}
```

Add the import:

```tsx
import { FindMeFlow } from "./FindMeFlow";
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd src/components/invitations/memories && npx tsx --test GuestGalleryView.test.tsx
```

Expected: still FAIL at this point — `FindMeFlow` doesn't exist yet, so the import breaks the module. This is expected; proceed to the next step and re-run afterward.

- [ ] **Step 7: Write the failing tests for `FindMeFlow`**

Create `src/components/invitations/memories/FindMeFlow.test.tsx`. Follow the exact mounting-harness conventions already established in this directory (`quietVirtualConsole`, `GLOBAL_KEYS` including `"fetch"`, a `trackingFetch`/`jsonResponse` pair, `NextIntlClientProvider` with `enMessages`, per-dispatch `act()` — see `MediaLightbox.test.tsx` for the canonical version of all of these in one file):

```ts
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM, VirtualConsole } from "jsdom";
import enMessages from "../../../../messages/en.json";

Object.assign(globalThis, { React });

function quietVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  return virtualConsole;
}

const GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "Event", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function flush(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withMountedFindMeFlow(
  fetchImpl: (url: string) => Promise<Response>,
  callback: (ctx: { dom: JSDOM }) => Promise<void>,
) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test", virtualConsole: quietVirtualConsole() });
  const originals = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const trackingFetch = async (input: RequestInfo | URL) => fetchImpl(String(input));

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event,
    fetch: trackingFetch,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

  const { createRoot } = await import("react-dom/client");
  const { FindMeFlow } = await import("./FindMeFlow");
  const root = createRoot(dom.window.document.querySelector("#root")!);

  try {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
          <FindMeFlow eventId="event-1" accent="#6D456F" surface="#ffffff" onClose={() => {}} />
        </NextIntlClientProvider>,
      );
      await flush();
    });
    await callback({ dom });
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}

test("shows consent copy and a file input before anything is submitted", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [] }),
    async ({ dom }) => {
      const text = dom.window.document.body.textContent ?? "";
      assert.match(text, /Take or upload a selfie/);
      assert.ok(dom.window.document.querySelector('input[type="file"]'), "expected a file input for the selfie");
    },
  );
});

test("submitting a selfie posts to the find-me endpoint and shows results", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [{ id: "m1", mediaKind: "photo", uploaderDisplayName: null, objectKeyDisplay: "d", objectKeyThumbnail: "t", capturedAt: null, uploadedAt: "2026-09-24T20:00:00Z" }] }),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.ok(dom.window.document.querySelector('img[src="/api/memories/media/m1/thumbnail"]'), "expected a result thumbnail for the matched photo");
    },
  );
});

test("shows the empty state when no matches are found", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ media: [] }),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.match(dom.window.document.body.textContent ?? "", /No matches found/);
    },
  );
});

test("shows the rate-limit message on a 429", async () => {
  await withMountedFindMeFlow(
    async () => jsonResponse({ error: "too many searches" }, 429),
    async ({ dom }) => {
      const input = dom.window.document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new dom.window.File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" });
      Object.defineProperty(input, "files", { value: [file] });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        await flush(50);
      });
      assert.match(dom.window.document.body.textContent ?? "", /reached the search limit/);
    },
  );
});
```

- [ ] **Step 8: Run the tests to verify they fail**

```bash
cd src/components/invitations/memories && npx tsx --test FindMeFlow.test.tsx
```

Expected: FAIL — `FindMeFlow.tsx` doesn't exist yet.

- [ ] **Step 9: Implement `FindMeFlow.tsx`**

Create `src/components/invitations/memories/FindMeFlow.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { MediaLightbox } from "./MediaLightbox";

type FindMeStatus = "idle" | "searching" | "results" | "empty" | "rate_limited" | "error";

export function FindMeFlow({ eventId, accent, surface, onClose }: { eventId: string; accent: string; surface: string; onClose: () => void }) {
  const t = useTranslations("invitations.public.memories.findMe");
  const [status, setStatus] = useState<FindMeStatus>("idle");
  const [results, setResults] = useState<PublicMemoryMedia[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setStatus("searching");
    try {
      const response = await fetch(`/api/memories/events/${eventId}/find-me`, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (response.status === 429) {
        setStatus("rate_limited");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const payload = (await response.json()) as { media?: PublicMemoryMedia[] };
      const media = Array.isArray(payload?.media) ? payload.media : [];
      setResults(media);
      setStatus(media.length > 0 ? "results" : "empty");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 overflow-y-auto p-4" style={{ backgroundColor: surface }}>
      <button type="button" onClick={onClose} className="mb-4 min-h-11 text-sm font-semibold" style={{ color: accent }}>
        {t("close")}
      </button>

      {(status === "idle" || status === "searching") && (
        <div className="space-y-4 text-center">
          <h2 className="text-xl font-semibold">{t("consentTitle")}</h2>
          <p className="text-sm opacity-80">{t("consentBody")}</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="user"
            aria-label={t("captureLabel")}
            disabled={status === "searching"}
            onChange={(event) => void handleFile(event.target.files)}
            className="mx-auto block"
          />
          {status === "searching" && <p role="status" className="text-sm font-medium">{t("searching")}</p>}
        </div>
      )}

      {status === "empty" && <p className="p-8 text-center text-sm" style={{ color: accent }}>{t("empty")}</p>}
      {status === "error" && <p role="alert" className="p-8 text-center text-sm text-red-700">{t("error")}</p>}
      {status === "rate_limited" && <p role="alert" className="p-8 text-center text-sm text-red-700">{t("tooManyAttempts")}</p>}

      {status === "results" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t("resultsTitle")}</h2>
          <div className="columns-2 gap-2 sm:columns-3">
            {results.map((item, index) => (
              <button key={item.id} type="button" onClick={() => setLightboxIndex(index)} className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl">
                <img src={`/api/memories/media/${item.id}/thumbnail`} alt="" className="h-auto w-full" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <MediaLightbox media={results} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
    </div>
  );
}
```

- [ ] **Step 10: Run the tests to verify they pass**

```bash
cd src/components/invitations/memories && npx tsx --test FindMeFlow.test.tsx GuestGalleryView.test.tsx
```

Expected: PASS — all `FindMeFlow.test.tsx` tests, and every `GuestGalleryView.test.tsx` test (pre-existing ones updated in Step 3 to pass `findMeEnabled={false}`, plus the new banner test).

- [ ] **Step 11: Typecheck and full build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 12: Run the full existing Memories test suite to check for regressions**

```bash
npx tsx --test 'src/components/invitations/memories/**/*.test.tsx' 'src/components/invitations/memories/**/*.test.ts' 'src/lib/invitations/memories/**/*.test.ts' 'src/app/api/memories/**/*.test.ts' 'src/app/api/invitations/events/**/*.test.ts'
```

Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add src/app/invite/\[slug\]/memories/page.tsx src/components/invitations/memories/GuestMemoriesApp.tsx src/components/invitations/memories/GuestGalleryView.tsx src/components/invitations/memories/GuestGalleryView.test.tsx src/components/invitations/memories/FindMeFlow.tsx src/components/invitations/memories/FindMeFlow.test.tsx messages/en.json messages/es.json
git commit -m "feat: add guest-facing Find Me flow"
```
