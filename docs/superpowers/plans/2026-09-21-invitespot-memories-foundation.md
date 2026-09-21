# InviteSpot Memories — Foundation & Processing (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation for InviteSpot Memories — guests can upload a photo/video, it gets stored in R2, processed into gallery-ready derivatives, and automatically moderated, ending as a queryable "gallery-visible" row in Supabase. No guest-facing or host-facing UI is built in this plan (that's Plan B) — every deliverable here is verifiable via API calls, unit tests, and direct Supabase queries.

**Architecture:** Cloudflare owns the media plane (R2 storage, an Event-Notification-triggered Queue, a Worker running `@cf-wasm/photon` for resize/EXIF-strip). Next.js/Vercel owns the application plane (upload authorization, the data model, and — new in this plan — an AWS Rekognition-backed moderation step). The Worker never calls an AI/vision API itself; instead its last action is a fire-and-forget call to a new internal Next.js route that performs moderation, keeping the Worker a lean media-processing plane and AWS credentials out of the Cloudflare environment entirely.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres), Cloudflare R2 + Queues + Workers, `@cf-wasm/photon` (Worker-side image processing), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2 presigned URLs — R2 is S3-compatible), `@aws-sdk/client-rekognition` (moderation).

**Spec:**
- `docs/superpowers/specs/2026-09-20-invitespot-memories-processing-design.md` (processing pipeline)
- `docs/superpowers/specs/2026-09-21-invitespot-memories-experience-design.md` (data model, moderation, identity — supersedes spec 1's draft `moderation_status` enum and `gallery_visible` formula)

## Global Constraints

- TypeScript strict, no `any`, everywhere in `src/`.
- Every new module under `src/lib/invitations/memories/` must **never** import from `src/lib/invitations/repository.ts` (it starts with `import "server-only"`, which throws under `tsx --test`). Use `createAdminClient()` from `@/lib/supabase/admin` directly, exactly as `src/lib/invitations/notifications.ts` and `broadcasts.ts` already do.
- Every host-facing route reuses `requireInvitationAccess(request, eventId)` from `src/lib/invitations/access.ts` unchanged — no new admin/owner auth system. It returns `Promise<InvitationAccess | null>` where `InvitationAccess = {kind:"founder"} | {kind:"owner", ownerId:string}`.
- All HMAC signing follows the exact pattern in `src/lib/invitations/auth.ts`'s `signInvitationPasscodeSession`/`verifyInvitationPasscodeSession`: `createHmac("sha256", secret).update("<domain-tag>." + body).digest("base64url")`, ticket format `${body}.${signature}`, secret from `process.env.SESSION_COOKIE_SECRET` (must be ≥32 chars, throw if not), verified with `timingSafeEqual`.
- Migration SQL is tested by reading the file as text and regex/substring-matching its structure (see `src/lib/invitations/rsvp-migration-contract.test.ts`) — **not** a live database connection. New migration test files follow the `<feature>-migration-contract.test.ts` naming convention.
- Every test file uses `node:test` + `node:assert/strict`, run via `npx tsx --test <file>`.
- Run `npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)`, `npx tsc --noEmit`, and `npm run build` before every commit — `npm run build` specifically because a past ESLint-only failure (unused import) passed tests/typecheck and broke a live Vercel deploy.
- `memory_media.moderation_status` has **five** values: `pending`, `awaiting_host_review`, `approved`, `flagged`, `rejected` (per spec 2's self-review fix — `pending` means "not yet safety-checked," `awaiting_host_review` means "safety-checked clean, waiting on a host in review-required mode," and these must never be conflated).
- `gallery_visible` is **always computed, never stored**: `upload_status = 'uploaded' AND processing_status = 'ready' AND moderation_status = 'approved'`.
- New env vars (add to `.env.example` as each task introduces them): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_MEMORIES`, `CLOUDFLARE_QUEUES_API_TOKEN`, `MEMORIES_INTERNAL_SECRET` (server-to-server auth between the Worker and the new moderation route — separate from `SESSION_COOKIE_SECRET`, which is guest/host-facing), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (standard AWS SDK default credential env vars — read automatically by `@aws-sdk/client-rekognition`, no custom plumbing needed).
- **Known scope note carried from spec review:** host bulk-download of originals was named in spec 1 as part of "V1 Foundation Part 1" but never given its own design section. This plan does not include it — Plan B's task list should pick it up explicitly (it's guest/host-experience-shaped: a signed-URL-backed download button), not silently drop it.
- **Deliberate V1 simplification made in this plan, not stated verbatim in either spec:** Rekognition's Video moderation API is asynchronous (start/poll or SNS-notified) and materially more complex than the synchronous Image API. To avoid building that async job-polling infrastructure for V1, video moderation runs Rekognition's **Image** moderation (`DetectModerationLabels`) against the client-captured poster frame (already planned as a companion image asset per spec 2's video-thumbnail note) rather than the full video timeline. This is a real, named limitation — flag it to the user before or during implementation review, don't let it pass as if it were already decided in the spec.
- **Correction to spec 1's object key convention, found during this plan's self-review — flag to the user, this is a real bug fix, not a style choice:** spec 1 specified keys as `{eventId}/memories/originals|display|thumbnails/{mediaId}.{ext}` (borrowed from `direct-media.ts`'s Supabase Storage convention) and paired it with an R2 event notification rule filtered by `--prefix "originals/"`. R2 prefix filters match from the **start** of the object key only — under that key shape, no object ever actually starts with `"originals/"` (they all start with a variable `{eventId}`), so the notification would never fire and the entire pipeline would silently never trigger in production, with uploads stuck at `processing_status = 'pending'` forever and no error anywhere. This plan uses a corrected key shape instead, with the stage as the **first** path segment so one bucket-wide prefix filter genuinely matches every event's originals:
  ```
  originals/{eventId}/{mediaId}.{ext}
  display/{eventId}/{mediaId}.webp
  thumbnails/{eventId}/{mediaId}.webp
  ```
  (The redundant `memories/` segment is also dropped — the bucket itself, `invitespot-memories`, is already dedicated to this feature.) Every task below uses this corrected shape.

---

## File Structure

```
supabase/migrations/056_invitation_memories_foundation.sql   (new)
src/lib/invitations/memories-migration-contract.test.ts      (new)
src/lib/invitations/memories/
  types.ts                (new — shared TS types mirroring the DB enums/shapes)
  guest-session.ts         (new — MemoriesGuestSession sign/verify)
  guest-session.test.ts    (new)
  storage-provider.ts      (new — StorageProvider interface + R2 implementation)
  storage-provider.test.ts (new)
  upload-tickets.ts        (new — presigned-upload ticket issuance, modeled on direct-media.ts)
  upload-tickets.test.ts   (new)
  repository.ts            (new — local inline Supabase queries for memory_media/memory_moments/etc.)
  repository.test.ts       (new)
  processing-provider.ts   (new — ProcessingProvider interface, shared with the Worker)
  ai-provider.ts           (new — AIProvider interface + Rekognition implementation)
  ai-provider.test.ts      (new)
  gallery.ts               (new — computeGalleryVisible + visible-media query helpers)
  gallery.test.ts          (new)
src/app/api/memories/events/[eventId]/upload/init/route.ts     (new)
src/app/api/memories/events/[eventId]/upload/complete/route.ts (new)
src/app/api/memories/moderate/route.ts        (new — internal, Worker-triggered)
src/app/api/cron/memories-dlq-drain/route.ts  (new)
workers/memories-processing/
  wrangler.toml            (new)
  src/index.ts              (new — Queue consumer, orchestrates processing-provider.ts)
  src/processing-provider.ts (new — @cf-wasm/photon implementation)
.env.example               (modified — new vars above)
vercel.json                 (modified — register memories-dlq-drain cron)
package.json                 (modified — new AWS SDK + @cf-wasm/photon dependencies)
```

---

### Task 1: Memories data model migration

**Files:**
- Create: `supabase/migrations/056_invitation_memories_foundation.sql`
- Test: `src/lib/invitations/memories-migration-contract.test.ts`

**Interfaces:**
- Produces: the `memory_media`, `memory_upload_sessions`, `memory_moments`, `memory_moment_media`, `memory_processing_jobs` tables, and `invitation_events.memories_enabled`/`memories_mode`, which every later task reads/writes.

- [ ] **Step 1: Write the migration**

```sql
-- 056_invitation_memories_foundation.sql

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS memories_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS memories_mode text NOT NULL DEFAULT 'auto_publish';

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_memories_mode_check,
  ADD CONSTRAINT invitation_events_memories_mode_check
    CHECK (memories_mode IN ('auto_publish', 'review_required'));

CREATE TABLE public.memory_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id),

  uploader_rsvp_id uuid REFERENCES public.invitation_rsvps(id),
  uploader_display_name text,
  guest_session_level text NOT NULL
    CHECK (guest_session_level IN ('rsvp_guest', 'anonymous')),

  media_kind text NOT NULL
    CHECK (media_kind IN ('photo', 'video')),
  object_key_original text NOT NULL UNIQUE,
  object_key_display text,
  object_key_thumbnail text,

  captured_at timestamptz,
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  upload_status text NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'uploaded', 'upload_failed')),
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'processing_failed')),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'awaiting_host_review', 'approved', 'flagged', 'rejected')),
  ai_status text NOT NULL DEFAULT 'not_started'
    CHECK (ai_status IN ('not_started', 'processing', 'enriched', 'ai_failed')),

  moderation_score numeric,
  moderation_categories text[],

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX memory_media_event_captured_idx ON public.memory_media (event_id, captured_at);
CREATE INDEX memory_media_event_moderation_pending_idx ON public.memory_media (event_id, moderation_status)
  WHERE moderation_status IN ('pending', 'awaiting_host_review', 'flagged');

ALTER TABLE public.memory_media ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.memory_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id),
  guest_session_fingerprint text NOT NULL,
  total_files integer NOT NULL,
  completed_files integer NOT NULL DEFAULT 0,
  failed_files integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.memory_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id),
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE public.memory_moments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.memory_moment_media (
  media_id uuid PRIMARY KEY REFERENCES public.memory_media(id),
  moment_id uuid NOT NULL REFERENCES public.memory_moments(id),
  source text NOT NULL CHECK (source IN ('host_override', 'ai_classified')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_moment_media ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.memory_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.memory_media(id),
  job_type text NOT NULL CHECK (job_type IN ('derivative', 'ai_enrich')),
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead_letter')),
  error_code text,
  error_detail text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (media_id, job_type, attempt)
);

ALTER TABLE public.memory_processing_jobs ENABLE ROW LEVEL SECURITY;
```

No RLS policies are added on purpose: every new table is accessed exclusively through server-side API routes using `createAdminClient()` (the service-role client, which bypasses RLS by design). Enabling RLS with zero policies denies all anon/authenticated direct access — the correct default for tables this module's guests and hosts never query directly via a Supabase session.

- [ ] **Step 2: Write the migration contract test**

```ts
// src/lib/invitations/memories-migration-contract.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/056_invitation_memories_foundation.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("moderation_status includes the five-value enum, in order of severity discussion", () => {
  const idx = migration.indexOf(
    "CHECK (moderation_status IN ('pending', 'awaiting_host_review', 'approved', 'flagged', 'rejected'))",
  );
  assert.ok(idx >= 0, "moderation_status CHECK constraint must list all five values exactly");
});

test("memory_media enforces a unique original object key", () => {
  assert.ok(migration.includes("object_key_original text NOT NULL UNIQUE"));
});

test("memory_moments rejects an inverted or zero-length time window", () => {
  assert.ok(migration.includes("CHECK (ends_at > starts_at)"));
});

test("memory_moment_media has exactly one override row per media item", () => {
  const idx = migration.indexOf("CREATE TABLE public.memory_moment_media");
  const pk = migration.indexOf("media_id uuid PRIMARY KEY", idx);
  assert.ok(idx >= 0 && pk > idx, "media_id must be the primary key, not a composite key");
});

test("every new table enables row level security", () => {
  for (const table of [
    "memory_media",
    "memory_upload_sessions",
    "memory_moments",
    "memory_moment_media",
    "memory_processing_jobs",
  ]) {
    assert.ok(
      migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`),
      `${table} must enable RLS`,
    );
  }
});

test("invitation_events gains a mode column constrained to the two designed modes", () => {
  assert.ok(
    migration.includes("CHECK (memories_mode IN ('auto_publish', 'review_required'))"),
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories-migration-contract.test.ts`
Expected: FAIL — `ENOENT` reading the migration file, since it doesn't exist yet. (If writing the test after the migration file already exists, temporarily rename the file to confirm the test actually fails without it, then rename back — the goal is proving the test isn't vacuously passing.)

- [ ] **Step 4: Apply the migration locally and run the test**

Run: `npx supabase db push`, then:
Run: `npx tsx --test src/lib/invitations/memories-migration-contract.test.ts`
Expected: PASS (all five assertions)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/056_invitation_memories_foundation.sql src/lib/invitations/memories-migration-contract.test.ts
git commit -m "feat: add InviteSpot Memories data model migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: MemoriesGuestSession signing

**Files:**
- Create: `src/lib/invitations/memories/types.ts`
- Create: `src/lib/invitations/memories/guest-session.ts`
- Test: `src/lib/invitations/memories/guest-session.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `MemoriesGuestSession` type, `signMemoriesGuestSession(session, secret?) => string`, `verifyMemoriesGuestSession(token, eventId, secret?, now?) => MemoriesGuestSession | null` — used by Task 4's upload routes and by every Plan B guest-facing route.

- [ ] **Step 1: Write `types.ts`**

```ts
// src/lib/invitations/memories/types.ts
export type MemoriesGuestLevel = "rsvp_guest" | "anonymous";

export interface MemoriesGuestSession {
  eventId: string;
  level: MemoriesGuestLevel;
  rsvpId?: string;
  guestName?: string;
  expiresAt: number; // unix seconds
}

export type MediaKind = "photo" | "video";
export type UploadStatus = "pending" | "uploaded" | "upload_failed";
export type ProcessingStatus = "pending" | "processing" | "ready" | "processing_failed";
export type ModerationStatus =
  | "pending"
  | "awaiting_host_review"
  | "approved"
  | "flagged"
  | "rejected";
export type AiStatus = "not_started" | "processing" | "enriched" | "ai_failed";

export interface MemoryMedia {
  id: string;
  eventId: string;
  uploaderRsvpId: string | null;
  uploaderDisplayName: string | null;
  guestSessionLevel: MemoriesGuestLevel;
  mediaKind: MediaKind;
  objectKeyOriginal: string;
  objectKeyDisplay: string | null;
  objectKeyThumbnail: string | null;
  capturedAt: string | null;
  uploadedAt: string;
  uploadStatus: UploadStatus;
  processingStatus: ProcessingStatus;
  moderationStatus: ModerationStatus;
  aiStatus: AiStatus;
  moderationScore: number | null;
  moderationCategories: string[] | null;
}
```

- [ ] **Step 2: Write the failing test for guest session signing**

```ts
// src/lib/invitations/memories/guest-session.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { signMemoriesGuestSession, verifyMemoriesGuestSession } from "./guest-session";

const secret = "x".repeat(32);

test("a signed anonymous guest session verifies for its own event", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "anonymous", expiresAt: 2_000 },
    secret,
  );
  const result = verifyMemoriesGuestSession(token, "event-1", secret, 1_999);
  assert.deepEqual(result, { eventId: "event-1", level: "anonymous", expiresAt: 2_000 });
});

test("a session signed for one event is rejected when checked against another event", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "anonymous", expiresAt: 2_000 },
    secret,
  );
  assert.equal(verifyMemoriesGuestSession(token, "event-2", secret, 1_999), null);
});

test("an expired session is rejected even with a valid signature", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "anonymous", expiresAt: 1_000 },
    secret,
  );
  assert.equal(verifyMemoriesGuestSession(token, "event-1", secret, 1_001), null);
});

test("a tampered token is rejected", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "rsvp_guest", rsvpId: "rsvp-1", expiresAt: 2_000 },
    secret,
  );
  const tampered = token.slice(0, -4) + "abcd";
  assert.equal(verifyMemoriesGuestSession(tampered, "event-1", secret, 1_999), null);
});

test("an rsvp_guest session round-trips its rsvpId and optional guestName", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "rsvp_guest", rsvpId: "rsvp-1", guestName: "Aisha T.", expiresAt: 2_000 },
    secret,
  );
  const result = verifyMemoriesGuestSession(token, "event-1", secret, 1_999);
  assert.deepEqual(result, {
    eventId: "event-1",
    level: "rsvp_guest",
    rsvpId: "rsvp-1",
    guestName: "Aisha T.",
    expiresAt: 2_000,
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/guest-session.test.ts`
Expected: FAIL with "Cannot find module './guest-session'"

- [ ] **Step 4: Implement `guest-session.ts`, mirroring `auth.ts`'s passcode-session pattern exactly**

```ts
// src/lib/invitations/memories/guest-session.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MemoriesGuestSession } from "./types";

function getSessionSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signMemoriesGuestSession(
  session: MemoriesGuestSession,
  secret = getSessionSecret(),
): string {
  const body = encodeBase64Url(JSON.stringify(session));
  const signature = createHmac("sha256", secret).update(`memories-guest.${body}`).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyMemoriesGuestSession(
  token: string,
  eventId: string,
  secret = getSessionSecret(),
  now = Math.floor(Date.now() / 1000),
): MemoriesGuestSession | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expectedSignature = createHmac("sha256", secret).update(`memories-guest.${body}`).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  let session: MemoriesGuestSession;
  try {
    session = JSON.parse(decodeBase64Url(body)) as MemoriesGuestSession;
  } catch {
    return null;
  }

  if (session.eventId !== eventId) return null;
  if (session.expiresAt <= now) return null;

  return session;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/memories/guest-session.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/types.ts src/lib/invitations/memories/guest-session.ts src/lib/invitations/memories/guest-session.test.ts
git commit -m "feat: sign and verify InviteSpot Memories guest sessions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: StorageProvider interface + R2 implementation + upload tickets

**Files:**
- Create: `src/lib/invitations/memories/storage-provider.ts`
- Test: `src/lib/invitations/memories/storage-provider.test.ts`
- Create: `src/lib/invitations/memories/upload-tickets.ts`
- Test: `src/lib/invitations/memories/upload-tickets.test.ts`
- Modify: `.env.example` — add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_MEMORIES`
- Modify: `package.json` — add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`

**Interfaces:**
- Consumes: nothing from other tasks (parallel-safe with Task 2).
- Produces: `StorageProvider` interface + `R2StorageProvider` class; `createMemoriesUploadTicket(eventId, mediaId, mediaKind, secret?) => {ticket, objectKey}` and `verifyMemoriesUploadTicket(ticket, eventId, mediaId, secret?) => boolean` — consumed by Task 4's `upload/init` route.

- [ ] **Step 1: Install dependencies**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Write the `StorageProvider` interface and a fake for tests**

```ts
// src/lib/invitations/memories/storage-provider.ts
export interface StorageProvider {
  createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number): Promise<string>;
  getSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
}

export class R2StorageProvider implements StorageProvider {
  private readonly client: import("@aws-sdk/client-s3").S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = requireEnv("R2_ACCOUNT_ID");
    this.bucket = requireEnv("R2_BUCKET_MEMORIES");
    const { S3Client } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  async createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number): Promise<string> {
    const { PutObjectCommand } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner") as typeof import("@aws-sdk/s3-request-presigner");
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    const { GetObjectCommand } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner") as typeof import("@aws-sdk/s3-request-presigner");
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(objectKey: string): Promise<void> {
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
```

- [ ] **Step 3: Write a fake provider test proving the interface shape (no real R2 touched)**

```ts
// src/lib/invitations/memories/storage-provider.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import type { StorageProvider } from "./storage-provider";

class FakeStorageProvider implements StorageProvider {
  public readonly uploadUrls: string[] = [];
  async createPresignedUploadUrl(objectKey: string): Promise<string> {
    const url = `https://fake.r2/${objectKey}`;
    this.uploadUrls.push(url);
    return url;
  }
  async getSignedDownloadUrl(objectKey: string): Promise<string> {
    return `https://fake.r2/${objectKey}?signed=1`;
  }
  async deleteObject(): Promise<void> {}
}

test("a fake StorageProvider satisfies the interface consumers rely on", async () => {
  const provider: StorageProvider = new FakeStorageProvider();
  const url = await provider.createPresignedUploadUrl("originals/event-1/media-1.jpg", "image/jpeg", 900);
  assert.match(url, /media-1\.jpg/);
});
```

- [ ] **Step 4: Run test to verify it passes** (this test only exercises the fake, proving the interface contract — the real `R2StorageProvider` is exercised by `wrangler dev` / integration testing per the first spec's testing strategy, not `tsx --test`)

Run: `npx tsx --test src/lib/invitations/memories/storage-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for upload tickets**

```ts
// src/lib/invitations/memories/upload-tickets.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoriesUploadTicket, verifyMemoriesUploadTicket } from "./upload-tickets";

const secret = "x".repeat(32);

test("a ticket verifies for the exact event and media it was issued for", () => {
  const { ticket, objectKey } = createMemoriesUploadTicket("event-1", "media-1", "photo", secret);
  assert.equal(objectKey, "originals/event-1/media-1.jpg");
  assert.equal(verifyMemoriesUploadTicket(ticket, "event-1", "media-1", secret), true);
});

test("a ticket for one media item is rejected against a different media id", () => {
  const { ticket } = createMemoriesUploadTicket("event-1", "media-1", "photo", secret);
  assert.equal(verifyMemoriesUploadTicket(ticket, "event-1", "media-2", secret), false);
});

test("video tickets use a video-appropriate extension", () => {
  const { objectKey } = createMemoriesUploadTicket("event-1", "media-2", "video", secret);
  assert.equal(objectKey, "originals/event-1/media-2.mp4");
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/upload-tickets.test.ts`
Expected: FAIL with "Cannot find module './upload-tickets'"

- [ ] **Step 7: Implement `upload-tickets.ts`, modeled on `direct-media.ts`'s ticket pattern**

```ts
// src/lib/invitations/memories/upload-tickets.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MediaKind } from "./types";

function getTicketSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return secret;
}

function extensionFor(mediaKind: MediaKind): string {
  return mediaKind === "video" ? "mp4" : "jpg";
}

export function objectKeyForOriginal(eventId: string, mediaId: string, mediaKind: MediaKind): string {
  return `originals/${eventId}/${mediaId}.${extensionFor(mediaKind)}`;
}

export function createMemoriesUploadTicket(
  eventId: string,
  mediaId: string,
  mediaKind: MediaKind,
  secret = getTicketSecret(),
): { ticket: string; objectKey: string } {
  const objectKey = objectKeyForOriginal(eventId, mediaId, mediaKind);
  const body = Buffer.from(JSON.stringify({ eventId, mediaId, objectKey })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`memories-upload-ticket-v1:${body}`).digest("base64url");
  return { ticket: `${body}.${signature}`, objectKey };
}

export function verifyMemoriesUploadTicket(
  ticket: string,
  eventId: string,
  mediaId: string,
  secret = getTicketSecret(),
): boolean {
  const parts = ticket.split(".");
  if (parts.length !== 2) return false;
  const [body, signature] = parts;

  const expected = createHmac("sha256", secret).update(`memories-upload-ticket-v1:${body}`).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  let parsed: { eventId: string; mediaId: string; objectKey: string };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  return parsed.eventId === eventId && parsed.mediaId === mediaId;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/memories/upload-tickets.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 9: Add the new env vars to `.env.example`**

```
# InviteSpot Memories — R2 storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_MEMORIES=invitespot-memories
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/invitations/memories/storage-provider.ts src/lib/invitations/memories/storage-provider.test.ts src/lib/invitations/memories/upload-tickets.ts src/lib/invitations/memories/upload-tickets.test.ts .env.example package.json package-lock.json
git commit -m "feat: add R2 StorageProvider and Memories upload tickets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: memory_media repository + upload init/complete API routes

**Files:**
- Create: `src/lib/invitations/memories/repository.ts`
- Test: `src/lib/invitations/memories/repository.test.ts`
- Create: `src/app/api/memories/events/[eventId]/upload/init/route.ts`
- Create: `src/app/api/memories/events/[eventId]/upload/complete/route.ts`

**Interfaces:**
- Consumes: `MemoriesGuestSession`/`verifyMemoriesGuestSession` (Task 2), `createMemoriesUploadTicket` (Task 3), `MemoryMedia` type (Task 2), `isInvitationE2EFixturesEnabled()` (existing, from the RSVP/broadcast E2E fixture layer).
- Produces: `createPendingMemoryMedia(...)`, `markMemoryMediaUploaded(mediaId)`, `getMemoryMediaById(mediaId)` — consumed by Task 5 (Worker lookups by `object_key_original`) and Task 7 (moderation route).

**Note on E2E fixtures:** spec 1's testing strategy reuses the existing `INVITATION_E2E_FIXTURES=1` convention (fixture-mode uploads skip R2 entirely and simulate an already-`ready` row) — the same convention `broadcasts.ts` was found to have bypassed during the guest-messages epic's final review, a known real bug class in this codebase. Before writing `upload/init/route.ts` below, grep for `isInvitationE2EFixturesEnabled` (used by the existing RSVP/broadcast E2E paths) and confirm its exact import path and signature, then wire it in as shown — do not skip this check on the assumption it doesn't apply here.

- [ ] **Step 1: Write the failing repository test**

```ts
// src/lib/invitations/memories/repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { objectKeyForOriginal } from "./upload-tickets";

// Repository functions hit a real Supabase instance via createAdminClient(),
// exactly like notifications.test.ts does — this test only proves the pure,
// non-DB helper it depends on is wired correctly. Full CRUD is exercised by
// route-level tests in Task 4 Step 6 against the API surface, following this
// module's existing convention of not mocking the DB in integration paths.
test("object key derivation used by the repository stays event- and media-scoped", () => {
  const key = objectKeyForOriginal("event-1", "media-1", "photo");
  assert.equal(key, "originals/event-1/media-1.jpg");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: FAIL — `repository.ts` doesn't exist, so nothing in the file compiles (the import of `upload-tickets` still resolves, but run it anyway to confirm the harness is wired before adding `repository.ts`).

- [ ] **Step 3: Implement `repository.ts`**

```ts
// src/lib/invitations/memories/repository.ts
import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaKind, MemoriesGuestLevel, MemoryMedia } from "./types";

function mapRow(row: Record<string, unknown>): MemoryMedia {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    uploaderRsvpId: (row.uploader_rsvp_id as string | null) ?? null,
    uploaderDisplayName: (row.uploader_display_name as string | null) ?? null,
    guestSessionLevel: row.guest_session_level as MemoriesGuestLevel,
    mediaKind: row.media_kind as MediaKind,
    objectKeyOriginal: row.object_key_original as string,
    objectKeyDisplay: (row.object_key_display as string | null) ?? null,
    objectKeyThumbnail: (row.object_key_thumbnail as string | null) ?? null,
    capturedAt: (row.captured_at as string | null) ?? null,
    uploadedAt: row.uploaded_at as string,
    uploadStatus: row.upload_status as MemoryMedia["uploadStatus"],
    processingStatus: row.processing_status as MemoryMedia["processingStatus"],
    moderationStatus: row.moderation_status as MemoryMedia["moderationStatus"],
    aiStatus: row.ai_status as MemoryMedia["aiStatus"],
    moderationScore: (row.moderation_score as number | null) ?? null,
    moderationCategories: (row.moderation_categories as string[] | null) ?? null,
  };
}

export async function createPendingMemoryMedia(input: {
  id: string;
  eventId: string;
  mediaKind: MediaKind;
  objectKeyOriginal: string;
  guestSessionLevel: MemoriesGuestLevel;
  uploaderRsvpId: string | null;
  uploaderDisplayName: string | null;
}): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.from("memory_media").insert({
    id: input.id,
    event_id: input.eventId,
    media_kind: input.mediaKind,
    object_key_original: input.objectKeyOriginal,
    guest_session_level: input.guestSessionLevel,
    uploader_rsvp_id: input.uploaderRsvpId,
    uploader_display_name: input.uploaderDisplayName,
  });
  if (error) throw new Error(`failed to create memory_media row: ${error.message}`);
}

export async function markMemoryMediaUploaded(mediaId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({ upload_status: "uploaded" })
    .eq("id", mediaId)
    .eq("upload_status", "pending"); // idempotent: a redelivered "complete" call can't regress or double-apply
  if (error) throw new Error(`failed to mark memory_media uploaded: ${error.message}`);

  // memory_processing_jobs is the durable, retryable unit of work the DLQ drain (Task 6)
  // and any future host-facing "retry" control operate on — it must exist before the R2
  // event notification fires the Worker, not be created reactively after the fact.
  const { error: jobError } = await client
    .from("memory_processing_jobs")
    .upsert(
      { media_id: mediaId, job_type: "derivative", attempt: 1, status: "pending" },
      { onConflict: "media_id,job_type,attempt", ignoreDuplicates: true },
    );
  if (jobError) throw new Error(`failed to queue memory_processing_jobs row: ${jobError.message}`);
}

export async function getMemoryMediaById(mediaId: string): Promise<MemoryMedia | null> {
  const client = createAdminClient();
  const { data, error } = await client.from("memory_media").select("*").eq("id", mediaId).maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function simulateFixtureMediaReady(mediaId: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({
      processing_status: "ready",
      moderation_status: "approved",
      object_key_display: `fixture/${mediaId}.webp`,
      object_key_thumbnail: `fixture/${mediaId}.webp`,
    })
    .eq("id", mediaId);
  if (error) throw new Error(`failed to simulate fixture media: ${error.message}`);
}

export async function getEventMemoriesSettings(
  eventId: string,
): Promise<{ memoriesEnabled: boolean; memoriesMode: "auto_publish" | "review_required" } | null> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("invitation_events")
    .select("memories_enabled,memories_mode")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    memoriesEnabled: data.memories_enabled as boolean,
    memoriesMode: data.memories_mode as "auto_publish" | "review_required",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/invitations/memories/repository.test.ts`
Expected: PASS

- [ ] **Step 5: Implement the upload/init route**

```ts
// src/app/api/memories/events/[eventId]/upload/init/route.ts
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { createMemoriesUploadTicket } from "@/lib/invitations/memories/upload-tickets";
import {
  createPendingMemoryMedia,
  getEventMemoriesSettings,
  markMemoryMediaUploaded,
  simulateFixtureMediaReady,
} from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";
import type { MediaKind } from "@/lib/invitations/memories/types";
// Exact import path confirmed by grepping the existing RSVP/broadcast E2E fixture
// layer per the note above — update this if that grep finds a different path.
import { isInvitationE2EFixturesEnabled } from "@/lib/invitations/e2e-fixtures";

const ALLOWED_KINDS: MediaKind[] = ["photo", "video"];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — matches this module's existing video cap in direct-media.ts

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const { eventId } = params;
  const body = (await request.json()) as { mediaKind?: string; contentType?: string; sizeBytes?: number };

  if (!ALLOWED_KINDS.includes(body.mediaKind as MediaKind)) {
    return NextResponse.json({ error: "invalid mediaKind" }, { status: 400 });
  }
  if (typeof body.sizeBytes !== "number" || body.sizeBytes <= 0 || body.sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "invalid or oversized file" }, { status: 400 });
  }

  const settings = await getEventMemoriesSettings(eventId);
  if (!settings || !settings.memoriesEnabled) {
    return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
  }

  const sessionToken = request.cookies.get("memories_guest_session")?.value;
  const session = sessionToken ? verifyMemoriesGuestSession(sessionToken, eventId) : null;

  const mediaId = randomUUID();
  const mediaKind = body.mediaKind as MediaKind;
  const { ticket, objectKey } = createMemoriesUploadTicket(eventId, mediaId, mediaKind);

  await createPendingMemoryMedia({
    id: mediaId,
    eventId,
    mediaKind,
    objectKeyOriginal: objectKey,
    guestSessionLevel: session?.level ?? "anonymous",
    uploaderRsvpId: session?.rsvpId ?? null,
    uploaderDisplayName: session?.guestName ?? null,
  });

  if (isInvitationE2EFixturesEnabled()) {
    // Fixture mode: never touch real R2. Simulate an already-uploaded,
    // already-processed, already-approved row so Playwright can exercise the
    // gallery immediately, matching the RSVP/broadcast E2E fixture convention.
    await markMemoryMediaUploaded(mediaId);
    await simulateFixtureMediaReady(mediaId);
    return NextResponse.json({ mediaId, ticket, uploadUrl: `https://fixture.local/${objectKey}` });
  }

  const storage = new R2StorageProvider();
  const uploadUrl = await storage.createPresignedUploadUrl(
    objectKey,
    body.contentType ?? (mediaKind === "video" ? "video/mp4" : "image/jpeg"),
    15 * 60,
  );

  return NextResponse.json({ mediaId, ticket, uploadUrl });
}
```

- [ ] **Step 6: Implement the upload/complete route**

```ts
// src/app/api/memories/events/[eventId]/upload/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyMemoriesUploadTicket } from "@/lib/invitations/memories/upload-tickets";
import { markMemoryMediaUploaded } from "@/lib/invitations/memories/repository";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const { eventId } = params;
  const body = (await request.json()) as { mediaId?: string; ticket?: string };

  if (!body.mediaId || !body.ticket) {
    return NextResponse.json({ error: "missing mediaId or ticket" }, { status: 400 });
  }
  if (!verifyMemoriesUploadTicket(body.ticket, eventId, body.mediaId)) {
    return NextResponse.json({ error: "invalid ticket" }, { status: 403 });
  }

  await markMemoryMediaUploaded(body.mediaId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts src/app/api/memories/events/[eventId]/upload/init/route.ts src/app/api/memories/events/[eventId]/upload/complete/route.ts
git commit -m "feat: add Memories upload init/complete API routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: ProcessingProvider interface + Cloudflare Worker (photon derivatives)

**Files:**
- Create: `src/lib/invitations/memories/processing-provider.ts`
- Create: `workers/memories-processing/wrangler.toml`
- Create: `workers/memories-processing/src/processing-provider.ts`
- Create: `workers/memories-processing/src/index.ts`
- Test: `src/lib/invitations/memories/processing-provider.test.ts`

**Interfaces:**
- Consumes: object key convention from Task 3 (`originals|display|thumbnails/{eventId}/{mediaId}.{ext}` — corrected shape, see the Global Constraints note above).
- Produces: the `ProcessingProvider` interface (shared type contract — the Worker's implementation lives in `workers/`, outside the Next.js `tsc` project, since it targets the Workers runtime, not Node).

- [ ] **Step 1: Write the shared interface**

```ts
// src/lib/invitations/memories/processing-provider.ts
export interface DerivativeResult {
  displayBytes: Uint8Array;
  thumbnailBytes: Uint8Array;
}

export interface ProcessingProvider {
  process(original: Uint8Array): Promise<DerivativeResult>;
}

export function deriveObjectKeys(eventId: string, mediaId: string): { display: string; thumbnail: string } {
  return {
    display: `display/${eventId}/${mediaId}.webp`,
    thumbnail: `thumbnails/${eventId}/${mediaId}.webp`,
  };
}
```

- [ ] **Step 2: Write the failing test for key derivation (the one piece of this task testable under `tsx --test`)**

```ts
// src/lib/invitations/memories/processing-provider.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { deriveObjectKeys } from "./processing-provider";

test("derivative keys are deterministic, stage-prefixed for R2 notification filtering, and event/media-scoped", () => {
  const keys = deriveObjectKeys("event-1", "media-1");
  assert.equal(keys.display, "display/event-1/media-1.webp");
  assert.equal(keys.thumbnail, "thumbnails/event-1/media-1.webp");
});

test("a redelivered event notification for the same media produces the same keys, not a duplicate", () => {
  const first = deriveObjectKeys("event-1", "media-1");
  const second = deriveObjectKeys("event-1", "media-1");
  assert.deepEqual(first, second);
});
```

- [ ] **Step 3: Run test to verify it fails, then implement and re-run to pass**

Run: `npx tsx --test src/lib/invitations/memories/processing-provider.test.ts` → FAIL (module missing) → implement Step 1's code → re-run → PASS

- [ ] **Step 4: Install the Worker's dependency and scaffold it**

```bash
mkdir -p workers/memories-processing/src
cd workers/memories-processing && npm init -y && npm install @cf-wasm/photon && cd ../..
```

```toml
# workers/memories-processing/wrangler.toml
name = "memories-processing"
main = "src/index.ts"
compatibility_date = "2026-09-21"

[[queues.consumers]]
queue = "memories-processing"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 5
dead_letter_queue = "memories-processing-dlq"

[[r2_buckets]]
binding = "MEMORIES_BUCKET"
bucket_name = "invitespot-memories"
```

- [ ] **Step 5: Implement the Worker's photon-based `ProcessingProvider`**

```ts
// workers/memories-processing/src/processing-provider.ts
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

export interface DerivativeResult {
  displayBytes: Uint8Array;
  thumbnailBytes: Uint8Array;
}

const DISPLAY_MAX_DIMENSION = 1600;
const THUMBNAIL_MAX_DIMENSION = 400;

export async function process(original: Uint8Array): Promise<DerivativeResult> {
  const image = PhotonImage.new_from_byteslice(original);
  try {
    const display = resizeToMax(image, DISPLAY_MAX_DIMENSION);
    const thumbnail = resizeToMax(image, THUMBNAIL_MAX_DIMENSION);
    return {
      displayBytes: display.get_bytes_webp(),
      thumbnailBytes: thumbnail.get_bytes_webp(),
    };
  } finally {
    image.free();
  }
}

function resizeToMax(image: PhotonImage, maxDimension: number): PhotonImage {
  const width = image.get_width();
  const height = image.get_height();
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);
  return resize(image, targetWidth, targetHeight, SamplingFilter.Lanczos3);
}
```

**Verification needed at implementation time (flagged, not assumed — per spec 1):** confirm against a real phone-camera JPEG whether `PhotonImage.new_from_byteslice` auto-applies EXIF orientation before the pixel buffer is decoded, or whether an explicit pre-rotation step is required first. Getting this wrong produces sideways thumbnails. This step cannot be verified by a unit test alone — it needs a real fixture image run through `wrangler dev`.

- [ ] **Step 6: Implement the Worker's Queue consumer**

```ts
// workers/memories-processing/src/index.ts
import { process } from "./processing-provider";

interface Env {
  MEMORIES_BUCKET: R2Bucket;
  MEMORIES_INTERNAL_SECRET: string;
  MEMORIES_APP_BASE_URL: string; // e.g. https://siteforowners.com
}

interface R2EventNotification {
  object: { key: string };
}

export default {
  async queue(batch: MessageBatch<R2EventNotification>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await handleOne(message.body, env);
        message.ack();
      } catch (err) {
        console.error("memories-processing: failed to process", message.body.object.key, err);
        message.retry();
      }
    }
  },
};

async function handleOne(event: R2EventNotification, env: Env): Promise<void> {
  const objectKey = event.object.key;
  const match = objectKey.match(/^originals\/([^/]+)\/([^./]+)\.[^.]+$/);
  if (!match) return; // not a Memories original — should never happen given the notification's prefix filter
  const [, eventId, mediaId] = match;

  const original = await env.MEMORIES_BUCKET.get(objectKey);
  if (!original) return; // object already gone — nothing to do

  const bytes = new Uint8Array(await original.arrayBuffer());
  const { displayBytes, thumbnailBytes } = await process(bytes);

  // Key construction here MUST stay identical to `deriveObjectKeys` in
  // src/lib/invitations/memories/processing-provider.ts — the Worker can't import
  // that file directly (separate project/runtime target), and processing-complete
  // independently re-derives the same keys rather than trusting whatever this
  // payload claims, so a drift between the two would surface as a real bug, not
  // a silent mismatch. If you change one, change the other.
  const displayKey = `display/${eventId}/${mediaId}.webp`;
  const thumbnailKey = `thumbnails/${eventId}/${mediaId}.webp`;
  await env.MEMORIES_BUCKET.put(displayKey, displayBytes);
  await env.MEMORIES_BUCKET.put(thumbnailKey, thumbnailBytes);

  await fetch(`${env.MEMORIES_APP_BASE_URL}/api/memories/processing-complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-memories-internal-secret": env.MEMORIES_INTERNAL_SECRET },
    body: JSON.stringify({ mediaId, eventId }),
  });

  // Fire-and-forget moderation trigger — deliberately NOT awaited on the critical
  // path and deliberately NOT calling Rekognition from inside the Worker itself
  // (spec 1's constraint: never call an AI/vision API synchronously in this path).
  void fetch(`${env.MEMORIES_APP_BASE_URL}/api/memories/moderate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-memories-internal-secret": env.MEMORIES_INTERNAL_SECRET },
    body: JSON.stringify({ mediaId }),
  }).catch((err) => console.error("memories-processing: failed to trigger moderation", mediaId, err));
}
```

This introduces `POST /api/memories/processing-complete` (writes `processing_status`, `object_key_display`, `object_key_thumbnail` to Supabase) as a small companion route — add it now since the Worker calls it:

```ts
// src/app/api/memories/processing-complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveObjectKeys } from "@/lib/invitations/memories/processing-provider";

export async function POST(request: NextRequest) {
  if (request.headers.get("x-memories-internal-secret") !== process.env.MEMORIES_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { mediaId: string; eventId: string };

  // Object keys are fully deterministic from (eventId, mediaId) — derive them
  // server-side rather than trusting the Worker's payload for something that
  // doesn't need to travel over the wire at all.
  const { display, thumbnail } = deriveObjectKeys(body.eventId, body.mediaId);

  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({ processing_status: "ready", object_key_display: display, object_key_thumbnail: thumbnail })
    .eq("id", body.mediaId)
    .neq("processing_status", "ready"); // idempotent against redelivery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: jobError } = await client
    .from("memory_processing_jobs")
    .update({ status: "succeeded", finished_at: new Date().toISOString() })
    .eq("media_id", body.mediaId)
    .eq("job_type", "derivative")
    .eq("status", "pending"); // idempotent: a redelivered completion can't flip an already-terminal job
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Type-check the Next.js side**

Run: `npx tsc --noEmit`
Expected: no new errors (the `workers/` directory is a separate TypeScript project targeting the Workers runtime and is not part of this check — add a note to its own `tsconfig.json` if one doesn't already make that separation explicit)

- [ ] **Step 8: Add remaining env vars to `.env.example`**

```
# InviteSpot Memories — Cloudflare Queues + internal service auth
CLOUDFLARE_QUEUES_API_TOKEN=
MEMORIES_INTERNAL_SECRET=
```

- [ ] **Step 9: Provision the R2 event notification rule (one-time, per spec 1 — the pipeline never triggers without this)**

```bash
wrangler r2 bucket notification create invitespot-memories \
  --event-type object-create \
  --prefix "originals/" \
  --queue memories-processing
```

This prefix now correctly matches every event's originals with a single rule, since `originals/` is the first path segment (see the Global Constraints correction above) — confirm it never matches `display/`, `thumbnails/`, or `ai/` writes, which must not re-trigger processing. Deploy the Worker itself with `wrangler deploy` from `workers/memories-processing/`.

- [ ] **Step 10: Commit**

```bash
git add src/lib/invitations/memories/processing-provider.ts src/lib/invitations/memories/processing-provider.test.ts src/app/api/memories/processing-complete/route.ts workers/memories-processing .env.example
git commit -m "feat: add Memories processing Worker and derivative pipeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: DLQ drain cron

**Files:**
- Create: `src/app/api/cron/memories-dlq-drain/route.ts`
- Modify: `vercel.json` — register the new cron

**Interfaces:**
- Consumes: `memory_processing_jobs` (Task 1), `CLOUDFLARE_QUEUES_API_TOKEN` env var.
- Produces: dead-letter visibility in `memory_processing_jobs.status = 'dead_letter'` and `memory_media.processing_status = 'processing_failed'`, for a future host-facing "retry" control in Plan B.

- [ ] **Step 1: Implement the drain route**

```ts
// src/app/api/cron/memories-dlq-drain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DLQ_PULL_URL_TEMPLATE =
  "https://api.cloudflare.com/client/v4/accounts/{accountId}/queues/{queueId}/messages/pull";

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accountId = requireEnv("R2_ACCOUNT_ID");
  const queueId = requireEnv("MEMORIES_DLQ_ID");
  const url = DLQ_PULL_URL_TEMPLATE.replace("{accountId}", accountId).replace("{queueId}", queueId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireEnv("CLOUDFLARE_QUEUES_API_TOKEN")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ visibility_timeout_ms: 30_000, batch_size: 25 }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: `queue pull failed: ${response.status}` }, { status: 502 });
  }

  const payload = (await response.json()) as {
    result: { messages: Array<{ body: { object: { key: string } } }> };
  };

  const client = createAdminClient();
  let drained = 0;
  for (const message of payload.result.messages) {
    const match = message.body.object.key.match(/^originals\/[^/]+\/([^./]+)\.[^.]+$/);
    if (!match) continue;
    const [, mediaId] = match;
    await client.from("memory_media").update({ processing_status: "processing_failed" }).eq("id", mediaId);
    await client
      .from("memory_processing_jobs")
      .update({ status: "dead_letter", finished_at: new Date().toISOString() })
      .eq("media_id", mediaId)
      .eq("job_type", "derivative");
    drained += 1;
  }

  return NextResponse.json({ drained });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
```

- [ ] **Step 2: Register the cron in `vercel.json`**

Add an entry to the existing `crons` array (matching the existing `send-reminders` entry's shape) with a 30-minute schedule:

```json
{ "path": "/api/cron/memories-dlq-drain", "schedule": "*/30 * * * *" }
```

- [ ] **Step 3: Add `MEMORIES_DLQ_ID` to `.env.example`**

```
MEMORIES_DLQ_ID=
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/memories-dlq-drain/route.ts vercel.json .env.example
git commit -m "feat: drain the Memories processing dead-letter queue on a cron

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: AIProvider (Rekognition moderation) + moderation route

**Files:**
- Create: `src/lib/invitations/memories/ai-provider.ts`
- Test: `src/lib/invitations/memories/ai-provider.test.ts`
- Create: `src/app/api/memories/moderate/route.ts`
- Modify: `package.json` — add `@aws-sdk/client-rekognition`
- Modify: `src/lib/invitations/memories/repository.ts` — add `updateMemoryMediaModeration`

**Interfaces:**
- Consumes: `getMemoryMediaById`/`getEventMemoriesSettings` (Task 4), `deriveObjectKeys` (Task 5), R2 download (`StorageProvider`, Task 3).
- Produces: `AIProvider` interface + `RekognitionAIProvider`, `resolveModerationOutcome(mode, rekognitionResult)` — the pure threshold-policy function this task's tests focus on.

- [ ] **Step 1: Install the dependency**

```bash
npm install @aws-sdk/client-rekognition
```

- [ ] **Step 2: Write the failing test for the pure threshold-policy function**

```ts
// src/lib/invitations/memories/ai-provider.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveModerationOutcome } from "./ai-provider";

test("high-confidence unsafe content is rejected in either mode", () => {
  const result = resolveModerationOutcome("auto_publish", { highestConfidence: 0.95, categories: ["Explicit Nudity"] });
  assert.equal(result.moderationStatus, "rejected");
});

test("borderline confidence is flagged for host review in either mode", () => {
  const result = resolveModerationOutcome("review_required", { highestConfidence: 0.6, categories: ["Suggestive"] });
  assert.equal(result.moderationStatus, "flagged");
});

test("clean content auto-approves in auto_publish mode", () => {
  const result = resolveModerationOutcome("auto_publish", { highestConfidence: 0, categories: [] });
  assert.equal(result.moderationStatus, "approved");
});

test("clean content waits for the host in review_required mode, distinct from unchecked pending", () => {
  const result = resolveModerationOutcome("review_required", { highestConfidence: 0, categories: [] });
  assert.equal(result.moderationStatus, "awaiting_host_review");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/ai-provider.test.ts`
Expected: FAIL with "Cannot find module './ai-provider'"

- [ ] **Step 4: Implement `ai-provider.ts`**

```ts
// src/lib/invitations/memories/ai-provider.ts
import type { ModerationStatus } from "./types";

export interface ModerationResult {
  highestConfidence: number; // 0-1
  categories: string[];
}

export interface ModerationOutcome {
  moderationStatus: ModerationStatus;
  moderationScore: number;
  moderationCategories: string[];
}

const REJECT_THRESHOLD = 0.85;
const FLAG_THRESHOLD = 0.4;

export function resolveModerationOutcome(
  mode: "auto_publish" | "review_required",
  result: ModerationResult,
): ModerationOutcome {
  const base = { moderationScore: result.highestConfidence, moderationCategories: result.categories };

  if (result.highestConfidence >= REJECT_THRESHOLD) {
    return { ...base, moderationStatus: "rejected" };
  }
  if (result.highestConfidence >= FLAG_THRESHOLD) {
    return { ...base, moderationStatus: "flagged" };
  }
  return { ...base, moderationStatus: mode === "auto_publish" ? "approved" : "awaiting_host_review" };
}

export interface AIProvider {
  moderateImage(bytes: Uint8Array): Promise<ModerationResult>;
}

export class RekognitionAIProvider implements AIProvider {
  async moderateImage(bytes: Uint8Array): Promise<ModerationResult> {
    const { RekognitionClient, DetectModerationLabelsCommand } =
      require("@aws-sdk/client-rekognition") as typeof import("@aws-sdk/client-rekognition");
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const response = await client.send(
      new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: 30 }),
    );
    const labels = response.ModerationLabels ?? [];
    const highestConfidence = labels.reduce((max, label) => Math.max(max, (label.Confidence ?? 0) / 100), 0);
    return { highestConfidence, categories: labels.map((label) => label.Name ?? "unknown") };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/memories/ai-provider.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 6: Add `updateMemoryMediaModeration` to `repository.ts`**

```ts
// append to src/lib/invitations/memories/repository.ts
export async function updateMemoryMediaModeration(
  mediaId: string,
  outcome: { moderationStatus: string; moderationScore: number; moderationCategories: string[] },
): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({
      moderation_status: outcome.moderationStatus,
      moderation_score: outcome.moderationScore,
      moderation_categories: outcome.moderationCategories,
    })
    .eq("id", mediaId)
    .eq("moderation_status", "pending"); // idempotent: a retried moderation call can't re-flag an already-decided item
}
```

- [ ] **Step 7: Implement the moderation route**

```ts
// src/app/api/memories/moderate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveModerationOutcome, RekognitionAIProvider } from "@/lib/invitations/memories/ai-provider";
import { getEventMemoriesSettings, getMemoryMediaById, updateMemoryMediaModeration } from "@/lib/invitations/memories/repository";
import { R2StorageProvider } from "@/lib/invitations/memories/storage-provider";

export async function POST(request: NextRequest) {
  if (request.headers.get("x-memories-internal-secret") !== process.env.MEMORIES_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { mediaId } = (await request.json()) as { mediaId: string };

  const media = await getMemoryMediaById(mediaId);
  if (!media || !media.objectKeyDisplay) {
    return NextResponse.json({ error: "media not ready for moderation" }, { status: 409 });
  }
  const settings = await getEventMemoriesSettings(media.eventId);
  if (!settings) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const storage = new R2StorageProvider();
  const downloadUrl = await storage.getSignedDownloadUrl(media.objectKeyDisplay, 60);
  const imageResponse = await fetch(downloadUrl);
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());

  const provider = new RekognitionAIProvider();
  const result = await provider.moderateImage(bytes);
  const outcome = resolveModerationOutcome(settings.memoriesMode, result);

  await updateMemoryMediaModeration(mediaId, outcome);
  return NextResponse.json({ ok: true, moderationStatus: outcome.moderationStatus });
}
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 9: Add AWS env vars to `.env.example`**

```
# InviteSpot Memories — AWS Rekognition moderation
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/invitations/memories/ai-provider.ts src/lib/invitations/memories/ai-provider.test.ts src/lib/invitations/memories/repository.ts src/app/api/memories/moderate/route.ts .env.example package.json package-lock.json
git commit -m "feat: moderate Memories uploads with AWS Rekognition

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: gallery_visible computation + visible-media query for Plan B

**Files:**
- Create: `src/lib/invitations/memories/gallery.ts`
- Test: `src/lib/invitations/memories/gallery.test.ts`

**Interfaces:**
- Consumes: `MemoryMedia` type (Task 2).
- Produces: `computeGalleryVisible(media)`, `listGalleryVisibleMedia(eventId)` — the two functions Plan B's gallery UI imports directly; this is Plan A's final, integration-facing deliverable.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/invitations/memories/gallery.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeGalleryVisible } from "./gallery";
import type { MemoryMedia } from "./types";

function baseMedia(overrides: Partial<MemoryMedia>): MemoryMedia {
  return {
    id: "media-1",
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderDisplayName: null,
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: "originals/event-1/media-1.jpg",
    objectKeyDisplay: "display/event-1/media-1.webp",
    objectKeyThumbnail: "thumbnails/event-1/media-1.webp",
    capturedAt: null,
    uploadedAt: "2026-09-21T00:00:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "approved",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  };
}

test("uploaded, processed, and approved media is gallery-visible", () => {
  assert.equal(computeGalleryVisible(baseMedia({})), true);
});

test("media awaiting host review is never gallery-visible", () => {
  assert.equal(computeGalleryVisible(baseMedia({ moderationStatus: "awaiting_host_review" })), false);
});

test("flagged media is never gallery-visible, even if processing finished", () => {
  assert.equal(computeGalleryVisible(baseMedia({ moderationStatus: "flagged" })), false);
});

test("media still processing is never gallery-visible regardless of moderation outcome", () => {
  assert.equal(computeGalleryVisible(baseMedia({ processingStatus: "processing", moderationStatus: "approved" })), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/invitations/memories/gallery.test.ts`
Expected: FAIL with "Cannot find module './gallery'"

- [ ] **Step 3: Implement `gallery.ts`**

```ts
// src/lib/invitations/memories/gallery.ts
import { createAdminClient } from "@/lib/supabase/admin";
import type { MemoryMedia } from "./types";

export function computeGalleryVisible(media: MemoryMedia): boolean {
  return (
    media.uploadStatus === "uploaded" &&
    media.processingStatus === "ready" &&
    media.moderationStatus === "approved"
  );
}

export async function listGalleryVisibleMedia(eventId: string): Promise<MemoryMedia[]> {
  const client = createAdminClient();
  const { data, error } = await client
    .from("memory_media")
    .select("*")
    .eq("event_id", eventId)
    .eq("upload_status", "uploaded")
    .eq("processing_status", "ready")
    .eq("moderation_status", "approved")
    .order("captured_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    uploaderRsvpId: row.uploader_rsvp_id,
    uploaderDisplayName: row.uploader_display_name,
    guestSessionLevel: row.guest_session_level,
    mediaKind: row.media_kind,
    objectKeyOriginal: row.object_key_original,
    objectKeyDisplay: row.object_key_display,
    objectKeyThumbnail: row.object_key_thumbnail,
    capturedAt: row.captured_at,
    uploadedAt: row.uploaded_at,
    uploadStatus: row.upload_status,
    processingStatus: row.processing_status,
    moderationStatus: row.moderation_status,
    aiStatus: row.ai_status,
    moderationScore: row.moderation_score,
    moderationCategories: row.moderation_categories,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/invitations/memories/gallery.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Run the full test suite, typecheck, and build**

```bash
npx tsx --test $(find src -name "*.test.ts" -o -name "*.test.tsx" | sort)
npx tsc --noEmit
npm run build
```
Expected: all green — this is the last task in Plan A, so this is the checkpoint proving the whole backend foundation compiles and builds together, not just task-by-task in isolation.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/gallery.ts src/lib/invitations/memories/gallery.test.ts
git commit -m "feat: compute Memories gallery visibility and list visible media

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## What Plan B builds on top of this

- `signMemoriesGuestSession` / `verifyMemoriesGuestSession` (Task 2) — the guest landing page mints a cookie with this.
- `POST /api/memories/events/{eventId}/upload/init` + `.../upload/complete` (Task 4) — the resilient upload queue's two calls per file.
- `listGalleryVisibleMedia` / `computeGalleryVisible` (Task 8) — both gallery views' data source.
- `memory_moments` / `memory_moment_media` (Task 1) — Moments/Discovery reads these directly; no new backend work needed for the V1 time-window computation itself (a small pure function: first `memory_moments` row whose `[starts_at, ends_at)` contains `captured_at`, else check `memory_moment_media` for a host override — worth its own tiny task in Plan B rather than assuming it, since Plan A didn't build it).
- `memory_processing_jobs` (Task 1) + the DLQ drain (Task 6) — the host dashboard's "processing failed, retry" affordance reads/writes these.
- The still-open items for Plan B to own explicitly: the review-queue UI, the dashboard card, host bulk-download (the named gap from spec 1), and lifecycle/upload-window enforcement.
