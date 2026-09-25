# InviteSpot Memories — Video Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests upload short video clips alongside photos in the existing Memories feature, moderated (poster-frame only) and displayed through the same pipeline photos already use wherever it's reusable.

**Architecture:** Video reuses the existing `memory_media` schema unchanged (no new column/table) — `object_key_display`/`object_key_thumbnail` are populated synchronously at upload-complete time instead of by the photon-rs processing Worker, which video skips entirely (no transcoding). A client-captured poster JPEG stands in for video everywhere a photo derivative would normally be used: as the thumbnail, as the moderation input, and as the AI Highlight descriptor source.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + RLS), Cloudflare R2 (via `@aws-sdk/client-s3`), AWS Rekognition (`DetectModerationLabels`/`DetectLabels`, synchronous image APIs only — no new AWS service), `tsx --test`, `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-09-24-invitespot-memories-video-support-design.md`

## Global Constraints

- Limits: 60 seconds, 50MB per clip (client-checked duration, server-checked size).
- Accepted formats: `video/mp4`, `video/webm`, `video/quicktime` only.
- Moderation inspects the poster frame only, never the full clip — this is a disclosed, accepted limitation, not a bug to "fix" mid-plan. Never write code or a comment implying full-clip moderation exists.
- No new AWS service, no new Supabase table/column, no server-side transcoding or derivative generation for video. If a task seems to need one of these, stop and reconsider the approach against the spec rather than adding it.
- No autoplay of video inside any grid (Gallery, Moments, AI Highlights) — tap to open the lightbox, then the guest uses the video's own native controls.
- Video does not participate in "Find Me" — that is a separate, later plan.
- Every task touching a `route.ts` file must pass a real `npm run build`, not just `tsc --noEmit`, before being considered done — this exact class of bug (a `route.ts` file exporting something other than an HTTP handler) has broken production builds twice already in this codebase's history. If a task needs to export a non-handler helper for testing, put it in a sibling file and have `route.ts` import it.
- Any test file under a bracketed path segment (e.g. `[eventId]`) must be run either by `cd`-ing into its own directory and using its bare filename, or via a single-quoted recursive glob (`'src/**/*.test.ts'`) — a literal bracketed path silently matches zero files under `tsx --test` and reports success.

---

### Task 1: Poster object key derivation and R2 object-existence check

**Files:**
- Modify: `src/lib/invitations/memories/upload-tickets.ts`
- Modify: `src/lib/invitations/memories/storage-provider.ts`
- Test: `src/lib/invitations/memories/upload-tickets.test.ts`
- Test: `src/lib/invitations/memories/storage-provider.test.ts` (create if it doesn't exist — check first)

**Interfaces:**
- Produces: `objectKeyForVideoPoster(eventId: string, mediaId: string): string` from `upload-tickets.ts`, used by Task 2 (upload/init) and Task 3 (upload/complete).
- Produces: `StorageProvider.objectExists(objectKey: string): Promise<boolean>`, implemented on `R2StorageProvider`, used by Task 3.

- [ ] **Step 1: Check for an existing storage-provider test file**

Run: `ls src/lib/invitations/memories/storage-provider.test.ts`

If it exists, read it fully and follow its existing mocking pattern for `S3Client`/`getSignedUrl` (likely mocking the AWS SDK client's `send` method) for the new test below. If it doesn't exist, create it following the pattern in `upload-tickets.test.ts` for a file with no DB but real external-SDK dependencies — check how other tests in this codebase mock `@aws-sdk/client-s3`'s `S3Client.send` (search `grep -rln "S3Client" src --include="*.test.ts"` for a precedent) before inventing a new mocking approach.

- [ ] **Step 2: Write the failing test for `objectKeyForVideoPoster`**

Add to `src/lib/invitations/memories/upload-tickets.test.ts`:

```ts
import { objectKeyForVideoPoster } from "./upload-tickets";

test("objectKeyForVideoPoster derives a deterministic .jpg key from event and media ids", () => {
  const key = objectKeyForVideoPoster("event-1", "media-1");
  assert.equal(key, "originals/event-1/media-1-poster.jpg");
});

test("objectKeyForVideoPoster is stable across repeated calls with the same ids", () => {
  assert.equal(objectKeyForVideoPoster("event-2", "media-2"), objectKeyForVideoPoster("event-2", "media-2"));
});
```

(Match the existing import style at the top of that file — it already imports `test`/`assert` and `objectKeyForOriginal`; add `objectKeyForVideoPoster` to that same import line rather than a new one.)

- [ ] **Step 2b: Run it to verify it fails**

Run: `cd src/lib/invitations/memories && npx tsx --test upload-tickets.test.ts`
Expected: FAIL — `objectKeyForVideoPoster` is not exported.

- [ ] **Step 3: Implement `objectKeyForVideoPoster`**

In `src/lib/invitations/memories/upload-tickets.ts`, add directly below `objectKeyForOriginal`:

```ts
// A video's poster is a plain JPEG derived from the same ids, independent of
// the video's own container/codec — always ".jpg" regardless of whether the
// clip itself is .mp4/.webm/.mov.
export function objectKeyForVideoPoster(eventId: string, mediaId: string): string {
  return `originals/${eventId}/${mediaId}-poster.jpg`;
}
```

- [ ] **Step 4: Run the upload-tickets tests to verify they pass**

Run: `cd src/lib/invitations/memories && npx tsx --test upload-tickets.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the failing test for `objectExists`**

In `storage-provider.test.ts`, following whatever S3-mocking pattern Step 1 found (or established), add:

```ts
test("objectExists returns true when HeadObjectCommand succeeds", async () => {
  // Mock the underlying S3Client.send to resolve for HeadObjectCommand.
  // ... (follow the file's established mocking pattern from Step 1)
  const exists = await provider.objectExists("originals/event-1/media-1-poster.jpg");
  assert.equal(exists, true);
});

test("objectExists returns false when the object is missing (404)", async () => {
  // Mock S3Client.send to reject with an error whose $metadata.httpStatusCode is 404.
  const exists = await provider.objectExists("originals/event-1/media-1-poster.jpg");
  assert.equal(exists, false);
});

test("objectExists rethrows a non-404 error", async () => {
  // Mock S3Client.send to reject with an error whose $metadata.httpStatusCode is 500.
  await assert.rejects(() => provider.objectExists("originals/event-1/media-1-poster.jpg"));
});
```

- [ ] **Step 5b: Run it to verify it fails**

Run: `cd src/lib/invitations/memories && npx tsx --test storage-provider.test.ts`
Expected: FAIL — `objectExists` is not a function.

- [ ] **Step 6: Implement `objectExists`**

In `src/lib/invitations/memories/storage-provider.ts`:

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

export interface StorageProvider {
  createPresignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number, contentLength?: number): Promise<string>;
  getSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
  objectExists(objectKey: string): Promise<boolean>;
}
```

And on `R2StorageProvider`, alongside the other methods:

```ts
  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }
```

- [ ] **Step 7: Run the storage-provider tests to verify they pass**

Run: `cd src/lib/invitations/memories && npx tsx --test storage-provider.test.ts`
Expected: all PASS.

- [ ] **Step 8: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/invitations/memories/upload-tickets.ts src/lib/invitations/memories/upload-tickets.test.ts src/lib/invitations/memories/storage-provider.ts src/lib/invitations/memories/storage-provider.test.ts
git commit -m "feat(memories-video): add poster key derivation and R2 object-existence check"
```

---

### Task 2: Widen upload/init to accept video and issue a poster upload URL

**Files:**
- Modify: `src/app/api/memories/events/[eventId]/upload/init/route.ts`
- Test: `src/app/api/memories/events/[eventId]/upload/init/init-route.test.ts` (check the exact existing filename with `ls src/app/api/memories/events/[eventId]/upload/init/` — a test file for this route already exists from Plan A; follow its exact structure/mocking pattern, don't invent a new one)

**Interfaces:**
- Consumes: `objectKeyForVideoPoster` from Task 1.
- Produces: `upload/init`'s response gains an optional `posterUploadUrl: string` field, present only when `mediaKind === "video"`. Task 5 (`GuestUploadView.tsx`) consumes this field by name.

- [ ] **Step 1: Read the current route and its existing test file in full**

```bash
cat "src/app/api/memories/events/[eventId]/upload/init/route.ts"
ls "src/app/api/memories/events/[eventId]/upload/init/"
```

Read whatever test file is found there in full before writing new tests — match its exact mocking approach (how it fakes `createAdminClient`/`R2StorageProvider`/the E2E-fixture guard) rather than guessing.

- [ ] **Step 2: Write the failing tests**

Add to the existing test file (exact assertions below; adapt only the mocking boilerplate to match what Step 1 found):

```ts
test("POST accepts mediaKind video with an accepted content type", async () => {
  const request = /* build a same-origin POST request, mediaKind: "video", contentType: "video/mp4", sizeBytes: 1_000_000 */;
  const response = await POST(request, { params: { eventId: "event-1" } });
  assert.notEqual(response.status, 400);
});

test("POST rejects an unsupported video content type with 400", async () => {
  const request = /* mediaKind: "video", contentType: "video/x-msvideo" (AVI, not accepted) */;
  const response = await POST(request, { params: { eventId: "event-1" } });
  assert.equal(response.status, 400);
});

test("POST response includes posterUploadUrl for a video, and omits it for a photo", async () => {
  const videoResponse = await POST(/* mediaKind: "video", contentType: "video/mp4" */, { params: { eventId: "event-1" } });
  const videoBody = await videoResponse.json() as { posterUploadUrl?: string };
  assert.ok(videoBody.posterUploadUrl, "expected a posterUploadUrl for a video upload");

  const photoResponse = await POST(/* mediaKind: "photo", contentType: "image/jpeg" */, { params: { eventId: "event-1" } });
  const photoBody = await photoResponse.json() as { posterUploadUrl?: string };
  assert.equal(photoBody.posterUploadUrl, undefined, "a photo upload must not get a posterUploadUrl");
});

for (const contentType of ["video/mp4", "video/webm", "video/quicktime"]) {
  test(`POST accepts video content type ${contentType}`, async () => {
    const response = await POST(/* mediaKind: "video", contentType */, { params: { eventId: "event-1" } });
    assert.notEqual(response.status, 400);
  });
}
```

- [ ] **Step 2b: Run to verify these fail**

Run the test file the way Step 1's `ls` result indicates (its own directory + bare filename, since it's under a bracketed path). Expected: FAIL — video is currently hard-rejected with 400.

- [ ] **Step 3: Widen the route**

In `route.ts`, replace:

```ts
// Photo only for now. Nothing in the current pipeline can move a video off
// moderation_status='pending' — video moderation was designed around a
// client-captured poster frame that does not exist in this codebase — so
// accepting video uploads would mean shipping unmoderated media. A later plan
// lifts this restriction once real video moderation exists.
const ALLOWED_KINDS: MediaKind[] = ["photo"];
// Must stay in sync with SUPPORTED_IMAGE_EXTENSIONS in
// workers/memories-processing/src/index.ts (jpg, jpeg, png, webp, gif) — anything
// the Worker's photon build can't decode is rejected here, at upload time, rather
// than failing 5x and surfacing in the DLQ up to 30 minutes later. HEIC (the
// iPhone default) is deliberately unsupported for now.
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
```

with:

```ts
// Video: 60s/50MB cap (client-checked duration, this constant covers size),
// moderated via a client-captured poster frame — see
// docs/superpowers/specs/2026-09-24-invitespot-memories-video-support-design.md.
// Video never enters the photon-rs processing Worker pipeline (no transcoding),
// so it isn't subject to that pipeline's own format support.
const ALLOWED_KINDS: MediaKind[] = ["photo", "video"];
// Must stay in sync with SUPPORTED_IMAGE_EXTENSIONS in
// workers/memories-processing/src/index.ts (jpg, jpeg, png, webp, gif) for the
// photo half — anything the Worker's photon build can't decode is rejected here,
// at upload time, rather than failing 5x and surfacing in the DLQ up to 30
// minutes later. HEIC (the iPhone default) is deliberately unsupported for now.
// Video types skip the Worker entirely, so they aren't constrained by it.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
]);
```

Remove this block entirely (now redundant — the generic `ALLOWED_KINDS.includes` check below already covers it correctly once `"video"` is in the array):

```ts
    if (parsedBody.mediaKind === "video") {
      return NextResponse.json({ error: "video uploads are not yet supported" }, { status: 400 });
    }
```

Add the import at the top:

```ts
import { objectKeyForVideoPoster } from "@/lib/invitations/memories/upload-tickets";
```

(`createMemoriesUploadTicket` is presumably already imported there — check the existing import line and add `objectKeyForVideoPoster` to it rather than a new line, matching the existing single-import-line-per-module style in this file.)

Find where the route builds its final response (`return NextResponse.json({ mediaId, ticket, uploadUrl });`, both the fixture-mode branch and the real-R2 branch) and change it to:

```ts
    const posterUploadUrl =
      mediaKind === "video"
        ? await storage.createPresignedUploadUrl(objectKeyForVideoPoster(eventId, mediaId), "image/jpeg", 15 * 60)
        : undefined;

    if (isInvitationE2EFixturesEnabled()) {
      await markMemoryMediaUploaded(mediaId);
      await simulateFixtureMediaReady(mediaId);
      return NextResponse.json({ mediaId, ticket, uploadUrl: `https://fixture.local/${objectKey}`, ...(posterUploadUrl ? { posterUploadUrl } : {}) });
    }

    return NextResponse.json({ mediaId, ticket, uploadUrl, ...(posterUploadUrl ? { posterUploadUrl } : {}) });
```

(Read the actual current route body carefully before editing — the exact variable names around `storage`/`uploadUrl`/the fixture branch must match what's really there; the snippet above is the target shape, not a literal diff, since the surrounding code was written across earlier tasks in this session and small variable-naming details may differ from what's shown.)

- [ ] **Step 4: Run the tests to verify they pass**

Run the test file from its own directory. Expected: all PASS.

- [ ] **Step 5: Full typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean. The build check matters specifically here — this file is a `route.ts`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/memories/events/[eventId]/upload/init/route.ts" "src/app/api/memories/events/[eventId]/upload/init/"*.test.ts
git commit -m "feat(memories-video): accept video uploads at upload/init, issue a poster upload URL"
```

---

### Task 3: Video-aware upload/complete (poster existence check + synchronous ready state)

**Files:**
- Modify: `src/lib/invitations/memories/repository.ts`
- Modify: `src/app/api/memories/events/[eventId]/upload/complete/route.ts`
- Test: `src/lib/invitations/memories/repository.test.ts`
- Test: `src/app/api/memories/events/[eventId]/upload/complete/complete-route.test.ts` (check the exact existing filename first, same as Task 2)

**Interfaces:**
- Consumes: `objectExists` from Task 1 (via `StorageProvider`), `objectKeyForVideoPoster` from Task 1.
- Produces: `markVideoMemoryMediaReady(mediaId: string, objectKeyOriginal: string, posterObjectKey: string): Promise<void>` in `repository.ts`, called only from this route.

- [ ] **Step 1: Write the failing repository test**

Add to `repository.test.ts`, following the file's own established structural-regex convention (no DB injection seam) exactly as its existing tests for `markMemoryMediaUploaded`-style functions do:

```ts
test("markVideoMemoryMediaReady sets display/thumbnail keys and processing_status without creating a processing job", () => {
  assert.equal(typeof markVideoMemoryMediaReady, "function");
  const source = markVideoMemoryMediaReady.toString();
  assert.match(source, /memory_media/);
  assert.match(source, /object_key_display/);
  assert.match(source, /object_key_thumbnail/);
  assert.match(source, /processing_status/);
  assert.match(source, /'ready'|"ready"/);
  // Video never enters the photon-rs derivative pipeline — this function must
  // not queue a memory_processing_jobs row the way markMemoryMediaUploaded does.
  assert.doesNotMatch(source, /memory_processing_jobs/);
  // Idempotency guard matching markMemoryMediaUploaded's own convention.
  assert.match(source, /upload_status.*pending|pending.*upload_status/s);
});
```

Add `markVideoMemoryMediaReady` to the file's existing import block from `./repository`.

- [ ] **Step 1b: Run to verify it fails**

Run: `cd src/lib/invitations/memories && npx tsx --test repository.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 2: Implement `markVideoMemoryMediaReady`**

In `repository.ts`, directly below `markMemoryMediaUploaded`:

```ts
// Video's counterpart to markMemoryMediaUploaded — but video never enters the
// photon-rs processing Worker pipeline (no transcoding, see the video-support
// design spec), so this sets the derivative columns directly instead of
// queuing a memory_processing_jobs row. object_key_display is set to the
// video's own original (playing the actual clip *is* "display" for video);
// object_key_thumbnail is set to the client-captured poster.
export async function markVideoMemoryMediaReady(mediaId: string, objectKeyOriginal: string, posterObjectKey: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client
    .from("memory_media")
    .update({
      upload_status: "uploaded",
      object_key_display: objectKeyOriginal,
      object_key_thumbnail: posterObjectKey,
      processing_status: "ready",
    })
    .eq("id", mediaId)
    .eq("upload_status", "pending"); // idempotent, matching markMemoryMediaUploaded
  if (error) throw new Error(`failed to mark video memory_media ready: ${error.message}`);
}
```

- [ ] **Step 3: Run the repository test to verify it passes**

Run: `cd src/lib/invitations/memories && npx tsx --test repository.test.ts`
Expected: PASS.

- [ ] **Step 4: Read the current upload/complete route and its existing test file in full**

```bash
cat "src/app/api/memories/events/[eventId]/upload/complete/route.ts"
ls "src/app/api/memories/events/[eventId]/upload/complete/"
```

- [ ] **Step 5: Write the failing route tests**

Following the existing test file's exact mocking pattern:

```ts
test("POST completes a video upload: checks the poster exists, then marks it ready via markVideoMemoryMediaReady", async () => {
  // Mock getMemoryMediaById to return a video-kind row with a known objectKeyOriginal.
  // Mock R2StorageProvider.objectExists (poster key) to resolve true.
  // Mock markVideoMemoryMediaReady and assert it's called with (mediaId, objectKeyOriginal, posterKey).
  const request = /* same-origin POST, {mediaId, ticket} for a video mediaId, valid ticket */;
  const response = await POST(request, { params: { eventId: "event-1" } });
  assert.equal(response.status, 200);
});

test("POST fails a video completion when the poster object is missing, without flipping status", async () => {
  // Mock getMemoryMediaById to return a video-kind row.
  // Mock objectExists to resolve false.
  const request = /* same-origin POST, {mediaId, ticket} */;
  const response = await POST(request, { params: { eventId: "event-1" } });
  assert.notEqual(response.status, 200);
  // markVideoMemoryMediaReady / markMemoryMediaUploaded must not have been called.
});

test("POST still completes a photo upload via markMemoryMediaUploaded, unchanged", async () => {
  // Mock getMemoryMediaById to return a photo-kind row.
  const request = /* same-origin POST, {mediaId, ticket} for a photo mediaId */;
  const response = await POST(request, { params: { eventId: "event-1" } });
  assert.equal(response.status, 200);
  // markMemoryMediaUploaded (not markVideoMemoryMediaReady) must have been called.
});
```

- [ ] **Step 5b: Run to verify these fail**

Run from the route's own directory. Expected: FAIL — the route doesn't yet fetch the media row or branch on kind.

- [ ] **Step 6: Implement the video branch**

In `route.ts`, the current body is:

```ts
    await markMemoryMediaUploaded(parsedBody.mediaId);
    return NextResponse.json({ ok: true });
```

Replace with (read the actual current imports/variable names first — this is the target shape):

```ts
    const media = await getMemoryMediaById(parsedBody.mediaId);
    if (!media) {
      return NextResponse.json({ error: "media not found" }, { status: 404 });
    }

    if (media.mediaKind === "video") {
      const posterKey = objectKeyForVideoPoster(eventId, parsedBody.mediaId);
      const storage = new R2StorageProvider();
      const posterExists = await storage.objectExists(posterKey);
      if (!posterExists) {
        return NextResponse.json({ error: "poster upload not found" }, { status: 409 });
      }
      await markVideoMemoryMediaReady(parsedBody.mediaId, media.objectKeyOriginal, posterKey);
    } else {
      await markMemoryMediaUploaded(parsedBody.mediaId);
    }

    return NextResponse.json({ ok: true });
```

Add the needed imports: `getMemoryMediaById`, `markVideoMemoryMediaReady` from `@/lib/invitations/memories/repository` (add to the existing import line, which already imports `markMemoryMediaUploaded`); `objectKeyForVideoPoster` from `@/lib/invitations/memories/upload-tickets`; `R2StorageProvider` from `@/lib/invitations/memories/storage-provider`.

Do **not** add an `isInvitationE2EFixturesEnabled()` branch here — `upload/init`'s fixture branch (Task 2) already calls `simulateFixtureMediaReady` directly and never reaches a real `/complete` call in E2E fixture mode; check this assumption against the actual E2E test setup if anything here feels inconsistent with it, rather than assuming.

- [ ] **Step 7: Run the tests to verify they pass**

Run from the route's own directory. Expected: all PASS.

- [ ] **Step 8: Full typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/invitations/memories/repository.ts src/lib/invitations/memories/repository.test.ts "src/app/api/memories/events/[eventId]/upload/complete/"
git commit -m "feat(memories-video): complete video uploads via a poster existence check, bypass the processing Worker"
```

---

### Task 4: Guest upload queue — two-file (video + poster) support

**Files:**
- Modify: `src/lib/invitations/memories/upload-queue.ts`
- Modify: `src/lib/invitations/memories/upload-queue.test.ts`

**Interfaces:**
- Produces: `UploadOneFn = (file: File, posterFile: File | undefined, onProgress: (percent: number) => void) => Promise<{ mediaId: string }>` (was `(file, onProgress)` — every caller updates). `UploadQueue.enqueue(file: File, posterFile?: File): Promise<string>` (was `enqueue(file)`). Task 5 (`GuestUploadView.tsx`) is the only real caller and is updated in that task.
- `QueueItem` gains no new field — a queue item still represents one guest-visible row regardless of whether it carries one or two underlying files.

- [ ] **Step 1: Write the failing tests**

Add to `upload-queue.test.ts` (the file already imports `test`, `assert`, `createUploadQueue`, and has a `fakeFile` helper — reuse it):

```ts
test("enqueue accepts an optional posterFile and passes both files to uploadOne together", async () => {
  let receivedFile: File | undefined;
  let receivedPoster: File | undefined;
  const queue = createUploadQueue("event-video-1", async (file, posterFile, onProgress) => {
    receivedFile = file;
    receivedPoster = posterFile;
    onProgress(100);
    return { mediaId: "media-video-1" };
  });
  const poster = fakeFile("poster.jpg", 500, "image/jpeg");
  const id = await queue.enqueue(fakeFile("clip.mp4", 5000, "video/mp4"), poster);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.equal(item!.status, "done");
  assert.equal(receivedFile!.name, "clip.mp4");
  assert.equal(receivedPoster!.name, "poster.jpg");
});

test("a photo enqueue (no posterFile) still passes undefined for posterFile, not a missing argument crash", async () => {
  let receivedPoster: File | undefined | "not called" = "not called";
  const queue = createUploadQueue("event-video-2", async (_file, posterFile, onProgress) => {
    receivedPoster = posterFile;
    onProgress(100);
    return { mediaId: "media-photo-1" };
  });
  await queue.enqueue(fakeFile("a.jpg", 1000));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(receivedPoster, undefined);
});

test("a failed video upload retries both the clip and its poster together", async () => {
  let attempts = 0;
  let lastPosterName: string | undefined;
  const queue = createUploadQueue("event-video-3", async (_file, posterFile, _onProgress) => {
    attempts += 1;
    lastPosterName = posterFile?.name;
    if (attempts === 1) throw new Error("network error");
    return { mediaId: "media-video-3" };
  });
  const id = await queue.enqueue(fakeFile("clip.mp4", 5000, "video/mp4"), fakeFile("poster.jpg", 500, "image/jpeg"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  queue.retry(id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const item = queue.getItems().find((i) => i.id === id);
  assert.equal(item!.status, "done");
  assert.equal(attempts, 2);
  assert.equal(lastPosterName, "poster.jpg");
});

test("a video upload's poster survives a hydration round-trip (page reload) alongside the clip", async () => {
  const eventId = "event-video-4";
  const queue1 = createUploadQueue(eventId, async () => {
    throw new Error("network error");
  });
  const id = await queue1.enqueue(fakeFile("clip.mp4", 5000, "video/mp4"), fakeFile("poster.jpg", 500, "image/jpeg"));
  await new Promise((resolve) => setTimeout(resolve, 20));

  let hydratedPosterSize: number | undefined;
  const queue2 = createUploadQueue(eventId, async (_file, posterFile) => {
    hydratedPosterSize = posterFile?.size;
    return { mediaId: "media-video-4-retry" };
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  queue2.retry(id);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(hydratedPosterSize, 500);
});
```

- [ ] **Step 1b: Run to verify these fail**

Run: `cd src/lib/invitations/memories && npx tsx --test upload-queue.test.ts`
Expected: FAIL to compile/run — `uploadOne` callbacks in these new tests take 3 args but the current `UploadOneFn` type takes 2, and `enqueue` doesn't accept a second argument.

- [ ] **Step 2: Rewrite `upload-queue.ts`**

Replace the full file with:

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

// posterFile is present only for a video item (the client-captured poster
// JPEG); undefined for a photo. Both files travel and retry together as one
// unit — see the video-support design spec's rationale for not modeling this
// as two separate queue items.
export type UploadOneFn = (file: File, posterFile: File | undefined, onProgress: (percent: number) => void) => Promise<{ mediaId: string }>;

export interface UploadQueue {
  enqueue(file: File, posterFile?: File): Promise<string>;
  retry(id: string): void;
  dismiss(id: string): void;
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

interface PersistedEntry {
  id: string;
  file: File;
  posterFile?: File;
  item: QueueItem;
  createdAt: number;
  seq: number;
}

async function persistItem(db: IDBDatabase, entry: PersistedEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readAllItems(db: IDBDatabase): Promise<PersistedEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as PersistedEntry[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteItem(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function createUploadQueue(eventId: string, uploadOne: UploadOneFn): UploadQueue {
  // Bundled into one map (not two parallel maps keyed by id) so a file and its
  // optional poster can never drift out of sync with each other.
  const filesById = new Map<string, { file: File; posterFile?: File }>();
  const items: QueueItem[] = [];
  const createdAtById = new Map<string, number>();
  const seqById = new Map<string, number>();
  const listeners = new Set<(items: QueueItem[]) => void>();
  let dbPromise: Promise<IDBDatabase> | null = null;
  let processing = false;
  let nextSeq = 0;

  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) dbPromise = openDb(eventId);
    return dbPromise;
  }

  function notify(): void {
    const snapshot = items.map((i) => ({ ...i }));
    listeners.forEach((listener) => listener(snapshot));
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
      const { file, posterFile } = filesById.get(next.id)!;
      const result = await uploadOne(file, posterFile, (percent) => {
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
    try {
      const db = await getDb();
      const entry = filesById.get(next.id)!;
      await persistItem(db, {
        id: next.id,
        file: entry.file,
        posterFile: entry.posterFile,
        item: { ...next },
        createdAt: createdAtById.get(next.id) ?? Date.now(),
        seq: seqById.get(next.id) ?? 0,
      });
    } catch {
      // Persisting the terminal state failed (storage quota exceeded, private-browsing
      // IndexedDB restrictions, etc). In-memory state and subscribers already reflect the
      // real outcome via notify() above, so the persisted row is briefly stale — an
      // acceptable tradeoff for not leaving `processing` stuck true, which would otherwise
      // permanently freeze the queue for the rest of the session.
    } finally {
      processing = false;
      void processNext();
    }
  }

  void (async function hydrate() {
    const db = await getDb();
    const entries = await readAllItems(db);
    entries.sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq);
    const restored: QueueItem[] = [];
    for (const entry of entries) {
      const item: QueueItem = { ...entry.item };
      if (item.status === "queued" || item.status === "uploading") {
        item.status = "queued";
        item.progress = 0;
        item.error = undefined;
      }
      filesById.set(entry.id, { file: entry.file, posterFile: entry.posterFile });
      createdAtById.set(entry.id, entry.createdAt);
      seqById.set(entry.id, entry.seq);
      restored.push(item);
    }
    if (restored.length > 0) {
      items.unshift(...restored);
      notify();
      void processNext();
    }
  })();

  return {
    async enqueue(file: File, posterFile?: File): Promise<string> {
      const id = crypto.randomUUID();
      const item: QueueItem = {
        id,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        status: "queued",
        progress: 0,
      };
      const createdAt = Date.now();
      const seq = nextSeq++;
      filesById.set(id, { file, posterFile });
      createdAtById.set(id, createdAt);
      seqById.set(id, seq);
      items.push(item);
      const db = await getDb();
      await persistItem(db, { id, file, posterFile, item: { ...item }, createdAt, seq });
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
    dismiss(id: string): void {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return;
      items.splice(index, 1);
      filesById.delete(id);
      createdAtById.delete(id);
      seqById.delete(id);
      notify();
      void getDb().then((db) => deleteItem(db, id)).catch(() => undefined);
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

- [ ] **Step 3: Update the pre-existing tests' `uploadOne` callbacks**

Every existing test in `upload-queue.test.ts` written before this task passes a 2-argument callback (`async (file, onProgress) => ...` or `async () => ...`). Update each one to the 3-argument shape (`async (file, posterFile, onProgress) => ...`), ignoring `posterFile` where it isn't relevant to that test (it will simply be `undefined` for every pre-existing test, since none of them pass a second argument to `enqueue`). Do not change any assertions in the pre-existing tests — only the callback signatures.

- [ ] **Step 4: Run all upload-queue tests to verify they pass**

Run: `cd src/lib/invitations/memories && npx tsx --test upload-queue.test.ts`
Expected: all PASS (both pre-existing and new).

- [ ] **Step 5: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (This will also surface `GuestUploadView.tsx`'s now-mismatched `uploadOne`/`enqueue` call sites as type errors — that's expected and is fixed in Task 5, not this one; confirm the *only* errors reported are in `GuestUploadView.tsx`, nowhere else.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitations/memories/upload-queue.ts src/lib/invitations/memories/upload-queue.test.ts
git commit -m "feat(memories-video): extend the upload queue to carry an optional poster file per item"
```

---

### Task 5: GuestUploadView — video capture, duration check, two-file enqueue

**Files:**
- Modify: `src/components/invitations/memories/GuestUploadView.tsx`
- Test: `src/components/invitations/memories/GuestUploadView.test.tsx` (check if it exists first: `ls src/components/invitations/memories/GuestUploadView.test.tsx` — if not, this task creates it)

**Interfaces:**
- Consumes: `UploadQueue.enqueue(file, posterFile?)` and the 3-argument `UploadOneFn` from Task 4; `posterUploadUrl` from Task 2's `upload/init` response.
- Produces: no new public interface — this is a leaf component.

This task has two genuinely different kinds of work: (a) the `mediaKind` branching, duration check, and two-file `uploadOne`/enqueue wiring, which is unit-testable; and (b) the actual poster-frame capture (drawing a `<video>` element to a canvas), which needs a real browser and is **not** automatable in this test environment — jsdom has no canvas/video-decoding support. Write the real implementation for both; only (a) gets an automated test here. (b) is verified manually per the spec's own Testing section.

- [ ] **Step 1: Write the failing tests for the testable half**

Read the current file in full first (already shown above in this plan's research, but re-read it live — it may have changed). Then write tests covering:

```ts
test("a picked video file is enqueued with mediaKind video and its captured poster, not treated as a photo", async () => {
  // Mock capturePosterFrame (see Step 3) to resolve a fake poster File.
  // Mock fetch for /upload/init to assert the request body has mediaKind: "video"
  // and to return a posterUploadUrl alongside uploadUrl.
  // Mock XMLHttpRequest (or however this file already tests its upload PUT — check
  // for an existing test file first; if none exists, this is new groundwork).
  // Assert queue.enqueue was called with (videoFile, posterFile).
});

test("a video longer than 60 seconds is rejected before any network call", async () => {
  // Mock the duration-reading step (see Step 3) to resolve 61.
  // Assert no fetch to /upload/init occurred, and the rejection message shown
  // matches a new translation key (see Step 4).
});

test("a picked photo file is still enqueued with mediaKind photo and no poster, unchanged", async () => {
  // Existing HEIC-rejection and photo-enqueue behavior must be untouched.
});
```

Since this component has real DOM/timer/IndexedDB dependencies, check whether `GuestUploadView.test.tsx` already exists (per the file list at the top of this task) before deciding on a fresh JSDOM harness — if it exists, follow its exact harness pattern (likely matching `GuestAiHighlightView.test.tsx`'s JSDOM + `react-dom/client` + `act` convention used throughout this codebase's memories components). If it doesn't exist, build the harness following that same established convention rather than inventing a new one, and add a `quietVirtualConsole`-style helper if this component ends up calling any DOM API jsdom stubs as "not implemented" (check for this once the component change is written, don't add it speculatively).

- [ ] **Step 1b: Run to verify they fail**

Run from this file's own directory (not under a bracketed path, so a normal `npx tsx --test GuestUploadView.test.tsx` from `src/components/invitations/memories/` is fine).
Expected: FAIL — the current component always sends `mediaKind: "photo"`.

- [ ] **Step 2: Add video constants and the duration-check pure function**

Near the top of `GuestUploadView.tsx`, alongside `UNSUPPORTED_TYPES`:

```ts
const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_VIDEO_DURATION_SECONDS = 60;

function isVideoFile(file: File): boolean {
  return VIDEO_CONTENT_TYPES.has(file.type);
}

// Pure and unit-testable in isolation from the real (unmockable-in-jsdom)
// video-duration-reading step below.
function exceedsMaxVideoDuration(durationSeconds: number): boolean {
  return durationSeconds > MAX_VIDEO_DURATION_SECONDS;
}
```

- [ ] **Step 3: Add the (browser-only, manually-verified) duration read and poster capture**

Still in `GuestUploadView.tsx`:

```ts
// Reads a video File's duration by loading it into a detached <video> element.
// Not unit-testable under jsdom (no real media decoding) — verified manually
// per the video-support design spec's Testing section.
function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("could not read video duration"));
    };
    video.src = URL.createObjectURL(file);
  });
}

// Captures a frame from a video File as a JPEG File, for use as the poster.
// Same jsdom limitation as above — canvas drawImage/toBlob needs a real
// browser. Verified manually.
function capturePosterFrame(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadeddata = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(video.src);
        reject(new Error("could not get canvas context"));
        return;
      }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(video.src);
        if (!blob) {
          reject(new Error("could not capture poster frame"));
          return;
        }
        resolve(new File([blob], "poster.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.85);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("could not load video for poster capture"));
    };
    video.src = URL.createObjectURL(file);
  });
}
```

- [ ] **Step 4: Add the rejection translation key**

In `messages/en.json` and `messages/es.json`, under `invitations.public.memories.upload`, add alongside the existing `heicError` key:

en.json: `"videoTooLongError": "Videos can be up to 60 seconds — please trim your clip and try again."`
es.json: `"videoTooLongError": "Los videos pueden durar hasta 60 segundos — recorta tu clip e inténtalo de nuevo."`

(Check the exact existing indentation/nesting of the `upload` block in both files before editing, and match it precisely — do not reformat surrounding keys.)

- [ ] **Step 5: Update `uploadOne` to send the right `mediaKind` and upload both files for video**

Replace the current `uploadOne` function:

```ts
async function uploadOne(eventId: string, file: File, onProgress: (percent: number) => void): Promise<{ mediaId: string }> {
  const initRes = await fetch(`/api/memories/events/${eventId}/upload/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaKind: "photo", contentType: file.type, sizeBytes: file.size }),
  });
  ...
```

with a version that takes `posterFile` and derives `mediaKind` from `file.type`:

```ts
async function uploadOne(eventId: string, file: File, posterFile: File | undefined, onProgress: (percent: number) => void): Promise<{ mediaId: string }> {
  const mediaKind = isVideoFile(file) ? "video" : "photo";
  const initRes = await fetch(`/api/memories/events/${eventId}/upload/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaKind, contentType: file.type, sizeBytes: file.size }),
  });
  if (!initRes.ok) {
    if (initRes.status === 429) throw new Error(ERROR_QUOTA);
    if (initRes.status === 404) throw new Error(ERROR_WINDOW_CLOSED);
    throw new Error(ERROR_GENERIC);
  }
  const { mediaId, ticket, uploadUrl, posterUploadUrl } = await initRes.json();

  async function putFile(url: string, body: File, trackProgress: boolean): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("content-type", body.type);
      if (trackProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100));
        });
      }
      xhr.addEventListener("error", () => reject(new Error("upload failed")));
      xhr.addEventListener("load", () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload failed")));
      xhr.send(body);
    });
  }

  await putFile(uploadUrl, file, true);
  if (mediaKind === "video" && posterFile && posterUploadUrl) {
    await putFile(posterUploadUrl, posterFile, false);
  }

  const completeRes = await fetch(`/api/memories/events/${eventId}/upload/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaId, ticket }),
  });
  if (!completeRes.ok) throw new Error("upload completion failed");
  return { mediaId };
}
```

- [ ] **Step 6: Update `createUploadQueue`'s call site and `handleFiles`**

Change:

```ts
const queue = createUploadQueue(eventId, (file, onProgress) => uploadOne(eventId, file, onProgress));
```

to:

```ts
const queue = createUploadQueue(eventId, (file, posterFile, onProgress) => uploadOne(eventId, file, posterFile, onProgress));
```

Change `handleFiles` from:

```ts
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !queueRef.current) return;
    setRejectionError(null);
    for (const file of Array.from(fileList)) {
      if (UNSUPPORTED_TYPES.has(file.type)) {
        setRejectionError(t("heicError"));
        continue;
      }
      const id = await queueRef.current.enqueue(file);
      previewsRef.current.set(id, URL.createObjectURL(file));
      publishItems(queueRef.current.getItems());
    }
    if (inputRef.current) inputRef.current.value = "";
  }
```

to:

```ts
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !queueRef.current) return;
    setRejectionError(null);
    for (const file of Array.from(fileList)) {
      if (UNSUPPORTED_TYPES.has(file.type)) {
        setRejectionError(t("heicError"));
        continue;
      }
      if (isVideoFile(file)) {
        try {
          const duration = await readVideoDurationSeconds(file);
          if (exceedsMaxVideoDuration(duration)) {
            setRejectionError(t("videoTooLongError"));
            continue;
          }
          const poster = await capturePosterFrame(file);
          const id = await queueRef.current.enqueue(file, poster);
          previewsRef.current.set(id, URL.createObjectURL(file));
          publishItems(queueRef.current.getItems());
        } catch {
          setRejectionError(t("genericError"));
        }
        continue;
      }
      const id = await queueRef.current.enqueue(file);
      previewsRef.current.set(id, URL.createObjectURL(file));
      publishItems(queueRef.current.getItems());
    }
    if (inputRef.current) inputRef.current.value = "";
  }
```

- [ ] **Step 7: Widen the file input**

Change:

```tsx
<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
```

to:

```tsx
<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd src/components/invitations/memories && npx tsx --test GuestUploadView.test.tsx`
Expected: all PASS.

- [ ] **Step 9: Run the full memories component and lib test sweep**

```bash
npx tsx --test 'src/lib/invitations/memories/**/*.test.ts' 'src/components/invitations/memories/**/*.test.tsx'
```

Expected: all PASS — this confirms Task 4's queue change and this task's usage of it agree.

- [ ] **Step 10: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (this should now be clean — Task 4's Step 5 noted expected errors here, which this task's changes resolve).

- [ ] **Step 11: Commit**

```bash
git add src/components/invitations/memories/GuestUploadView.tsx src/components/invitations/memories/GuestUploadView.test.tsx messages/en.json messages/es.json
git commit -m "feat(memories-video): capture a poster frame and enqueue video uploads from the guest picker"
```

---

### Task 6: Video-aware moderation (poster-frame based)

**Files:**
- Modify: `src/app/api/memories/moderate/route.ts`
- Test: `src/app/api/memories/moderate/moderate-route.test.ts` (check the exact existing filename first — this route already has tests from Plan A/B)

**Interfaces:**
- Consumes: `media.mediaKind`, `media.objectKeyThumbnail` (already on `MemoryMedia`, now reliably populated for video by Task 3).
- Produces: no new interface — internal branching only.

- [ ] **Step 1: Read the current route and its existing test file in full**

```bash
cat src/app/api/memories/moderate/route.ts
ls src/app/api/memories/moderate/
```

- [ ] **Step 2: Write the failing tests**

Following the existing test file's exact dependency-injection/mocking seam:

```ts
test("a video item is moderated using its poster (objectKeyThumbnail), not the moderation-derivative key", async () => {
  // Mock getMemoryMediaById to return a video-kind row with a known objectKeyThumbnail.
  // Assert storage.getSignedDownloadUrl (or however the download key is threaded through
  // in this file's existing mocking seam) is called with objectKeyThumbnail's value,
  // not deriveObjectKeys(...).moderation.
});

test("a video item without a thumbnail key fails moderation with a clear error, not a crash", async () => {
  // Mock getMemoryMediaById to return a video-kind row with objectKeyThumbnail: null
  // (should not happen given Task 3's HEAD check, but this route must not assume it).
  const response = await POST(request);
  assert.equal(response.status, 500); // or whatever this route's existing error-shape convention is — match it
});

test("a photo item still uses deriveObjectKeys(...).moderation, unchanged", async () => {
  // Existing photo behavior must be untouched.
});
```

- [ ] **Step 2b: Run to verify these fail**

Run from this route's own directory. Expected: FAIL — the route currently always uses `deriveObjectKeys(media.eventId, media.id).moderation`.

- [ ] **Step 3: Branch on `mediaKind`**

In `route.ts`, the current logic is:

```ts
    const moderationKey = deriveObjectKeys(media.eventId, media.id).moderation;
    const downloadUrl = await storage.getSignedDownloadUrl(moderationKey, 60);
```

Change to:

```ts
    const moderationKey = media.mediaKind === "video" ? media.objectKeyThumbnail : deriveObjectKeys(media.eventId, media.id).moderation;
    if (!moderationKey) {
      throw new Error(`no moderation-input key available for ${media.mediaKind} media ${media.id}`);
    }
    const downloadUrl = await storage.getSignedDownloadUrl(moderationKey, 60);
```

(This throws into the route's existing surrounding `try`/`catch`, which already returns a 500 with a logged error for any failure in this block — check the actual current try/catch boundaries before editing to confirm this throw lands inside them the same way the existing code's failures do.)

Everything after this point in the route (the `DetectModerationLabels` call, `updateMemoryMediaModeration`, and the subsequent best-effort `DetectLabels`/`upsertMemoryMediaDescriptor`/`requestHighlightGeneration` block) is already generic over `mediaKind` and needs no changes — confirm this by reading the rest of the route, not by assuming it.

- [ ] **Step 4: Run the tests to verify they pass**

Run from this route's own directory. Expected: all PASS.

- [ ] **Step 5: Full typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/memories/moderate/
git commit -m "feat(memories-video): moderate and describe video via its poster frame"
```

---

### Task 7: MediaLightbox video playback and gesture support

**Files:**
- Modify: `src/components/invitations/memories/MediaLightbox.tsx`
- Test: `src/components/invitations/memories/MediaLightbox.test.tsx` (check if a `.tsx` test exists alongside the pure-logic `MediaLightbox.test.ts` — if only the `.ts` one exists, this task creates the `.tsx` component-level test file, following `GuestGalleryView.test.tsx`'s JSDOM+`react-dom/client` harness)

**Interfaces:**
- Consumes: `PublicMemoryMedia.mediaKind` (already present).
- No exported interface changes — `MediaLightboxProps` is unchanged.

- [ ] **Step 1: Read the current `MediaLightbox.tsx` in full**

It currently always renders a single `<img>` with `onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel` handlers for swipe support. Re-read it live before editing (it has been through several rounds of changes this session).

- [ ] **Step 2: Write the failing tests**

Following the harness pattern in `GuestGalleryView.test.tsx` (JSDOM, `react-dom/client`, `act`, the `quietVirtualConsole`/`polyfillAnimationFrame` helpers already established in that file — this new test file should copy those same two helpers, since `MediaLightbox` uses both `window.scrollTo`-adjacent... actually check: does `MediaLightbox` itself call `scrollTo`? Re-verify against the current file rather than assuming; it does use `requestAnimationFrame` for its slide sequencing, so `polyfillAnimationFrame` is needed regardless):

```ts
test("a video item renders a <video controls> element with the display URL, not an <img>", async () => {
  // Mount MediaLightbox with media: [{ id: "m1", mediaKind: "video", ... }], index: 0.
  const videoEl = dom.window.document.querySelector("video");
  assert.ok(videoEl, "expected a <video> element for a video item");
  assert.equal(videoEl!.getAttribute("src"), "/api/memories/media/m1/display");
  assert.ok(videoEl!.hasAttribute("controls"));
  assert.ok(!dom.window.document.querySelector("img"), "expected no <img> for a video item");
});

test("a photo item still renders an <img>, unchanged", async () => {
  // Mount with media: [{ id: "m1", mediaKind: "photo", ... }], index: 0.
  assert.ok(dom.window.document.querySelector("img"));
  assert.ok(!dom.window.document.querySelector("video"));
});

test("swipe navigation still advances the index when moving from a photo to a video item in the same list", async () => {
  // Mount with media: [photo m1, video m2], index: 0. Simulate the pointer
  // sequence this file's own resolveSwipeNavigation-driven tests already use
  // (check MediaLightbox.test.ts for the exact pattern) to trigger a leftward
  // swipe, then assert the video's <video> element is now present at index 1.
});
```

- [ ] **Step 2b: Run to verify these fail**

Run: `cd src/components/invitations/memories && npx tsx --test MediaLightbox.test.tsx`
Expected: FAIL (or file not found, if newly created) — the component always renders `<img>` today.

- [ ] **Step 3: Branch the rendered element on `mediaKind`**

In `MediaLightbox.tsx`, find the current `<img>` element (it has `onClick`, `onPointerDown/Move/Up/Cancel`, and the `style`/`className` for the drag transform). Replace it with a branch that renders `<video controls>` for a video item, keeping the exact same pointer handlers and transform style on both:

```tsx
{item.mediaKind === "video" ? (
  <video
    src={`/api/memories/media/${item.id}/display`}
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
```

(Drop `select-none` from the video element specifically — native video controls need normal text/pointer selection behavior for their scrubber and buttons; keep it on `<img>`. Re-check the exact current prop values on the existing `<img>` — e.g. the precise `SETTLE_TRANSITION`/`isDragging`/`suppressTransition` variable names — against the live file rather than trusting this snippet verbatim, since `MediaLightbox.tsx` has been rewritten multiple times this session.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/components/invitations/memories && npx tsx --test MediaLightbox.test.tsx MediaLightbox.test.ts`
Expected: all PASS (both the new component test and the pre-existing pure-logic test).

- [ ] **Step 5: Full typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/components/invitations/memories/MediaLightbox.tsx src/components/invitations/memories/MediaLightbox.test.tsx
git commit -m "feat(memories-video): play video in the shared lightbox instead of a static image"
```

---

### Task 8: Grid play-badges, and final verification of the "no changes needed" claims

**Files:**
- Modify: `src/components/invitations/memories/GuestGalleryView.tsx`
- Modify: `src/components/invitations/memories/GuestMomentsView.tsx`
- Modify: `src/components/invitations/memories/GuestAiHighlightView.tsx`
- Test: each component's existing test file (`GuestGalleryView.test.tsx`, and create/extend equivalents for the other two if they exist — check first)
- Verify (no code change expected, but must be proven, not assumed): `src/app/api/memories/media/[mediaId]/[variant]/route.ts`, `src/app/api/invitations/events/[eventId]/memories/media/[mediaId]/[variant]/route.ts`, `src/components/invitations/memories/OwnerMemoriesReviewQueue.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–7. This is the plan's integration task.

- [ ] **Step 1: Write the failing play-badge tests for all three grid components**

For each of `GuestGalleryView.test.tsx`, and the equivalent for `GuestMomentsView`/`GuestAiHighlightView` (check whether test files exist for the latter two — `GuestAiHighlightView.test.tsx` does per earlier work this session; check `GuestMomentsView.test.tsx` and create it following the same harness if missing), add:

```ts
test("a video item's thumbnail shows a play-badge overlay; a photo item's does not", async () => {
  // Mount with one photo item and one video item (mediaKind on each).
  // Assert a play-badge marker (e.g. an element with aria-hidden="true" and a
  // data attribute or class specific to the badge — pick one concrete,
  // queryable marker when implementing Step 2, and assert on that exact marker)
  // is present for the video item's thumbnail and absent for the photo item's.
});
```

- [ ] **Step 1b: Run to verify these fail**

Run each from its own file location (bracket-glob-safe as established). Expected: FAIL — no play-badge exists yet in any of the three.

- [ ] **Step 2: Add the play-badge overlay to each grid component**

In each of the three files, find where the thumbnail `<img>` is rendered per item (already generic per-item markup in all three, per this session's earlier work on masonry/grid layouts). Wrap it so a small centered play icon overlays it when `item.mediaKind === "video"` (or `group.media[0].mediaKind === "video"` for the AI Highlight cover-tile case — check which variable holds the per-item media object in each specific file, they differ slightly between the three). Use `lucide-react`'s `Play` icon (already a dependency, used elsewhere in this module):

```tsx
import { Play } from "lucide-react";

// ...wherever the thumbnail <img> is rendered per item:
<div className="relative">
  <img src={...} alt="" className={...} />
  {item.mediaKind === "video" && (
    <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
      <span className="grid size-9 place-items-center rounded-full bg-black/45 text-white">
        <Play className="size-4 fill-current" />
      </span>
    </span>
  )}
</div>
```

(The exact wrapping structure must match each file's existing layout classes — e.g. if the `<img>` is already inside a `<figure>` with `relative`/`overflow-hidden` positioning, don't add a redundant wrapping `<div>`; if it isn't positioned relatively yet, the parent needs `relative` added. Read each file's actual current JSX around its thumbnail render before editing — do not apply an identical diff blindly across all three, since their surrounding markup differs.)

- [ ] **Step 3: Run each component's tests to verify they pass**

Run each from its own location. Expected: all PASS.

- [ ] **Step 4: Verify the media-serving routes need no changes**

Read both `src/app/api/memories/media/[mediaId]/[variant]/route.ts` and `src/app/api/invitations/events/[eventId]/memories/media/[mediaId]/[variant]/route.ts` in full. Confirm both resolve `objectKeyDisplay`/`objectKeyThumbnail` generically off the `memory_media` row with no `mediaKind`-specific branching anywhere in either file. If either file's existing test suite doesn't already cover a video-kind row, add one test to each confirming a video-kind row's `display`/`thumbnail` variants resolve to the keys Task 3 sets (the original video, and the poster, respectively) — following each file's own existing test pattern. If this verification finds either route actually *does* need a change (the spec's claim turns out wrong once checked against the real, current file), fix it here and document why the spec was incomplete, rather than silently working around it.

- [ ] **Step 5: Verify the host review queue needs no changes**

Read `OwnerMemoriesReviewQueue.tsx` in full (already shown once during this plan's own research — re-read live). Confirm its thumbnail rendering (`item.objectKeyThumbnail && <img src={...}/thumbnail}>`) is genuinely generic over `mediaKind` with no branching needed. If there's an existing test file for this component, add one test confirming a video-kind item in any list renders its poster thumbnail via the same generic path a photo does. If none exists, this verification can be a manual code-reading confirmation recorded in the task's completion report — do not invent a new test harness for this component if this plan's earlier tasks found no precedent for testing it.

- [ ] **Step 6: Full repository-wide test sweep**

```bash
npx tsx --test 'src/**/*.test.ts' 'src/**/*.test.tsx'
```

Expected: every test passes (including everything from Tasks 1–7 and pre-existing tests elsewhere in the repo — this is the first point in the plan where the *whole* repo's tests run together, not just this feature's own files).

- [ ] **Step 7: Full production build**

```bash
rm -rf .next && npm run build
```

Expected: `✓ Compiled successfully`, clean lint/type-check. This is the final, decisive check — `tsc --noEmit` alone has proven insufficient for this exact class of bug (non-handler exports from `route.ts` files) twice already in this codebase.

- [ ] **Step 8: Repo-wide sweep for the route.ts non-handler-export bug class**

```bash
grep -rL "export async function GET\|export async function POST\|export async function PATCH\|export async function DELETE\|export const dynamic" $(find src/app/api -name "route.ts") 2>/dev/null
```

This should print nothing new relative to before this plan started (any `route.ts` this plan touched — `upload/init`, `upload/complete`, `moderate` — must still only export HTTP handlers and config constants). If a repository-wide sweep script already exists from an earlier plan in this codebase (check `.superpowers/sdd/` history or search for one), prefer running that instead of this ad-hoc grep.

- [ ] **Step 9: Commit**

```bash
git add src/components/invitations/memories/GuestGalleryView.tsx src/components/invitations/memories/GuestMomentsView.tsx src/components/invitations/memories/GuestAiHighlightView.tsx src/components/invitations/memories/GuestGalleryView.test.tsx src/components/invitations/memories/GuestMomentsView.test.tsx src/components/invitations/memories/GuestAiHighlightView.test.tsx
git commit -m "feat(memories-video): show a play-badge for video thumbnails across every grid; verify no other surface needs a change"
```
